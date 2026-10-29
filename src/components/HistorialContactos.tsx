"use client";

/**
 * HISTORIAL DE CONTACTOS · en la ficha del candidato
 *
 * Todo lo que se habló con esta persona, en orden: correos (leídos de Gmail),
 * WhatsApp (importado del chat), llamadas y conversaciones anotadas a mano, y
 * los cambios de etapa, para ver qué pasó entre un mensaje y otro.
 *
 * Cada fila dice de dónde salió. No es lo mismo un correo leído de la bandeja
 * que un contacto que alguien anotó, ni un WhatsApp del chat exportado que un
 * clic en el botón del ATS: lo primero está verificado, lo segundo es la
 * palabra de alguien, lo tercero es un intento.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Linea =
  | {
      tipo: "contacto";
      id: string;
      at: string;
      channel: "email" | "whatsapp" | "llamada" | "presencial" | "otro";
      direction: "saliente" | "entrante";
      kind: string | null;
      summary: string | null;
      body: string | null;
      source: string;
      status: string;
      thread_id: string | null;
    }
  | { tipo: "etapa"; id: string; at: string; from_stage: string | null; to_stage: string; source: string | null };

const CANAL: Record<string, { icono: string; nombre: string }> = {
  email: { icono: "✉", nombre: "Correo" },
  whatsapp: { icono: "💬", nombre: "WhatsApp" },
  llamada: { icono: "📞", nombre: "Llamada" },
  presencial: { icono: "🤝", nombre: "Presencial" },
  otro: { icono: "•", nombre: "Otro" },
};

const ORIGEN: Record<string, string> = {
  gmail_sync: "Gmail",
  whatsapp_export: "chat importado",
  whatsapp_boton: "botón del ATS · sin confirmar",
  manual: "anotado a mano",
  sistema: "ATS",
};

const TIPO: Record<string, string> = {
  rechazo: "Rechazo",
  invitacion_prueba: "Invitación a la prueba",
  recordatorio_prueba: "Recordatorio de la prueba",
  prefiltro: "Prefiltro",
  acuse: "Acuse de aplicación",
  entrevista: "Entrevista",
  bienvenida: "Bienvenida",
  respuesta: "Respuesta del candidato",
  respuesta_nuestra: "Respuesta nuestra",
};

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
}

/** datetime-local espera hora local sin zona. */
function ahoraLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function HistorialContactos({ candidateId }: { candidateId: string }) {
  const [linea, setLinea] = useState<Linea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [gmailRevisado, setGmailRevisado] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todo" | "email" | "whatsapp" | "otros" | "etapas">("todo");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "anotar" | "whatsapp">(null);

  const cargar = useCallback(
    async () => {
      setCargando(true);
      setError("");
      try {
        // sync=0: el preview bloquea el GET que llama a Gmail y escribe.
        const r = await fetch(`/api/admin/candidates/${candidateId}/contactos?sync=0`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "No se pudo cargar el historial");
        setLinea(j.linea || []);
        setGmailRevisado(j.gmail_revisado || null);
        if (j.sync && !j.sync.ok) setError(`Gmail no se pudo revisar: ${j.sync.error}`);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setCargando(false);
      }
    },
    [candidateId],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(
    () =>
      linea.filter((l) => {
        if (filtro === "todo") return true;
        if (filtro === "etapas") return l.tipo === "etapa";
        if (l.tipo !== "contacto") return false;
        if (filtro === "otros") return !["email", "whatsapp"].includes(l.channel);
        return l.channel === filtro;
      }),
    [linea, filtro],
  );

  const contactos = linea.filter((l) => l.tipo === "contacto") as Extract<Linea, { tipo: "contacto" }>[];
  const confirmados = contactos.filter((c) => c.status !== "intento");
  const ultEnt = confirmados.find((c) => c.direction === "entrante");
  const ultSal = confirmados.find((c) => c.direction === "saliente");
  const esperando = ultEnt && (!ultSal || new Date(ultEnt.at) > new Date(ultSal.at));

  return (
    <div className="space-y-2">
      {/* Resumen */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span>
          <b className="text-gray-900">{confirmados.length}</b> contactos ·{" "}
          {confirmados.filter((c) => c.channel === "email").length} correos ·{" "}
          {confirmados.filter((c) => c.channel === "whatsapp").length} WhatsApp
        </span>
        {gmailRevisado && <span>Gmail revisado {fecha(gmailRevisado)}</span>}
        <button onClick={() => void cargar()} className="underline hover:text-gray-900" disabled={cargando}>
          {cargando ? "Revisando…" : "Actualizar"}
        </button>
      </div>

      {esperando && ultEnt && (
        <div className="text-[12px] bg-amber-50 border border-amber-200 text-amber-900 rounded px-2.5 py-1.5">
          <b>Esperando respuesta nuestra</b> desde {fecha(ultEnt.at)} por {CANAL[ultEnt.channel]?.nombre}: el último
          mensaje es del candidato.
        </div>
      )}
      {error && <div className="text-[12px] bg-red-50 border border-red-200 text-red-800 rounded px-2.5 py-1.5">{error}</div>}

      {/* Acciones */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setPanel(panel === "anotar" ? null : "anotar")}
          className={`text-[11px] font-semibold px-2.5 py-1 rounded border ${panel === "anotar" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 hover:border-gray-900"}`}
        >
          + Anotar contacto
        </button>
        <button
          onClick={() => setPanel(panel === "whatsapp" ? null : "whatsapp")}
          className={`text-[11px] font-semibold px-2.5 py-1 rounded border ${panel === "whatsapp" ? "border-[#128C7E] bg-[#128C7E] text-white" : "border-gray-300 hover:border-[#128C7E]"}`}
        >
          Importar chat de WhatsApp
        </button>
      </div>

      {panel === "anotar" && (
        <AnotarContacto
          candidateId={candidateId}
          onListo={() => {
            setPanel(null);
            void cargar();
          }}
        />
      )}
      {panel === "whatsapp" && (
        <ImportarWhatsapp
          candidateId={candidateId}
          onListo={() => {
            setPanel(null);
            void cargar();
          }}
        />
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-1 pt-1">
        {(
          [
            ["todo", "Todo"],
            ["email", "Correo"],
            ["whatsapp", "WhatsApp"],
            ["otros", "Llamadas y otros"],
            ["etapas", "Etapas"],
          ] as const
        ).map(([k, n]) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${filtro === k ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Línea de tiempo */}
      {cargando && linea.length === 0 ? (
        <p className="text-[12px] text-gray-400 italic">Revisando Gmail y cargando el historial…</p>
      ) : visibles.length === 0 ? (
        <p className="text-[12px] text-gray-400 italic">
          {linea.length === 0 ? "Sin contactos registrados todavía." : "Nada con este filtro."}
        </p>
      ) : (
        <ol className="border-l border-gray-200 ml-1.5 space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {visibles.map((l) =>
            l.tipo === "etapa" ? (
              <li key={`e-${l.id}`} className="pl-3 relative">
                <span className="absolute -left-[4px] top-1.5 w-[7px] h-[7px] rounded-full bg-gray-300" />
                <div className="text-[11px] text-gray-400">
                  {fecha(l.at)} · Etapa: {l.from_stage || "—"} → <b className="text-gray-600">{l.to_stage}</b>
                </div>
              </li>
            ) : (
              <li key={`c-${l.id}`} className="pl-3 relative">
                <span
                  className={`absolute -left-[5px] top-1.5 w-[9px] h-[9px] rounded-full border-2 border-white ${l.direction === "entrante" ? "bg-blue-500" : "bg-gray-900"} ${l.status === "intento" ? "opacity-40" : ""}`}
                />
                <button
                  onClick={() => setAbierto(abierto === l.id ? null : l.id)}
                  className={`text-left w-full ${l.status === "intento" ? "opacity-60" : ""}`}
                >
                  <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-1.5">
                    <span>{fecha(l.at)}</span>
                    <span>·</span>
                    <span>
                      {CANAL[l.channel]?.icono} {CANAL[l.channel]?.nombre}{" "}
                      {l.direction === "entrante" ? "← del candidato" : "→ enviado"}
                    </span>
                    {l.kind && TIPO[l.kind] && (
                      <>
                        <span>·</span>
                        <span className="font-semibold text-gray-700">{TIPO[l.kind]}</span>
                      </>
                    )}
                  </div>
                  <div className="text-[12.5px] text-gray-900 leading-snug line-clamp-2">{l.summary || "—"}</div>
                  <div className="text-[10px] text-gray-400">{ORIGEN[l.source] || l.source}</div>
                </button>
                {abierto === l.id && l.body && (
                  <pre className="mt-1 text-[11.5px] whitespace-pre-wrap font-sans bg-gray-50 border border-gray-200 rounded p-2 text-gray-700">
                    {l.body}
                  </pre>
                )}
                {abierto === l.id && l.channel === "email" && l.thread_id && (
                  <a
                    href={`https://mail.google.com/mail/?authuser=jointheteam@tradingsolutions.com#all/${l.thread_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-600 underline"
                  >
                    Abrir en Gmail
                  </a>
                )}
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}

function AnotarContacto({ candidateId, onListo }: { candidateId: string; onListo: () => void }) {
  const [channel, setChannel] = useState("llamada");
  const [direction, setDirection] = useState("saliente");
  const [cuando, setCuando] = useState(ahoraLocal());
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/candidates/${candidateId}/contactos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          direction,
          occurred_at: new Date(cuando).toISOString(),
          summary: texto,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo guardar");
      onListo();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded p-2.5 space-y-2 bg-gray-50">
      <p className="text-[11px] text-gray-500">
        Para lo que no pasa por Gmail ni por el chat: una llamada, una conversación en la oficina. Los correos no hace
        falta anotarlos, se leen solos.
      </p>
      <div className="flex flex-wrap gap-2">
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="text-[12px] border rounded px-1.5 py-1">
          <option value="llamada">Llamada</option>
          <option value="presencial">Presencial</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="otro">Otro</option>
        </select>
        <select value={direction} onChange={(e) => setDirection(e.target.value)} className="text-[12px] border rounded px-1.5 py-1">
          <option value="saliente">Lo contactamos</option>
          <option value="entrante">Nos contactó</option>
        </select>
        <input
          type="datetime-local"
          value={cuando}
          max={ahoraLocal()}
          onChange={(e) => setCuando(e.target.value)}
          className="text-[12px] border rounded px-1.5 py-1"
        />
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        placeholder="Qué se habló. Ej.: confirmó que presenta la prueba el jueves en la tarde."
        className="w-full text-[12.5px] border rounded px-2 py-1.5"
      />
      {error && <p className="text-[11px] text-red-700">{error}</p>}
      <button
        onClick={guardar}
        disabled={guardando || !texto.trim()}
        className="text-[11px] font-semibold px-3 py-1 rounded bg-gray-900 text-white disabled:opacity-40"
      >
        {guardando ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}

function ImportarWhatsapp({ candidateId, onListo }: { candidateId: string; onListo: () => void }) {
  const [texto, setTexto] = useState("");
  const [lectura, setLectura] = useState<null | {
    total: number;
    autores: { autor: string; mensajes: number }[];
    sugerido: string | null;
    desde: string;
    hasta: string;
  }>(null);
  const [nosotros, setNosotros] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const archivo = useRef<HTMLInputElement>(null);

  async function llamar(body: object) {
    const r = await fetch(`/api/admin/candidates/${candidateId}/contactos/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "No se pudo leer el chat");
    return j;
  }

  async function leer(t: string) {
    setTrabajando(true);
    setError("");
    setLectura(null);
    try {
      const j = await llamar({ texto: t, dry_run: true });
      setLectura(j);
      setNosotros(j.sugerido || "");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTrabajando(false);
    }
  }

  async function importar() {
    setTrabajando(true);
    setError("");
    try {
      const j = await llamar({ texto, nosotros });
      setMensaje(`${j.nuevos} mensajes nuevos guardados${j.ya_estaban ? ` · ${j.ya_estaban} ya estaban` : ""}.`);
      setTimeout(onListo, 1200);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTrabajando(false);
    }
  }

  async function alElegirArchivo(f: File | undefined) {
    if (!f) return;
    if (/\.zip$/i.test(f.name)) {
      setError("Ese es el .zip. Descomprímelo (doble clic) y sube el archivo _chat.txt que trae adentro.");
      return;
    }
    const t = await f.text();
    setTexto(t);
    await leer(t);
  }

  return (
    <div className="border border-[#128C7E]/30 rounded p-2.5 space-y-2 bg-[#128C7E]/5">
      <p className="text-[11px] text-gray-600 leading-snug">
        En el celular: abre el chat con el candidato → nombre del contacto → <b>Exportar chat</b> →{" "}
        <b>Sin archivos</b>. Súbelo acá (o pega el texto). Si ya lo habías importado, solo se agregan los mensajes
        nuevos.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          ref={archivo}
          type="file"
          accept=".txt,text/plain"
          onChange={(e) => void alElegirArchivo(e.target.files?.[0])}
          className="text-[11px]"
        />
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => texto.trim() && !lectura && void leer(texto)}
        rows={3}
        placeholder="…o pega aquí el texto del chat exportado"
        className="w-full text-[11.5px] font-mono border rounded px-2 py-1.5"
      />

      {lectura && (
        <div className="space-y-1.5">
          <p className="text-[11.5px] text-gray-700">
            {lectura.total} mensajes, del {fecha(lectura.desde)} al {fecha(lectura.hasta)}. ¿Quién es el equipo en este
            chat?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {lectura.autores.map((a) => (
              <label
                key={a.autor}
                className={`text-[11.5px] px-2 py-1 rounded border cursor-pointer ${nosotros === a.autor ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300"}`}
              >
                <input
                  type="radio"
                  name="nosotros"
                  className="hidden"
                  checked={nosotros === a.autor}
                  onChange={() => setNosotros(a.autor)}
                />
                {a.autor} · {a.mensajes}
              </label>
            ))}
          </div>
          <button
            onClick={importar}
            disabled={trabajando || !nosotros}
            className="text-[11px] font-semibold px-3 py-1 rounded bg-[#128C7E] text-white disabled:opacity-40"
          >
            {trabajando ? "Importando…" : `Importar · «${nosotros || "?"}» es el equipo`}
          </button>
        </div>
      )}
      {!lectura && texto.trim() && (
        <button
          onClick={() => void leer(texto)}
          disabled={trabajando}
          className="text-[11px] font-semibold px-3 py-1 rounded border border-gray-300"
        >
          {trabajando ? "Leyendo…" : "Leer chat"}
        </button>
      )}
      {mensaje && <p className="text-[11.5px] text-green-700">{mensaje}</p>}
      {error && <p className="text-[11.5px] text-red-700">{error}</p>}
    </div>
  );
}
