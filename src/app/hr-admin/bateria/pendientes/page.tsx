"use client";

/**
 * PENDIENTES DE PRESENTAR LA BATERÍA
 *
 * Una lista para perseguir, no un reporte para mirar. Cada fila trae el botón
 * de WhatsApp ya armado —con el recordatorio y el enlace personal de esa
 * persona adentro— y el correo listo para copiar.
 *
 * POR QUÉ SEPARA «SIN ABRIR» DE «EMPEZADA SIN TERMINAR»
 * No son el mismo recordatorio. Al que no la abrió hay que empujarlo. Al que la
 * dejó a medias puede que se le haya roto algo: esta semana tres candidatos
 * escribieron diciendo que la prueba no les guardaba las respuestas. Mandarle a
 * esa persona un «no olvides presentarla» es echarle la culpa de un problema
 * nuestro.
 *
 * EL ORDEN ES POR ANTIGÜEDAD
 * Arriba el que lleva más días esperando. Es el que está más cerca de perderse.
 */

import { useCallback, useEffect, useState } from "react";

type Fila = {
  candidateId: string | null;
  nombre: string;
  email: string | null;
  vacante: string;
  telefono: string | null;
  invitada: string | null;
  diasSinPresentar: number | null;
  estado: "sin_abrir" | "empezada_sin_terminar";
  urlPrueba: string;
  whatsapp: string | null;
  motivoSinWhatsapp: string | null;
  mensaje: string;
};

type Respuesta = {
  vacante: string;
  total: number;
  sinAbrir: number;
  empezadasSinTerminar: number;
  sinCelular: number;
  candidatos: Fila[];
};

const VACANTES = ["Operations Executive", "Integrated Management Systems & HSE Specialist", "FullStack Junior"];

export default function PendientesBateria() {
  const [vacante, setVacante] = useState(VACANTES[0]);
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await fetch(`/api/bateria/pendientes?vacante=${encodeURIComponent(vacante)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo cargar");
      setData(j);
    } catch (e: any) {
      setError(e.message || "No se pudo cargar");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [vacante]);

  useEffect(() => { cargar(); }, [cargar]);

  // Abrir WhatsApp desde acá queda en el historial del candidato como
  // «intento»: prueba que se abrió el chat con el texto listo, no que se
  // envió. Lo confirma el chat cuando se importa en la ficha.
  function anotarWhatsapp(f: Fila) {
    if (!f.candidateId) return;
    void fetch(`/api/admin/candidates/${f.candidateId}/contactos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        channel: "whatsapp",
        direction: "saliente",
        source: "whatsapp_boton",
        kind: "recordatorio_prueba",
        summary: f.mensaje.slice(0, 280),
        body: f.mensaje,
      }),
    }).catch(() => {});
  }

  async function copiarCorreo(f: Fila) {
    const cuerpo =
      `Hola ${f.nombre.trim().split(/\s+/)[0]},\n\n` +
      `Esperamos que te encuentres bien. Te escribimos para recordarte que tienes pendiente la prueba de selección correspondiente al proceso de ${f.vacante}. Tu perfil avanzó hasta esta etapa y necesitamos completarla para continuar con la evaluación.\n\n` +
      `La prueba toma alrededor de 90 minutos y debe presentarse en una sola sesión, desde un computador con cámara. No se trata de un examen: es un instrumento que nos permite conocer aspectos de tu perfil que la hoja de vida no alcanza a mostrar.\n\n` +
      `Este es tu enlace personal:\n\n${f.urlPrueba}\n\n` +
      `Si ya intentaste presentarla y la plataforma no cargó, se detuvo o no registró tus respuestas, por favor respóndenos este correo y habilitaremos un nuevo enlace el mismo día. Hemos identificado esta situación en otros procesos y queremos asegurarnos de que no afecte tu participación.\n\n` +
      `Si por el contrario has decidido no continuar, te agradecemos informarnos para cerrar tu proceso de manera formal. Tu perfil permanecerá en nuestra base de datos para futuras oportunidades.\n\n` +
      `Cordialmente,\n\nTalent Acquisition Team · Trading Solutions`;
    try {
      await navigator.clipboard.writeText(cuerpo);
      setCopiado(f.urlPrueba);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      setError("El navegador bloqueó el portapapeles. Copiá el texto a mano.");
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-8">
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Pendientes de presentar la batería</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
            Los que ya recibieron la invitación y todavía no la terminaron. El botón de WhatsApp
            abre el chat con el recordatorio y el enlace personal de esa persona ya escritos.
          </p>
        </div>
        <select
          value={vacante}
          onChange={(e) => setVacante(e.target.value)}
          className="ml-auto text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white max-w-xs"
        >
          {VACANTES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {error && (
        <p className="mt-4 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2">{error}</p>
      )}
      {cargando && <p className="mt-6 text-sm text-gray-400 italic">Cargando…</p>}

      {data && !cargando && (
        <>
          <p className="mt-4 text-[12.5px] text-gray-500">
            <b className="text-gray-900">{data.total}</b> pendientes ·{" "}
            {data.sinAbrir} no la abrieron · {data.empezadasSinTerminar} la dejaron a medias
            {data.sinCelular > 0 && <span className="text-amber-700"> · {data.sinCelular} sin celular en la ficha</span>}
          </p>

          {data.total === 0 && (
            <p className="mt-6 text-sm text-gray-500 italic">
              Nadie pendiente en esta vacante. Todos los invitados la presentaron.
            </p>
          )}

          <div className="mt-4 space-y-2">
            {data.candidatos.map((f) => (
              <div key={f.urlPrueba} className="border border-gray-200 rounded-xl p-3 bg-white">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-gray-900">{f.nombre}</span>
                      {f.estado === "empezada_sin_terminar" ? (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          la empezó y no la terminó
                        </span>
                      ) : (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          no la ha abierto
                        </span>
                      )}
                      {f.diasSinPresentar != null && (
                        <span className="text-[11px] font-mono text-gray-400">
                          {f.diasSinPresentar === 0 ? "hoy" : `hace ${f.diasSinPresentar} d`}
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-gray-500 mt-0.5">
                      {f.email ?? "sin correo"}
                      {f.telefono ? ` · ${f.telefono}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => copiarCorreo(f)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 hover:border-gray-900"
                    >
                      {copiado === f.urlPrueba ? "Copiado ✓" : "Copiar correo"}
                    </button>

                    {f.whatsapp ? (
                      <a
                        href={f.whatsapp}
                        onClick={() => anotarWhatsapp(f)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#25D366] text-white hover:brightness-95"
                      >
                        WhatsApp
                      </a>
                    ) : (
                      <span
                        title={f.motivoSinWhatsapp ?? ""}
                        className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 cursor-default"
                      >
                        Sin WhatsApp
                      </span>
                    )}
                  </div>
                </div>

                {/* Si no se puede escribir por WhatsApp, decir por qué en vez de
                    dejar un botón apagado sin explicación. */}
                {!f.whatsapp && f.motivoSinWhatsapp && (
                  <p className="text-[11px] text-amber-700 mt-1.5">{f.motivoSinWhatsapp}</p>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11.5px] text-gray-400 mt-6 max-w-2xl leading-relaxed">
            El enlace de cada persona es único y personal: no se reenvía el de otro. A quien la dejó
            a medias conviene preguntarle antes si se le trabó — esta semana tres candidatos
            escribieron diciendo que la prueba no les guardaba las respuestas.
          </p>
        </>
      )}
    </div>
  );
}
