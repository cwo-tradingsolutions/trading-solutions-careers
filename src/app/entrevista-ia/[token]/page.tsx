"use client";

/**
 * /entrevista-ia/[token]
 *
 * Página candidate-facing de la entrevista por voz con IA.
 * Embebe el widget oficial de ElevenLabs Conversational AI.
 *
 * Flujo:
 *   1. Valida el token con GET /api/headhunting/ai-interview/[token]
 *   2. Pantalla de bienvenida + reglas
 *   3. Pantalla de Habeas Data + consentimiento de grabación
 *   4. Candidato acepta → carga widget de ElevenLabs
 *   5. Widget hace la conversación (15-20 min)
 *   6. Al terminar, llama a /finalize → Claude scoring
 *   7. Pantalla de "Gracias"
 */
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Script from "next/script";
import { invalidLinkBoth, loadRetryBoth } from "@/lib/candidate-invalid-link";
import { CANDIDATE_MAIL } from "@/lib/candidate-public-error";

type Phase = "loading" | "welcome" | "consent" | "live" | "processing" | "timeout" | "disabled" | "ended" | "error";

type Config = {
  interview_id: string;
  candidate: { id: string; name: string; email: string };
  vacancy: { title: string; area: string } | null;
  client: { name: string };
  agent_id: string | null;
  signed_url: string | null;
  dynamic_variables: Record<string, string>;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "agent-id"?: string;
          "signed-url"?: string;
          "dynamic-variables"?: string;
          variant?: string;
        },
        HTMLElement
      >;
    }
  }
}

