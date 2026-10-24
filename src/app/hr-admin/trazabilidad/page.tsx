"use client";

/**
 * TRAZABILIDAD · el seguimiento de todos los candidatos activos en una tabla
 *
 * Para dos cosas:
 *   1. Que nadie se quede esperando. Arriba van los que escribieron y no les
 *      hemos contestado, ordenados por cuánto llevan esperando.
 *   2. Mostrar la gestión. Cuántas veces y por dónde se contactó a cada uno, y
 *      el historial completo con un clic.
 *
 * El botón «Auditar Gmail» recorre la bandeja para los candidatos que todavía
 * no tienen historial. Después se mantiene solo: el cron revisa cada hora y la
 * ficha se pone al día cada vez que se abre.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import HistorialContactos from "@/components/HistorialContactos";

type Fila = {
  id: string;
  nombre: string;
  email: string | null;
  vacante: string;
  etapa: string;
  gmail_revisado: string | null;
  contactos: number;
  correos: number;
  whatsapps: number;
  otros: number;
  intentos_whatsapp: number;
  ultimo: { at: string; canal: string; direccion: string; resumen: string | null } | null;
  dias_sin_contacto: number | null;
  esperando_respuesta_nuestra: boolean;
  esperando_desde: string | null;
};

type Resumen = {
  total: number;
  esperando_respuesta: number;
  sin_ningun_contacto: number;
  gmail_sin_revisar: number;
  candidatos: Fila[];
};

const CANAL: Record<string, string> = { email: "✉", whatsapp: "💬", llamada: "📞", presencial: "🤝", otro: "•" };

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
}

function horasDesde(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
}

export default function Trazabilidad() {
  const [data, setData] = useState<Resumen | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [vacante, setVacante] = useState("todas");
  const [vista, setVista] = useState<"esperando" | "todos" | "sin_contacto">("esperando");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [auditando, setAuditando] = useState(false);
  const [progreso, setProgreso] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await fetch("/api/admin/contactos/resumen", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo cargar");
      setData(j);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function auditarGmail(todos: boolean) {
    setAuditando(true);
    setError("");
    let procesados = 0;
    let nuevos = 0;
    try {
      // Por lotes hasta vaciar la cola: cada candidato son varias llamadas a
      // Gmail y todos de una vez no caben en una sola función.
      for (let vuelta = 0; vuelta < 60; vuelta++) {
        const r = await fetch("/api/admin/contactos/sync-gmail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lote: 15, todos }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Gmail no respondió");
        procesados += j.procesados;
        nuevos += j.nuevos;
        setProgreso(`${procesados} candidatos revisados · ${nuevos} mensajes nuevos · faltan ${j.restantes}`);
        if (j.errores?.length) setError(j.errores.slice(0, 3).join(" · "));
        if (j.procesados === 0 || j.restantes === 0) break;
      }
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAuditando(false);
    }
  }

  const vacantes = useMemo(
    () => [...new Set((data?.candidatos ?? []).map((c) => c.vacante))].sort(),
    [data],
  );

  const filas = useMemo(() => {
    let f = (data?.candidatos ?? []).filter((c) => vacante === "todas" || c.vacante === vacante);
    if (vista === "esperando") f = f.filter((c) => c.esperando_respuesta_nuestra);
    if (vista === "sin_contacto") f = f.filter((c) => c.contactos === 0);
    return f.sort((a, b) => {
      if (vista === "esperando")
        return new Date(a.esperando_desde!).getTime() - new Date(b.esperando_desde!).getTime();
      return (b.dias_sin_contacto ?? 999) - (a.dias_sin_contacto ?? 999);
    });
  }, [data, vacante, vista]);

  const deLaVacante = (data?.candidatos ?? []).filter((c) => vacante === "todas" || c.vacante === vacante);

  return (
    <div className="max-w-ts mx-auto px-5 py-6">
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-light tracking-tight">Trazabilidad de contactos</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
            Cada correo y cada WhatsApp con los candidatos activos. Gmail se lee solo; WhatsApp se importa desde el chat
            en la ficha de cada persona.
          </p>
        </div>
        <select
          value={vacante}
          onChange={(e) => setVacante(e.target.value)}
          className="ml-auto text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white max-w-xs"
        >
          <option value="todas">Todas las vacantes</option>
          {vacantes.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Auditoría de Gmail */}
      <div className="mt-5 flex flex-wrap items-center gap-2 text-[12.5px]">
        <button
          onClick={() => void auditarGmail(false)}
          disabled={auditando}
          className="font-medium px-3 py-1.5 rounded-ts-sm bg-ts-accent text-white disabled:opacity-40"
        >
          {auditando ? "Auditando Gmail…" : "Auditar Gmail"}
        </button>
        <button
          onClick={() => void auditarGmail(true)}
          disabled={auditando}
          title="Vuelve a pasar también a los que se revisaron hace más de 6 horas"
          className="font-semibold px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40"
        >
          Revisar todos de nuevo
        </button>
        {data && data.gmail_sin_revisar > 0 && !auditando && (
          <span className="text-amber-700">{data.gmail_sin_revisar} candidatos todavía sin revisar en Gmail</span>
        )}
        {progreso && <span className="text-gray-500">{progreso}</span>}
      </div>

      {error && (
        <p className="mt-3 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Indicadores */}
      {data && (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2">
          <Indicador
            valor={deLaVacante.filter((c) => c.esperando_respuesta_nuestra).length}
            texto="esperan respuesta nuestra"
            alerta
            activo={vista === "esperando"}
            onClick={() => setVista("esperando")}
          />
          <Indicador
            valor={deLaVacante.filter((c) => c.contactos === 0).length}
            texto="sin ningún contacto registrado"
            activo={vista === "sin_contacto"}
            onClick={() => setVista("sin_contacto")}
          />
          <Indicador valor={deLaVacante.length} texto="candidatos activos" activo={vista === "todos"} onClick={() => setVista("todos")} />
          <Indicador
            valor={deLaVacante.reduce((s, c) => s + c.contactos, 0)}
            texto="contactos registrados"
          />
        </div>
      )}

      {cargando && !data && <p className="mt-6 text-sm text-gray-400 italic">Cargando…</p>}

      {data && (
        <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden bg-white">
          {filas.length === 0 ? (
            <p className="p-5 text-sm text-gray-500 italic">
              {vista === "esperando" ? "Nadie esperando respuesta. Al día." : "Nadie en esta vista."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filas.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setAbierto(abierto === c.id ? null : c.id)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex flex-wrap items-start gap-x-4 gap-y-1"
                  >
                    <div className="min-w-0 flex-1 basis-60">
                      <div className="text-[14px] font-semibold text-gray-900">{c.nombre}</div>
                      <div className="text-[11.5px] text-gray-500">
                        {c.vacante} · <span className="font-mono">{c.etapa}</span>
                      </div>
                    </div>
                    <div className="text-[12px] text-gray-600 basis-40">
                      {c.correos} ✉ · {c.whatsapps} 💬{c.otros ? ` · ${c.otros} 📞` : ""}
                      {c.intentos_whatsapp > 0 && (
                        <div className="text-[10.5px] text-gray-400">
                          {c.intentos_whatsapp} WhatsApp sin confirmar
                        </div>
                      )}
                    </div>
                    <div className="text-[12px] text-gray-600 flex-1 basis-64 min-w-0">
                      {c.esperando_respuesta_nuestra && c.esperando_desde ? (
                        <div className="text-amber-800 font-semibold">
                          Esperando respuesta hace {horasDesde(c.esperando_desde) < 48
                            ? `${horasDesde(c.esperando_desde)} h`
                            : `${Math.floor(horasDesde(c.esperando_desde) / 24)} días`}
                        </div>
                      ) : null}
                      {c.ultimo ? (
                        <div className="truncate">
                          {CANAL[c.ultimo.canal]} {c.ultimo.direccion === "entrante" ? "←" : "→"} {fecha(c.ultimo.at)} ·{" "}
                          <span className="text-gray-500">{c.ultimo.resumen}</span>
                        </div>
                      ) : (
                        <div className="text-gray-400 italic">
                          {c.gmail_revisado ? "Sin contactos" : "Gmail sin revisar"}
                        </div>
                      )}
                    </div>
                  </button>
                  {abierto === c.id && (
                    <div className="px-4 pb-4 pt-1 bg-gray-50/60 border-t border-gray-100">
                      <HistorialContactos candidateId={c.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11.5px] text-gray-400 mt-6 max-w-3xl leading-relaxed">
        Los correos se leen de la bandeja de jointheteam, así que aparece todo lo que salió o llegó por ahí, lo haya
        enviado el ATS o una persona. Los WhatsApp que se abren desde el ATS quedan como «sin confirmar» hasta que se
        importa el chat en la ficha: abrir el chat no prueba que el mensaje se envió.
      </p>
    </div>
  );
}

function Indicador({
  valor,
  texto,
  alerta,
  activo,
  onClick,
}: {
  valor: number;
  texto: string;
  alerta?: boolean;
  activo?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`text-left rounded-xl border px-3.5 py-2.5 ${activo ? "border-gray-900" : "border-gray-200"} ${onClick ? "hover:border-gray-500" : "cursor-default"} bg-white`}
    >
      <div className={`text-2xl font-bold tabular-nums ${alerta && valor > 0 ? "text-amber-700" : "text-gray-900"}`}>{valor}</div>
      <div className="text-[11.5px] text-gray-500 leading-tight">{texto}</div>
    </button>
  );
}
