"use client";

/**
 * BANDEJA DE REQUISICIONES · Wellness y el CWO
 *
 * Acá cae lo que los líderes piden desde WXM. Wellness arma el perfil o lo
 * devuelve; el CWO aprueba o rechaza. Al aprobar nace la vacante.
 *
 * ORDEN DE LA PANTALLA
 * Primero lo que espera acción, después lo cerrado. Una bandeja ordenada por
 * fecha entierra lo urgente entre lo resuelto: la requisición que lleva nueve
 * días esperando al CWO queda debajo de tres aprobadas de ayer.
 */

import { useEffect, useState, useCallback } from "react";
import {
  RequisitionStatus,
  STATUS_LABEL,
  STATUS_HINT,
  TYPE_LABEL,
  accionesDisponibles,
  TRANSICIONES,
  type AccionRequisicion,
} from "@/lib/requisitions";
import { PREFILTER_TEMPLATES } from "@/lib/prefilter-templates";
import PublishPanel from "@/components/PublishPanel";
import { FechasVacanteFields, errorFechas } from "@/components/CamposObligatorios";
import AvisoMultiIdioma, { type CamposGenerados } from "@/components/AvisoMultiIdioma";

type Requisicion = {
  id: string;
  lead_email: string;
  lead_name: string | null;
  area: string | null;
  title: string;
  requisition_type: "reemplazo" | "incremental";
  reason: string | null;
  needed_by: string | null;
  lead_responsibilities: string | null;
  lead_must_haves: string | null;
  lead_profile: {
    reporta_a?: string | null;
    posiciones?: number | null;
    ubicacion?: string | null;
    modalidad?: string | null;
    herramientas?: string | null;
    ingles_nivel?: string | null;
    ingles_para?: string | null;
    formacion?: string | null;
    experiencia?: string | null;
    competencias?: string | null;
    salario_tope?: string | null;
  } | null;
  responsibilities: string | null;
  nice_to_have: string | null;
  location: string | null;
  work_mode: string | null;
  salary_public: string | null;
  hook_en: string | null;
  title_en: string | null;
  description_en: string | null;
  requirements_en: string | null;
  responsibilities_en: string | null;
  nice_to_have_en: string | null;
  web_vacancy_id: number | null;
  job_description: string | null;
  requirements: string | null;
  salary_cap_cop: number | null;
  form_template_key: string | null;
  english_required: boolean | null;
  status: RequisitionStatus;
  decision_note: string | null;
  approved_at: string | null;
  vacancy_id: string | null;
  created_at: string;
  updated_at: string;
  dias_en_estado: number | null;
};

/** Grupos de la bandeja, en orden de urgencia. */
const GRUPOS: { estados: RequisitionStatus[]; titulo: string; nota: string }[] = [
  { estados: ["pedida"], titulo: "Para armar el perfil", nota: "Las pidió un líder y todavía nadie las tocó." },
  { estados: ["con_perfil"], titulo: "Esperando al CWO", nota: "Ya tienen perfil. Falta la decisión." },
  { estados: ["devuelta"], titulo: "Devueltas al líder", nota: "La pelota está del otro lado." },
  { estados: ["aprobada"], titulo: "Aprobadas, sin publicar", nota: "La vacante existe. Falta montarla en las fuentes." },
  { estados: ["publicada", "rechazada"], titulo: "Cerradas", nota: "" },
];

const COLOR: Record<RequisitionStatus, string> = {
  pedida: "bg-gray-100 text-gray-700",
  con_perfil: "bg-amber-100 text-amber-800",
  devuelta: "bg-orange-100 text-orange-800",
  aprobada: "bg-emerald-100 text-emerald-800",
  rechazada: "bg-red-100 text-red-800",
  publicada: "bg-blue-100 text-blue-800",
};

function Alerta({ dias, estado }: { dias: number | null; estado: RequisitionStatus }) {
  // Una requisición parada más de 3 días en un estado que espera acción
  // nuestra es un proceso que todavía no arrancó y nadie está mirando.
  if (dias == null || dias < 3) return null;
  if (estado === "publicada" || estado === "rechazada" || estado === "devuelta") return null;
  return (
    <span className="text-xs font-semibold text-red-600">
      {dias} días parada
    </span>
  );
}