export default function AiInterviewPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [phase, setPhase] = useState<Phase>("loading");
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [habeasChecked, setHabeasChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/headhunting/ai-interview/${token}`, { cache: "no-store" });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          if (!cancelled) {
            setError(
              r.status >= 500
                ? loadRetryBoth()
                : j.error === "already_completed"
                ? `Ya completaste esta entrevista. Si necesitas ayuda, escríbenos a ${CANDIDATE_MAIL}. You already completed this interview. If you need help, write to us at ${CANDIDATE_MAIL}.`
                : invalidLinkBoth()
            );
            setPhase("error");
          }
          return;
        }
        const j = await r.json();
        if (!cancelled) {
          setConfig(j);
          if (!j.agent_id) {
            setError("Configuración del agente incompleta. Contacta a jointheteam@tradingsolutions.com");
            setPhase("error");
          } else {
            setPhase("welcome");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(loadRetryBoth());
          setPhase("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // ─── Captura robusta del conversation_id ────────────────────────────
  // El widget emite el conversation_id en distintos lugares según versión:
  //   · message event con data.conversation_id (formato viejo)
  //   · message event con data.detail.conversation_id
  //   · message event con data.payload.conversation_id
  //   · custom event 'convai-conversation-started' en el elemento <elevenlabs-convai>
  //   · custom event 'elevenlabs-convai:call' con .detail.conversation_id
  // Capturamos en TODOS los lugares y guardamos en ref para usarlo al finalize.
  const conversationIdRef = React.useRef<string | null>(null);
  const mountedRef = React.useRef(true);
  React.useEffect(() => () => { mountedRef.current = false; }, []);

  // Helper para extraer conversation_id de cualquier objeto recursivamente
  function extractConversationId(obj: any, depth = 0): string | null {
    if (!obj || depth > 4) return null;
    if (typeof obj === 'string' && /^conv_[a-zA-Z0-9]{10,}$/.test(obj)) return obj;
    if (typeof obj !== 'object') return null;
    // Direct keys
    for (const k of ['conversation_id', 'conversationId', 'conversation-id', 'convId', 'conv_id', 'id']) {
      const v = obj[k];
      if (typeof v === 'string' && /^conv_[a-zA-Z0-9]{10,}$/.test(v)) return v;
    }
    // Recurse into nested objects
    for (const k of ['detail', 'payload', 'data', 'event', 'meta', 'message']) {
      const v = obj[k];
      if (v && typeof v === 'object') {
        const found = extractConversationId(v, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  useEffect(() => {
    function captureId(payload: any) {
      const id = extractConversationId(payload);
      if (id && id !== conversationIdRef.current) {
        conversationIdRef.current = id;
        fetch(`/api/headhunting/ai-interview/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: id }),
        }).catch(() => {});
      }
    }

    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data) return;
      // Siempre intentar capturar el ID, sin importar el tipo de evento
      captureId(data);
      // Detectar el fin de llamada
      const t = (data.type || data.event || data.name || '').toString().toLowerCase();
      const isEnded = /call.?ended|conversation.?ended|call.?end|conversation.?end/.test(t);
      if (isEnded) {
        finalizeInterview(extractConversationId(data) || conversationIdRef.current);
      }
    }

    function onCustomEvent(e: Event) {
      const ce = e as CustomEvent;
      captureId(ce.detail || (e as any));
      const t = e.type.toLowerCase();
      if (/end|complete|finish/.test(t)) {
        finalizeInterview(extractConversationId(ce.detail) || conversationIdRef.current);
      }
    }

    window.addEventListener('message', onMessage);
    // Eventos del widget custom element
    const widgetEvents = [
      'convai-call-started', 'convai-call-ended', 'convai-conversation-started', 'convai-conversation-ended',
      'elevenlabs-convai:call', 'elevenlabs-convai:end',
      'call-started', 'call-ended', 'conversation-started', 'conversation-ended',
    ];
    widgetEvents.forEach(ev => window.addEventListener(ev, onCustomEvent));
    document.addEventListener('convai-conversation-id', onCustomEvent);

    return () => {
      window.removeEventListener('message', onMessage);
      widgetEvents.forEach(ev => window.removeEventListener(ev, onCustomEvent));
      document.removeEventListener('convai-conversation-id', onCustomEvent);
    };
  }, []);

  async function finalizeInterview(conversationId: string | null) {
    setPhase("processing");
    let finalId = conversationId || conversationIdRef.current;
    if (!finalId) {
      const widget: any = document.querySelector('elevenlabs-convai');
      if (widget) {
        finalId = widget.getAttribute('conversation-id') ||
                  widget.getAttribute('data-conversation-id') ||
                  widget.conversationId ||
                  null;
      }
    }
    if (finalId && finalId !== conversationIdRef.current) {
      conversationIdRef.current = finalId;
      fetch(`/api/headhunting/ai-interview/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: finalId }),
      }).catch(() => {});
    }
    const started = Date.now();
    const budgetMs = 2 * 60 * 1000;
    let waitMs = 0;
    let failures = 0;
    const stop = () => {
      if (mountedRef.current) setPhase("timeout");
    };
    while (Date.now() - started <= budgetMs) {
      if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
      waitMs = 5000;
      if (!mountedRef.current) return;
      try {
        const r = await fetch(`/api/headhunting/ai-interview/${token}/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: finalId }),
        });
        if (!mountedRef.current) return;
        if (r.status === 503) {
          if (mountedRef.current) setPhase("disabled");
          return;
        }
        if (r.status === 429) {
          stop();
          return;
        }
        if (r.status >= 400) {
          failures += 1;
          if (failures >= 2) {
            stop();
            return;
          }
          continue;
        }
        failures = 0;
        const j = await r.json().catch(() => ({}));
        if (j.status === "completed" || j.status === "needs_review") {
          setPhase("ended");
          return;
        }
      } catch (e) {
        console.error("finalize failed:", e);
        failures += 1;
        if (failures >= 2) {
          stop();
          return;
        }
      }
    }
    stop();
  }

  // ─── Render ────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div style={shell}>
        <div style={card}>
          <p style={{ textAlign: "center", color: "#6b7280" }}>Cargando entrevista…</p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={shell}>
        <div style={card}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#dc2626" }}>No se puede continuar</h1>
          <p style={{ marginTop: 12, color: "#374151" }}>{error}</p>
        </div>
      </div>
    );
  }

  if (phase === "processing") {
    return (
      <div style={shell}>
        <div style={card}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Estamos procesando tu entrevista / We're processing your interview</h1>
          <p style={{ color: "#374151", lineHeight: 1.6 }}>
            Puedes dejar esta ventana abierta. / You can leave this window open.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "disabled") {
    return (
      <div style={shell}>
        <div style={card}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>La entrevista por voz no está disponible / The voice interview is not available</h1>
          <p style={{ color: "#374151", lineHeight: 1.6 }}>
            Talent Acquisition te contactará. / Talent Acquisition will contact you.
          </p>
          <p style={{ marginTop: 12, color: "#374151", lineHeight: 1.6 }}>
            Puedes cerrar esta ventana. / You can close this window.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "timeout") {
    return (
      <div style={shell}>
        <div style={card}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Seguimos procesando tu entrevista / We're still processing your interview</h1>
          <p style={{ color: "#374151", lineHeight: 1.6 }}>
            Talent Acquisition te contactará. / Talent Acquisition will contact you.
          </p>
          <p style={{ marginTop: 12, color: "#374151", lineHeight: 1.6 }}>
            Puedes cerrar esta ventana. / You can close this window.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div style={shell}>
        <div style={card}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>¡Entrevista completada!</h1>
          <p style={{ color: "#374151", lineHeight: 1.6 }}>
            Gracias por tu tiempo, <strong>{config?.candidate.name?.split(" ")[0]}</strong>. Estamos analizando tu entrevista.
          </p>
          <p style={{ marginTop: 12, color: "#374151", lineHeight: 1.6 }}>
            Talent Acquisition Team te contactará en los próximos <strong>2-3 días hábiles</strong> con la siguiente etapa del proceso.
          </p>
          <p style={{ marginTop: 24, fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
            Puedes cerrar esta ventana.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "welcome") {
    return (
      <div style={shell}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={logoBox}>TS</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.5 }}>TRADING SOLUTIONS</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Entrevista por voz con IA</div>
            </div>
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
            Hola, {config?.candidate.name?.split(" ")[0]}
          </h1>
          <p style={{ color: "#374151", lineHeight: 1.6 }}>
            Vas a tener una conversación con nuestra recruiter virtual sobre la posición de{" "}
            <strong>{config?.vacancy?.title}</strong>.
          </p>

          <h3 style={{ marginTop: 24, marginBottom: 8, fontSize: 13, textTransform: "uppercase", color: "#6b7280", letterSpacing: 0.5 }}>
            Antes de empezar
          </h3>
          <ul style={{ paddingLeft: 20, color: "#374151", lineHeight: 1.7 }}>
            <li>Ponte audífonos si tienes</li>
            <li>Busca un espacio tranquilo, sin interrupciones</li>
            <li>Habla con naturalidad — la IA escucha en tiempo real</li>
            <li>Responde con ejemplos concretos (situaciones reales)</li>
            <li>Habrá una sección corta en inglés al final</li>
            <li>Duración total: <strong>15-20 minutos</strong></li>
            <li>Una sola oportunidad — termina la entrevista de un tirón</li>
          </ul>

          <button
            onClick={() => setPhase("consent")}
            style={primaryBtn(false)}
          >
            Continuar →
          </button>
        </div>
      </div>
    );
  }

  if (phase === "consent") {
    const allChecked = consentChecked && habeasChecked;
    return (
      <div style={shell}>
        <div style={card}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            Antes de iniciar — autorización
          </h1>
          <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
            Por favor lee y acepta para continuar.
          </p>

          {/* Habeas Data */}
          <div style={consentBox}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#1a1a1a" }}>
              📋 Tratamiento de datos personales (Habeas Data)
            </h3>
            <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
              Conforme a la <strong>Ley 1581 de 2012</strong> de Colombia y demás normas concordantes, autorizo a{" "}
              <strong>Trading Solutions S.A.S.</strong> al tratamiento de mis datos personales (incluida mi voz, transcripción y respuestas)
              con la finalidad de evaluar mi candidatura para la posición de{" "}
              <strong>{config?.vacancy?.title}</strong>. Los datos serán almacenados de forma segura, no se compartirán con terceros sin mi consentimiento expreso, y podré ejercer mis derechos de
              acceso, rectificación, actualización y supresión escribiendo a{" "}
              <a href="mailto:jointheteam@tradingsolutions.com" style={{ color: "#2C64ED" }}>
                jointheteam@tradingsolutions.com
              </a>.
            </p>
            <label style={checkboxLabel}>
              <input
                type="checkbox"
                checked={habeasChecked}
                onChange={(e) => setHabeasChecked(e.target.checked)}
                style={{ marginRight: 8, width: 18, height: 18, cursor: "pointer" }}
              />
              <span>Acepto el tratamiento de mis datos personales según los términos arriba descritos.</span>
            </label>
          </div>

          {/* Grabación */}
          <div style={consentBox}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#1a1a1a" }}>
              🎤 Consentimiento de grabación y procesamiento por IA
            </h3>
            <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
              Esta entrevista será <strong>grabada en audio</strong> y la conversación será procesada por sistemas de inteligencia artificial
              (ElevenLabs Conversational AI para la voz, y Anthropic Claude para el análisis posterior). La transcripción y el audio se usarán
              <strong> únicamente para el proceso de selección de Trading Solutions</strong> y serán evaluados por personal humano antes de cualquier decisión.
              No se utilizará la grabación para ningún otro propósito sin mi autorización adicional.
            </p>
            <label style={checkboxLabel}>
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                style={{ marginRight: 8, width: 18, height: 18, cursor: "pointer" }}
              />
              <span>Autorizo la grabación y el procesamiento por IA de esta entrevista.</span>
            </label>
          </div>

          <button
            onClick={() => allChecked && setPhase("live")}
            disabled={!allChecked}
            style={primaryBtn(!allChecked)}
          >
            🎤 Iniciar entrevista
          </button>
          <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 12 }}>
            Al iniciar, tu navegador te pedirá permiso para usar el micrófono.
          </p>
        </div>
      </div>
    );
  }

  // phase === "live" — render the ElevenLabs widget
  return (
    <div style={shell}>
      <Script
        src="https://unpkg.com/@elevenlabs/convai-widget-embed"
        strategy="afterInteractive"
        type="text/javascript"
      />
      <div style={{ ...card, maxWidth: 600 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={logoBox}>TS</div>
          <div>
            <div style={{ fontWeight: 700 }}>Entrevista en curso</div>
            <div style={{ fontSize: 11, color: "#10b981" }}>● Conectado con Valeria</div>
          </div>
        </div>

        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
          Habla con naturalidad. La IA está escuchando. Para terminar, presiona el botón rojo dentro del widget.
        </p>

        {/* ElevenLabs widget */}
        <div style={{ minHeight: 400 }}>
          {config?.signed_url ? (
            <elevenlabs-convai
              signed-url={config.signed_url}
              dynamic-variables={JSON.stringify(config.dynamic_variables)}
            />
          ) : (
            <elevenlabs-convai
              agent-id={config?.agent_id || ""}
              dynamic-variables={JSON.stringify(config?.dynamic_variables || {})}
            />
          )}
        </div>

        <button
          onClick={() => finalizeInterview(null)}
          style={{
            marginTop: 20,
            width: "100%",
            padding: "12px",
            borderRadius: 8,
            border: "1.5px solid #dc2626",
            color: "#dc2626",
            background: "transparent",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          He terminado la entrevista
        </button>
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #f5f5f5 0%, #ebebeb 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
};

const card: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  padding: 36,
  maxWidth: 560,
  width: "100%",
  boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
};

const logoBox: React.CSSProperties = {
  width: 40,
  height: 40,
  background: "#1a1a1a",
  color: "white",
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
  fontSize: 13,
};

const consentBox: React.CSSProperties = {
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 16,
  marginBottom: 14,
};

const checkboxLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  marginTop: 10,
  cursor: "pointer",
  fontSize: 12,
  color: "#1a1a1a",
  fontWeight: 600,
  lineHeight: 1.4,
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 24,
    padding: 16,
    background: disabled ? "#9ca3af" : "#1a1a1a",
    color: "white",
    border: "none",
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 15,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