export default function RequisitionsInbox() {
  const [items, setItems] = useState<Requisicion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);

  /**
   * Recarga la bandeja.
   *
   * POR QUÉ NO VUELVE A PONER `cargando` EN TRUE
   * Con `cargando` la pantalla entera se reemplaza por «Cargando
   * requisiciones…», lo que DESMONTA todas las tarjetas. Cualquier recarga
   * —guardar, aprobar, publicar— borraba de un golpe el estado local de la
   * tarjeta: el panel que se estaba por abrir, lo que hubiera escrito sin
   * guardar, la sección desplegada. Se notó al abrir «Publicar en las
   * fuentes»: guardaba, recargaba, la tarjeta se desmontaba y el panel no
   * llegaba a aparecer nunca.
   *
   * La primera carga sí ocupa la pantalla, porque no hay nada que mostrar.
   * Las siguientes reemplazan los datos sin tumbar lo que está en uso.
   */
  const cargar = useCallback(async (primera = false) => {
    if (primera) setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/requisitions", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo cargar la bandeja");
      setItems(j.requisiciones || []);
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      if (primera) setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(true);
  }, [cargar]);

  if (cargando) {
    return <div className="py-16 text-center text-sm text-gray-400">Cargando requisiciones…</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
        <strong>No se pudo cargar:</strong> {error}
        <button onClick={() => cargar(true)} className="ml-3 underline">Reintentar</button>
      </div>
    );
  }

  const pendientes = items.filter((r) => r.status === "pedida" || r.status === "con_perfil").length;

  return (
    <div>
      <div className="flex items-end gap-4 mb-1">
        <div>
          <h2 className="text-xl font-bold">Requisiciones</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Lo que los líderes pidieron desde WXM.
            {pendientes > 0 && (
              <> <strong className="text-gray-900">{pendientes}</strong> {pendientes === 1 ? "espera" : "esperan"} una decisión.</>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setNueva(true)}
            className="text-sm px-4 py-2 rounded-full bg-black text-white hover:bg-gray-800 font-medium"
          >
            + Nueva requisición
          </button>
          <button
            onClick={() => cargar()}
            className="text-sm text-gray-500 hover:text-gray-900 underline"
          >
            Actualizar
          </button>
        </div>
      </div>

      {nueva && (
        <NuevaRequisicion
          onCerrar={() => setNueva(false)}
          onCreada={() => { setNueva(false); cargar(); }}
        />
      )}

      {items.length === 0 && (
        <div className="mt-8 border border-dashed border-gray-300 rounded-xl p-10 text-center">
          <p className="font-medium text-gray-900">Todavía no hay requisiciones</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            Van a aparecer acá cuando un líder pida una vacante desde WXM. Si esperabas
            alguna, revisá que la persona tenga el rol de líder asignado.
          </p>
        </div>
      )}

      {GRUPOS.map((g) => {
        const delGrupo = items.filter((r) => g.estados.includes(r.status));
        if (delGrupo.length === 0) return null;
        return (
          <section key={g.titulo} className="mt-8">
            <div className="flex items-baseline gap-3 mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">
                {g.titulo}
              </h3>
              <span className="text-sm text-gray-400">{delGrupo.length}</span>
              {g.nota && <span className="text-xs text-gray-400 ml-auto">{g.nota}</span>}
            </div>
            <div className="space-y-3">
              {delGrupo.map((r) => (
                <Tarjeta
                  key={r.id}
                  req={r}
                  abierta={abierta === r.id}
                  onToggle={() => setAbierta(abierta === r.id ? null : r.id)}
                  onCambio={cargar}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Tarjeta({
  req,
  abierta,
  onToggle,
  onCambio,
}: {
  req: Requisicion;
  abierta: boolean;
  onToggle: () => void;
  onCambio: () => void;
}) {
  const [perfil, setPerfil] = useState({
    job_description: req.job_description || "",
    responsibilities: req.responsibilities || "",
    requirements: req.requirements || "",
    nice_to_have: req.nice_to_have || "",
    salary_cap_cop: req.salary_cap_cop ? String(req.salary_cap_cop) : "",
    form_template_key: req.form_template_key || "",
    english_required: !!req.english_required,
    // Lo que hace falta para publicar. Sin esto la vacante vive en el ATS y
    // no tiene dónde aplicar.
    location: req.location || "",
    work_mode: req.work_mode || "Presencial",
    salary_public: req.salary_public || "",
    // El aviso de la compañía sale en inglés.
    title_en: req.title_en || "",
    hook_en: req.hook_en || "",
    description_en: req.description_en || "",
    responsibilities_en: req.responsibilities_en || "",
    requirements_en: req.requirements_en || "",
    nice_to_have_en: req.nice_to_have_en || "",
    fecha_apertura: "",
    fecha_objetivo: "",
  });
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [urlAplicacion, setUrlAplicacion] = useState<string | null>(null);
  const [redactando, setRedactando] = useState(false);
  // Vacantes abiertas que no pertenecen a ninguna requisición. Si hay alguna,
  // aprobar se frena y pregunta en vez de abrir una vacante paralela.
  const [duplicadas, setDuplicadas] = useState<
    { id: string; title: string; created_at: string }[] | null
  >(null);
  // Fuentes en las que todavía NO está publicada. `null` mientras se consulta.
  const [pendientes, setPendientes] = useState<string[] | null>(null);

  useEffect(() => {
    if (!req.vacancy_id) return;
    let vivo = true;
    fetch(`/api/vacancies/${req.vacancy_id}/postings`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo || !j?.fuentes) return;
        setPendientes(j.fuentes.filter((f: any) => !f.publicada).map((f: any) => f.label));
      })
      .catch(() => {
        // Sin el dato la tarjeta sigue sirviendo: se queda con el texto de antes.
      });
    return () => {
      vivo = false;
    };
  }, [req.vacancy_id, publicando]);

  /**
   * El enlace donde la gente aplica vive en Neon, con id numérico; la vacante
   * del ATS tiene uuid. No hay una llave que los una, así que se busca por
   * título. Si no aparece, es que todavía no se publicó en la web — y el panel
   * lo dice en vez de mostrar un enlace roto.
   */
  async function abrirPublicacion() {
    setUrlAplicacion(null);
    setProblema(null);

    // Publicar lee la requisición de la base. Si quedó algo escrito sin
    // guardar —la ciudad, el salario— el panel no lo ve y responde «falta
    // ubicación» con la ciudad en pantalla. Se guarda primero y así lo que se
    // publica es siempre lo que se está viendo.
    if (editablePublicacion) {
      setEnviando("guardar");
      try {
        const ok = await guardarPerfil();
        if (!ok) return;
        // Acá NO se recarga la bandeja: lo guardado ya está en la base, que es
        // lo único que el panel de publicación lee. Recargar solo serviría para
        // refrescar la tarjeta de atrás, y el precio sería perder el panel.
      } catch (e: any) {
        setProblema(e?.message || "No se pudo guardar antes de publicar");
        return;
      } finally {
        setEnviando(null);
      }
    }

    try {
      const r = await fetch("/api/vacancies?status=open&admin=1", { cache: "no-store" });
      const filas = await r.json();
      if (Array.isArray(filas)) {
        const t = req.title.trim().toLowerCase();
        const match = filas.find(
          (v: any) =>
            String(v.title || "").trim().toLowerCase() === t ||
            String(v.title_es || "").trim().toLowerCase() === t,
        );
        if (match?.id) {
          const base =
            process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";
          setUrlAplicacion(`${base}/vacantes/${match.id}`);
        }
      }
    } catch {
      // Sin enlace el panel sigue sirviendo: arma el texto igual.
    }
    setPublicando(true);
  }

  const acciones = accionesDisponibles(req.status);

  /**
   * Manda el perfil que está en pantalla a la base. Devuelve `true` si quedó
   * guardado; si no, deja el motivo en `problema` y devuelve `false`.
   *
   * POR QUÉ ES UNA FUNCIÓN APARTE
   * Publicar lee la requisición DESDE LA BASE, mientras Wellness mira el
   * formulario en pantalla. Mientras haya algo escrito y sin guardar, esas dos
   * cosas no son lo mismo, y el panel responde «falta ubicación» con la ciudad
   * escrita a la vista. Guardar antes de abrir el panel hace que no exista esa
   * diferencia.
   */
  async function guardarPerfil(
    accion?: AccionRequisicion,
    extra?: Record<string, unknown>,
  ): Promise<boolean> {
    const r = await fetch(`/api/requisitions/${req.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion,
        nota: nota || undefined,
        ...perfil,
        salary_cap_cop: perfil.salary_cap_cop ? Number(perfil.salary_cap_cop) : null,
        form_template_key: perfil.form_template_key || null,
        fecha_apertura: perfil.fecha_apertura || null,
        fecha_objetivo: perfil.fecha_objetivo || null,
        ...extra,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      // Aprobar se frena cuando hay vacantes abiertas sin dueño: hay que
      // decidir si esta requisición es una de ellas antes de abrir otra.
      if (j.requiere_decision === "vacante_duplicada") {
        setDuplicadas(j.vacantes_sueltas || []);
        return false;
      }
      setProblema([j.error, j.detail].filter(Boolean).join(" · "));
      return false;
    }
    if (j.aviso_fechas) alert(j.aviso_fechas);
    if (j.vacante) {
      alert(
        `Aprobada. Se creó la vacante "${j.vacante.title}" en el ATS con ${req.lead_email} ` +
          `como líder.\n\nDesde ahora corren los 22 días hasta la oferta.\n\n` +
          `Falta publicarla en las fuentes.`,
      );
    }
    return true;
  }

  async function mover(accion: AccionRequisicion | "", extra?: Record<string, unknown>) {
    if (accion === "aprobar" && !extra?.vincular_vacante_id) {
      const fechas = errorFechas(perfil.fecha_apertura, perfil.fecha_objetivo, true);
      if (fechas) { setProblema(fechas); return; }
    }
    setEnviando(accion || "guardar");
    setProblema(null);
    try {
      const ok = await guardarPerfil(accion || undefined, extra);
      if (!ok) return;
      setDuplicadas(null);
      setNota("");
      onCambio();
    } catch (e: any) {
      setProblema(e?.message || "Error de red");
    } finally {
      setEnviando(null);
    }
  }

  // El perfil es lo que el CWO aprueba: después de la aprobación se congela.
  const editable = req.status === "pedida" || req.status === "con_perfil" || req.status === "devuelta";
  // Los datos de publicación no son parte de lo aprobado, y encima se
  // necesitan DESPUÉS de aprobar. Bloquearlos junto con el perfil dejaba la
  // vacante aprobada sin poder publicarse nunca.
  const editablePublicacion = editable || req.status === "aprobada" || req.status === "publicada";

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{req.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {req.lead_name || req.lead_email}
              {req.area && <> · {req.area}</>}
              {" · "}
              {req.requisition_type === "incremental" ? "Incremental" : "Reemplazo"}
              {req.needed_by && <> · la necesita el {req.needed_by}</>}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Alerta dias={req.dias_en_estado} estado={req.status} />
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${COLOR[req.status]}`}>
              {STATUS_LABEL[req.status]}
            </span>
          </div>
        </div>
        {STATUS_HINT[req.status] && (
          <p className="text-xs text-gray-400 mt-2">{STATUS_HINT[req.status]}</p>
        )}
      </button>

      {abierta && (
        <div className="border-t border-gray-200 px-5 py-5 space-y-5">
          {/* Lo que escribió el líder */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
              Por qué la pide
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {req.reason || <span className="text-gray-400">No escribió un motivo.</span>}
            </p>
            <p className="text-xs text-gray-400 mt-2">{TYPE_LABEL[req.requisition_type]}</p>
          </div>

          {req.status === "devuelta" && req.decision_note && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-900">
              <strong>Se la devolviste al líder:</strong> {req.decision_note}
            </div>
          )}

          {/* Lo que aportó el líder, al lado de los campos que hay que llenar.
              No se copia solo: se ofrece como base para que Wellness lo
              traduzca en vez de publicar el lenguaje interno del área. */}
          {editable && (req.lead_responsibilities || req.lead_must_haves || req.lead_profile) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">
                  Lo que escribió {req.lead_name || "el líder"}
                </p>
                <button
                  onClick={() => setPerfil({
                    ...perfil,
                    job_description: perfil.job_description || req.lead_responsibilities || "",
                    requirements: perfil.requirements || req.lead_must_haves || "",
                  })}
                  className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-blue-300 text-blue-900 hover:bg-blue-100"
                >
                  Usar como base
                </button>
              </div>
              {req.lead_responsibilities && (
                <div>
                  <p className="text-[11px] font-semibold text-blue-900/70 uppercase tracking-wide">Qué va a hacer</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap mt-0.5">{req.lead_responsibilities}</p>
                </div>
              )}
              {req.lead_must_haves && (
                <div>
                  <p className="text-[11px] font-semibold text-blue-900/70 uppercase tracking-wide">Qué no puede faltar</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap mt-0.5">{req.lead_must_haves}</p>
                </div>
              )}
              {req.lead_profile && (
                <div>
                  <p className="text-[11px] font-semibold text-blue-900/70 uppercase tracking-wide">Contexto del cargo</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-0.5 text-sm text-gray-800">
                    {req.lead_profile.reporta_a && <p><span className="text-gray-500">Reporta a:</span> {req.lead_profile.reporta_a}</p>}
                    {req.lead_profile.posiciones != null && <p><span className="text-gray-500">Posiciones:</span> {req.lead_profile.posiciones}</p>}
                    {req.lead_profile.ubicacion && <p><span className="text-gray-500">Ubicación:</span> {req.lead_profile.ubicacion}</p>}
                    {req.lead_profile.modalidad && <p><span className="text-gray-500">Modalidad:</span> {req.lead_profile.modalidad}</p>}
                    {req.lead_profile.herramientas && <p className="col-span-2"><span className="text-gray-500">Herramientas:</span> {req.lead_profile.herramientas}</p>}
                    {req.lead_profile.ingles_nivel && <p><span className="text-gray-500">Inglés:</span> {req.lead_profile.ingles_nivel}{req.lead_profile.ingles_para ? ` · ${req.lead_profile.ingles_para}` : ""}</p>}
                    {req.lead_profile.formacion && <p><span className="text-gray-500">Formación:</span> {req.lead_profile.formacion}</p>}
                    {req.lead_profile.experiencia && <p><span className="text-gray-500">Experiencia:</span> {req.lead_profile.experiencia}</p>}
                    {req.lead_profile.competencias && <p className="col-span-2"><span className="text-gray-500">Competencias:</span> {req.lead_profile.competencias}</p>}
                    {req.lead_profile.salario_tope && <p><span className="text-gray-500">Tope salarial:</span> {req.lead_profile.salario_tope}</p>}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-blue-900/60 leading-relaxed">
                Está en el lenguaje del área. Antes de publicarlo, revisá que no
                pida nada que no se pueda pedir: edad, estado civil, apariencia.
              </p>
            </div>
          )}

          {/* El perfil */}
          {editable && (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Perfil del cargo · como se va a publicar
              </p>

              <label className="block">
                <span className="text-xs font-medium text-gray-700">Descripción</span>
                <textarea
                  value={perfil.job_description}
                  onChange={(e) => setPerfil({ ...perfil, job_description: e.target.value })}
                  rows={4}
                  className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="Qué hace la persona en este cargo y por qué existe el puesto."
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-700">Requisitos</span>
                <textarea
                  value={perfil.requirements}
                  onChange={(e) => setPerfil({ ...perfil, requirements: e.target.value })}
                  rows={4}
                  className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="Uno por línea. Los que descartan de entrada, primero."
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-700">Qué va a hacer · una por línea</span>
                <textarea
                  value={perfil.responsibilities}
                  onChange={(e) => setPerfil({ ...perfil, responsibilities: e.target.value })}
                  rows={5}
                  className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="Cada línea es una viñeta del aviso."
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-700">Nice to have · una por línea</span>
                <textarea
                  value={perfil.nice_to_have}
                  onChange={(e) => setPerfil({ ...perfil, nice_to_have: e.target.value })}
                  rows={3}
                  className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="Lo que suma pero no descarta."
                />
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Tope salarial (COP)</span>
                  <input
                    type="number"
                    value={perfil.salary_cap_cop}
                    onChange={(e) => setPerfil({ ...perfil, salary_cap_cop: e.target.value })}
                    className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="Ej: 4500000"
                  />
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    El prefiltro marca a quien pida por encima. No lo rechaza solo.
                  </span>
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Cuestionario de prefiltro</span>
                  <select
                    value={perfil.form_template_key}
                    onChange={(e) => setPerfil({ ...perfil, form_template_key: e.target.value })}
                    className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="">Elegir…</option>
                    {Object.values(PREFILTER_TEMPLATES).map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Sin esto, a un psicólogo se le pregunta por Incoterms.
                  </span>
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={perfil.english_required}
                  onChange={(e) => setPerfil({ ...perfil, english_required: e.target.checked })}
                />
                El cargo exige inglés B2 o superior
              </label>
            </div>
          )}

          {/* Datos de publicación · siguen editables después de aprobar */}
          {editablePublicacion && (
            <div className="space-y-4 border-t border-gray-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Para publicar
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Ubicación</span>
                  <input
                    type="text"
                    value={perfil.location}
                    onChange={(e) => setPerfil({ ...perfil, location: e.target.value })}
                    className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                    // Decía «Barranquilla, Colombia» a secas y se leía como un
                    // valor ya puesto: el campo parecía lleno estando vacío.
                    placeholder="Ej.: Barranquilla, Colombia"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Modalidad</span>
                  <select
                    value={perfil.work_mode}
                    onChange={(e) => setPerfil({ ...perfil, work_mode: e.target.value })}
                    className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
                  >
                    <option>Presencial</option>
                    <option>Híbrido</option>
                    <option>Remoto</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Salario en el aviso</span>
                  <input
                    type="text"
                    value={perfil.salary_public}
                    onChange={(e) => setPerfil({ ...perfil, salary_public: e.target.value })}
                    className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="A convenir"
                  />
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Esto lo ve el candidato. No es el tope.
                  </span>
                </label>
              </div>

              <details className="border border-gray-200 rounded-lg">
                <summary className="text-xs font-medium text-gray-700 px-3 py-2 cursor-pointer">
                  Versión en inglés · es la que se publica en LinkedIn
                </summary>
                <div className="px-3 pb-3 space-y-3">
                  <label className="block">
                    <span className="text-xs text-gray-600">Título</span>
                    <input type="text" value={perfil.title_en}
                      onChange={(e) => setPerfil({ ...perfil, title_en: e.target.value })}
                      className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                      placeholder={req.title} />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-600">Gancho de la primera línea</span>
                    <input type="text" value={perfil.hook_en}
                      onChange={(e) => setPerfil({ ...perfil, hook_en: e.target.value })}
                      className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="to connect markets and build international agent networks" />
                    <span className="text-[11px] text-gray-400 mt-1 block">
                      Completa la frase «We&apos;re looking for a [cargo] …!»
                    </span>
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-600">Descripción</span>
                    <textarea value={perfil.description_en} rows={4}
                      onChange={(e) => setPerfil({ ...perfil, description_en: e.target.value })}
                      className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-600">What You&apos;ll Do</span>
                    <textarea value={perfil.responsibilities_en} rows={5}
                      onChange={(e) => setPerfil({ ...perfil, responsibilities_en: e.target.value })}
                      className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-600">Requirements</span>
                    <textarea value={perfil.requirements_en} rows={4}
                      onChange={(e) => setPerfil({ ...perfil, requirements_en: e.target.value })}
                      className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-600">Nice to Have</span>
                    <textarea value={perfil.nice_to_have_en} rows={3}
                      onChange={(e) => setPerfil({ ...perfil, nice_to_have_en: e.target.value })}
                      className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
                  </label>
                  <p className="text-[11px] text-gray-400">
                    Lo que dejes vacío cae al español, así que la vacante nunca queda con un hueco.
                  </p>
                </div>
              </details>

            </div>
          )}

          {/* Motivo, cuando la acción lo pide */}
          {(acciones.includes("devolver") || acciones.includes("rechazar")) && (
            <label className="block">
              <span className="text-xs font-medium text-gray-700">
                Motivo (obligatorio para devolver o rechazar)
              </span>
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={2}
                className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                placeholder="Qué falta o por qué no procede. Esto es lo que va a leer el líder."
              />
            </label>
          )}

          {problema && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              {problema}
            </div>
          )}

          <FechasVacanteFields
            apertura={perfil.fecha_apertura}
            objetivo={perfil.fecha_objetivo}
            onApertura={(v) => setPerfil({ ...perfil, fecha_apertura: v })}
            onObjetivo={(v) => setPerfil({ ...perfil, fecha_objetivo: v })}
          />
          <p className="text-[11px] text-gray-500 -mt-2">
            Obligatorias al crear la vacante. La apertura es la solicitud HR. El cierre objetivo se exige solo si la columna ya existe.
          </p>

          {/* Acciones */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => setRedactando(true)}
              title="Redacta el aviso completo en español, inglés y mandarín con el formato de Trading Solutions"
              className="text-sm px-4 py-2 rounded-full border border-gray-300 hover:border-black hover:bg-gray-50"
            >
              ✦ Redactar aviso
            </button>
            {editablePublicacion && (
              <button
                onClick={() => mover("")}
                disabled={!!enviando}
                className="text-sm px-4 py-2 rounded-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                {enviando === "guardar" ? "Guardando…" : "Guardar sin enviar"}
              </button>
            )}
            {acciones.map((a) => {
              const t = TRANSICIONES[a];
              const destructiva = a === "rechazar" || a === "devolver";
              const principal = a === "aprobar" || a === "armar_perfil";
              if (a === "publicar") return null; // se publica desde Vacantes
              return (
                <button
                  key={a}
                  onClick={() => mover(a)}
                  disabled={!!enviando}
                  className={
                    "text-sm px-4 py-2 rounded-full font-medium disabled:opacity-50 " +
                    (principal
                      ? "bg-black text-white hover:bg-gray-800"
                      : destructiva
                        ? "border border-red-300 text-red-700 hover:bg-red-50"
                        : "border border-gray-300 hover:bg-gray-50")
                  }
                >
                  {enviando === a ? "…" : t.label}
                </button>
              );
            })}
          </div>

          {req.vacancy_id && (
            <div className="flex items-center gap-3 pt-1 flex-wrap">
              {/* Qué falta publicar, a la vista y no escondido dentro del panel.
                  «Publicada» se leía como «ya salió a todos lados» cuando podía
                  estar solo en la página de empleo. */}
              {pendientes === null ? (
                <p className="text-xs text-gray-400">
                  Vacante creada en el ATS. El proceso corre en el Funnel.
                </p>
              ) : pendientes.length === 0 ? (
                <p className="text-xs text-emerald-700 font-medium">
                  Publicada en las 5 fuentes.
                </p>
              ) : (
                <p className="text-xs text-amber-700">
                  Falta publicarla en <strong>{pendientes.join(", ")}</strong>.
                </p>
              )}
              <button
                onClick={abrirPublicacion}
                className="text-sm px-4 py-2 rounded-full bg-black text-white hover:bg-gray-800 font-medium"
              >
                Publicar en las fuentes
              </button>
            </div>
          )}

          {/* Vacantes abiertas sin requisición · hay que decidir antes de aprobar */}
          {duplicadas && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-2xl p-6 max-h-[88vh] overflow-y-auto">
                <h4 className="text-base font-bold text-black">
                  ¿Esta requisición es para una vacante que ya está abierta?
                </h4>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  En el ATS hay {duplicadas.length === 1 ? "una vacante abierta" : `${duplicadas.length} vacantes abiertas`}{" "}
                  que no {duplicadas.length === 1 ? "pertenece" : "pertenecen"} a ninguna requisición.
                  Si «{req.title}» es {duplicadas.length === 1 ? "esa misma" : "alguna de esas"}, hay que
                  vincularla: creando una nueva, los candidatos se quedan en la vieja y el funnel
                  muestra el proceso vacío.
                </p>

                <div className="mt-4 space-y-2">
                  {duplicadas.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => mover("aprobar", { vincular_vacante_id: v.id })}
                      disabled={!!enviando}
                      className="w-full text-left border border-gray-300 rounded-lg px-4 py-3 hover:border-black hover:bg-gray-50 disabled:opacity-50"
                    >
                      <div className="text-sm font-semibold text-black">{v.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Abierta desde {new Date(v.created_at).toLocaleDateString("es-CO")} · usar esta
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setDuplicadas(null)}
                    className="text-sm px-4 py-2 rounded-full border border-gray-300 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => mover("aprobar", { crear_vacante_nueva: true })}
                    disabled={!!enviando}
                    className="text-sm px-4 py-2 rounded-full border border-gray-300 hover:border-black disabled:opacity-50"
                  >
                    Ninguna · crear una vacante nueva
                  </button>
                </div>
              </div>
            </div>
          )}

          {redactando && (
            <AvisoMultiIdioma
              requisitionId={req.id}
              titulo={req.title}
              onUsar={(c: CamposGenerados) => {
                // Solo pisa lo que el agente trajo: si un campo ya estaba
                // escrito a mano y el agente no lo devolvió, se conserva.
                setPerfil((p) => ({
                  ...p,
                  responsibilities: c.responsibilities ?? p.responsibilities,
                  requirements: c.requirements ?? p.requirements,
                  nice_to_have: c.nice_to_have ?? p.nice_to_have,
                  title_en: c.title_en ?? p.title_en,
                  hook_en: c.hook_en ?? p.hook_en,
                  description_en: c.description_en ?? p.description_en,
                  responsibilities_en: c.responsibilities_en ?? p.responsibilities_en,
                  requirements_en: c.requirements_en ?? p.requirements_en,
                  nice_to_have_en: c.nice_to_have_en ?? p.nice_to_have_en,
                }));
              }}
              onCerrar={() => setRedactando(false)}
            />
          )}

          {publicando && req.vacancy_id && (
            <PublishPanel
              vacancyId={req.vacancy_id}
              requisicionId={req.id}
              datos={{
                title: req.title,
                title_en: req.title_en,
                hook_en: req.hook_en,
                area: req.area,
                location: req.location,
                work_mode: req.work_mode,
                salary_public: req.salary_public,
                description: req.job_description,
                description_en: req.description_en,
                responsibilities: req.responsibilities,
                responsibilities_en: req.responsibilities_en,
                requirements: req.requirements,
                requirements_en: req.requirements_en,
                nice_to_have: req.nice_to_have,
                nice_to_have_en: req.nice_to_have_en,
              }}
              urlAplicacion={urlAplicacion}
              onCerrar={() => {
                setPublicando(false);
                onCambio();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Levantar una requisición desde el ATS (cuando ningún líder la pidió).
// Cae en "Para armar el perfil", igual que las que llegan de WXM, y sigue el
// mismo flujo: armar perfil → aprobar → nace la vacante → publicar.
// ─────────────────────────────────────────────────────────────────────────────
function NuevaRequisicion({
  onCerrar,
  onCreada,
}: {
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const [f, setF] = useState({
    title: "",
    lead_email: "",
    lead_name: "",
    area: "",
    requisition_type: "incremental" as "reemplazo" | "incremental",
    reason: "",
    needed_by: "",
    lead_responsibilities: "",
    lead_must_haves: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function enviar() {
    if (!f.title.trim()) { setProblema("Falta el cargo que necesitas."); return; }
    if (!f.lead_email.trim()) { setProblema("Falta el correo del líder solicitante."); return; }
    setEnviando(true);
    setProblema(null);
    try {
      const r = await fetch("/api/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.title.trim(),
          lead_email: f.lead_email.trim().toLowerCase(),
          lead_name: f.lead_name.trim() || null,
          area: f.area.trim() || null,
          requisition_type: f.requisition_type,
          reason: f.reason.trim() || null,
          needed_by: f.needed_by || null,
          lead_responsibilities: f.lead_responsibilities.trim() || null,
          lead_must_haves: f.lead_must_haves.trim() || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setProblema([j.error, j.detail].filter(Boolean).join(" · ") || "No se pudo crear"); return; }
      onCreada();
    } catch (e: any) {
      setProblema(e?.message || "Error de red");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
      className="fixed inset-0 z-50 bg-black/35 flex items-start justify-center px-4 py-10 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-bold">Nueva requisición</h2>
        <p className="text-sm text-gray-500 mt-0.5 mb-5">
          Levántala tú cuando ningún líder la pidió. Cae en «Para armar el perfil» y sigue el mismo flujo.
        </p>

        <label className="block mb-4">
          <span className="block text-xs font-semibold mb-1.5">Cargo que necesitas *</span>
          <input value={f.title} onChange={(e) => set("title", e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            placeholder="Ej: Operations Executive" />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Líder solicitante · correo *</span>
            <input value={f.lead_email} onChange={(e) => set("lead_email", e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
              placeholder="lider@tradingsolutions.com" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Nombre del líder</span>
            <input value={f.lead_name} onChange={(e) => set("lead_name", e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
              placeholder="Opcional" />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Área</span>
            <input value={f.area} onChange={(e) => set("area", e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
              placeholder="Ej: Operations" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Tipo</span>
            <select value={f.requisition_type}
              onChange={(e) => set("requisition_type", e.target.value as "reemplazo" | "incremental")}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
              <option value="incremental">Incremental · puesto nuevo (Chief + CWO)</option>
              <option value="reemplazo">Reemplazo · el cupo ya existe (Chief)</option>
            </select>
          </label>
        </div>

        <label className="block mb-4">
          <span className="block text-xs font-semibold mb-1.5">¿Por qué se necesita?</span>
          <textarea value={f.reason} onChange={(e) => set("reason", e.target.value)} rows={3}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            placeholder="Lo que sustenta la vacante ante el CWO." />
        </label>

        <label className="block mb-4">
          <span className="block text-xs font-semibold mb-1.5">¿Qué va a hacer? · una por línea</span>
          <textarea value={f.lead_responsibilities} onChange={(e) => set("lead_responsibilities", e.target.value)} rows={3}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            placeholder="Las tareas del día a día." />
        </label>

        <label className="block mb-4">
          <span className="block text-xs font-semibold mb-1.5">¿Qué no puede faltar? · una por línea</span>
          <textarea value={f.lead_must_haves} onChange={(e) => set("lead_must_haves", e.target.value)} rows={3}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            placeholder="Solo lo indispensable." />
        </label>

        <label className="block mb-4">
          <span className="block text-xs font-semibold mb-1.5">¿Para cuándo?</span>
          <input type="date" value={f.needed_by} onChange={(e) => set("needed_by", e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
        </label>

        {problema && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 mb-3">
            {problema}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onCerrar}
            className="text-sm px-4 py-2 rounded-full border border-gray-300 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={enviar} disabled={enviando}
            className="text-sm px-5 py-2 rounded-full bg-black text-white hover:bg-gray-800 font-medium disabled:opacity-50">
            {enviando ? "Creando…" : "Crear requisición"}
          </button>
        </div>
      </div>
    </div>
  );
}
