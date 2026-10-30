"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Inbox, ClipboardList, ClipboardCheck, AlertTriangle, Mail, Hourglass, Target,
  Video, ListChecks, MessageSquare, UserCheck, Building2, Trophy, Send,
  CheckCircle2, XCircle, ArrowRight,
} from "lucide-react";
import RejectionModal from "./RejectionModal";
import { resolveCandidateLang, type CandidateLang } from "@/lib/candidate-lang";
import { NOTA_BATERIA_PENDIENTE } from "@/lib/battery-auto-send";
import RecruiterAssessmentCard from "./RecruiterAssessmentCard";
import JointSchedulingModal from "./JointSchedulingModal";
import CandidateFilesBlock from "./CandidateFilesBlock";
import EvaluacionPanel from "./EvaluacionPanel";
import { rubricaDeVacante } from "@/lib/rubricas";
import { escucharPedidos, pedirAbrirCandidato, tomarPedidoDeCandidato } from "@/lib/abrirCandidato";
import FunnelDashboard from "@/components/FunnelDashboard";
import HistorialContactos from "@/components/HistorialContactos";
import SeguimientoVacante from "@/components/SeguimientoVacante";
import { CanalSelect, errorCanal } from "@/components/CamposObligatorios";
import { etiquetaCanal } from "@/lib/candidate-source";
import { InvitarEntrevistaModal } from "@/components/InvitarEntrevistaModal";
import { visibleRecommendation } from "@/lib/ai-recommendation";

// Map de stage → icono Lucide. Centralizado para reutilizar en cualquier render.
const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  aplico: Inbox,
  prefiltro_enviado: ClipboardList,
  prefiltro_pasado: ClipboardCheck,
  prefiltro_revision: AlertTriangle,
  assessment_invitado: Mail,
  assessment_en_progreso: Hourglass,
  assessment_completado: Target,
  entrevista_ia: Video,
  bateria_psicometrica: ListChecks,
  recruiter_interview: MessageSquare,
  cwo_interview: UserCheck,
  touring: Building2,
  terna: Trophy,
  oferta: Send,
  contratado: CheckCircle2,
  rechazado: XCircle,
};

export function StageIcon({ stage, className = "w-4 h-4" }: { stage: string; className?: string }) {
  const Icon = STAGE_ICONS[stage] || Inbox;
  return <Icon className={className} />;
}

type Cand = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  stage: string | null;
  vacancy_id: string;
  prefilter_decision: string | null;
  prefilter_completed_at: string | null;
  prefilter_data: PrefilterData | null;
  cv_url: string | null;
  /** De dónde salió el candidato · 'cv_proceso_anterior' = HV cargada de un
   *  banco o de una búsqueda previa, no aplicó por la web. */
  source?: string | null;
  preferred_language?: string | null;
  notes?: string | null;
  ht_vacancies?: { title: string; form_template_key?: string | null; country?: string | null };
  // Rejection metadata · llenado al rechazar con motivo
  rejection_category?: string | null;
  rejection_sub_detail?: string | null;
  rejection_save_for_future?: boolean | null;
  rejected_at?: string | null;
  rejection_note_public?: string | null;
  rejection_sent_at?: string | null;
  rejection_draft_id?: string | null;
  /** El listado trae `select *`. Sirven para el aging del journey; no son un stage nuevo. */
  created_at?: string | null;
  updated_at?: string | null;
};

function langDe(c: Pick<Cand, "preferred_language" | "ht_vacancies">): CandidateLang {
  return resolveCandidateLang({
    preferredLanguage: c.preferred_language,
    formTemplateKey: c.ht_vacancies?.form_template_key,
    jobTitle: c.ht_vacancies?.title,
    country: c.ht_vacancies?.country,
  });
}

type PrefilterData = {
  doc_type?: string;
  doc_number?: string;
  phone?: string;
  city?: string;
  salary?: string;
  availability?: string;
  relocate?: string;
  english_level?: string;
  english_cert?: string;
  edu_type?: string;
  years_logistics?: number;
  intl_clients?: boolean;
  excel_level?: number;
  crms?: string[];
  years_sales?: number;
  pricing_exp?: boolean;
  leadership?: boolean;
  team_size?: number;
  why_ts?: string;
  next_role?: string;
  extra?: string;
  submitted_at?: string;
  // SIG-SST · plantilla sig_sst. Sin esto la ficha mostraba el prefiltro de
  // comex y las respuestas de credenciales quedaban invisibles.
  license_status?: string;
  license_number?: string;
  license_expiry?: string;
  course_50h?: boolean;
  course_20h?: boolean;
  course_20h_year?: string;
  postgrad_sig?: boolean;
  auditor_certs?: string[];
  systems_managed?: string[];
  sectors?: string[];
  years_sig?: number;
  years_leading_sig?: number;
  cert_audit_cycles?: number;
  case_answer?: string;
  // China / Panama Ops · plantillas EN. El _meta del prefiltro trae los
  // knock-outs y el salario; sin esto la ficha no mostraba nada de lo que
  // el candidato respondió y había que ir a la base a mirarlo.
  current_city?: string;
  work_authorized?: boolean;
  onsite_available?: boolean;
  work_authorized_panama?: boolean;
  onsite_panama_city?: boolean;
  years_freight_panama?: number;
  ocean_fcl_lcl?: boolean;
  air_freight?: boolean;
  bl_awb_docs?: boolean;
  warehouse_ftz?: boolean;
  salary_usd?: string;
  years_experience?: number;
  pipl_consent?: boolean;
  privacy_consent?: boolean;
  _meta?: {
    china?: boolean;
    panama_ops?: boolean;
    salary_usd_expectation?: string | null;
    salary_usd_parsed?: number | null;
    salary_cap_usd?: number;
    salary_over_budget?: boolean;
    english_candidate_rank?: number;
    english_min_required_rank?: number;
    english_fails?: boolean;
    work_authorized?: boolean;
    onsite_available?: boolean;
    work_authorized_panama?: boolean;
    onsite_panama_city?: boolean;
    years_freight_panama?: number;
    years_freight_short?: boolean;
    ocean_fcl_lcl?: boolean;
    air_freight?: boolean;
    bl_awb_docs?: boolean;
    warehouse_ftz?: boolean;
  };
};

/** Etiqueta legible del estado de la licencia en SST. */
const LICENCIA_LABEL: Record<string, string> = {
  si: "Vigente",
  vencida: "Vencida",
  tramite: "En trámite",
  no: "No la tiene",
};

type Vacancy = {
  id: string;
  title: string;
  status?: string | null;
  created_at?: string | null;
  requisition_id?: string | null;
  ht_candidates?: { count: number }[];
  /** Quién responde por el proceso · null mientras nadie lo tenga asignado. */
  owner_recruiter_id?: string | null;
  /** Quien puede operarla igual sin aparecer frente al candidato. */
  support_recruiter_id?: string | null;
  /** Hiring Lead del área. No es el dueño del proceso (owner_recruiter_id). */
  hiring_lead_email?: string | null;
};

/** El equipo de Talent, para saber de quién es cada vacante. */
type Reclutador = { id: string; nombre: string; rol: string; calendly_url: string | null };

/** Cuántos candidatos tiene una vacante, según el conteo que ya trae la API. */
function candidatosDe(v: Vacancy): number {
  return v.ht_candidates?.[0]?.count ?? 0;
}

/**
 * Arma las opciones del selector de vacante.
 *
 * POR QUÉ NO ES UN .map() DIRECTO
 * El desplegable listaba todas las vacantes tal cual, incluidas las cerradas y
 * las repetidas. Con cinco «Talent Acquisition Specialist» seguidas —resultado
 * de que el sync creara una nueva cada vez que el título ya estaba duplicado—
 * no hay forma de saber cuál es cuál, y elegir la equivocada significa mirar un
 * funnel vacío creyendo que no hay candidatos.
 *
 * Ahora el desplegable muestra SOLO las abiertas. Las cerradas que todavía
 * tienen gente adentro no se borran de la vista: quedan detrás de la casilla
 * «ver cerradas», porque el proceso de esas personas existió y a veces hay que
 * volver a mirarlo. Y cuando un título está repetido se le agrega el conteo y
 * la fecha, para poder distinguir cuál es cuál.
 *
 * EL DESEMPATE SE MIDE ENTRE LO QUE ESTÁ EN PANTALLA
 * Antes los repetidos se contaban sobre TODAS las vacantes. Hay cuatro «Talent
 * Acquisition Specialist» cerradas y vacías que el desplegable nunca muestra,
 * y por culpa de ellas la única visible salía con «· 24 candidatos · con
 * requisición · 26/8/2026» colgando. Un desempate contra opciones que no están
 * en la lista no desempata nada: solo ensucia el nombre.
 *
 * Ahora se cuenta sobre las opciones que el <select> va a dibujar de verdad,
 * que dependen de si «ver cerradas» está marcado y de cuál está seleccionada.
 * Efecto: el nombre sale limpio, y el detalle aparece justo cuando dos
 * opciones con el mismo título quedan una al lado de la otra.
 */
function opcionesDeVacante(vacancies: Vacancy[], verCerradas: boolean, vacFilter: string) {
  const esAbierta = (v: Vacancy) => v.status == null || v.status === "open";

  const abiertas = vacancies.filter(esAbierta);
  // Las cerradas con gente adentro existen siempre, pero solo se dibujan si se
  // piden — o si es la que está seleccionada, que si no quedaría en blanco.
  const cerradas = vacancies.filter((v) => !esAbierta(v) && candidatosDe(v) > 0);
  const cerradasVisibles = cerradas.filter((v) => verCerradas || v.id === vacFilter);

  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const v of [...abiertas, ...cerradasVisibles]) {
    const t = v.title.trim().toLowerCase();
    if (vistos.has(t)) repetidos.add(t);
    vistos.add(t);
  }

  const etiqueta = (v: Vacancy) => {
    if (!repetidos.has(v.title.trim().toLowerCase())) return v.title;
    const n = candidatosDe(v);
    const partes: string[] = [n === 1 ? "1 candidato" : `${n} candidatos`];
    if (v.requisition_id) partes.push("con requisición");
    if (v.created_at) partes.push(new Date(v.created_at).toLocaleDateString("es-CO"));
    return `${v.title} · ${partes.join(" · ")}`;
  };

  return {
    abiertas: abiertas.map((v) => ({ id: v.id, label: etiqueta(v) })),
    // Se devuelven TODAS las cerradas con candidatos: el contador de la casilla
    // «ver cerradas (8)» las cuenta, aunque no estén dibujadas.
    cerradas: cerradas.map((v) => ({ id: v.id, label: etiqueta(v) })),
  };
}

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

// Definición del funnel — agrupado por fase semántica con paleta TS sobria
// (negros, grises y solo 2 acentos: emerald para terminal positivo, red para rechazo).
// La distinción entre stages se hace por categoría visual, no por colores brillantes.
import {
  STAGES as CANON_STAGES,
  STAGE_CATEGORY,
  normalizeStage,
  stageOrder,
  siguienteEtapa,
  stageLabel,
  stageSla,
  slaStatus,
  KELLY_GATES,
  kellyGateFromStage,
  type KellyGate,
} from "@/lib/stage-labels";

type StageCategory = "screening" | "assessment" | "interview" | "decision" | "terminal-positive" | "terminal-negative";
// Owner = de quién depende mover la pelota en este stage.
//   candidate → estamos esperando que el candidato responda/haga algo
//   recruiter → la pelota está en cancha de Talento (revisar, decidir, agendar)
//   shared    → coordinación entre ambos (touring requiere agenda + asistencia)
type StageOwner = "candidate" | "recruiter" | "shared" | "terminal";

// v4 · 18-ago-2026 — las etapas ya NO se declaran acá.
// Salen de src/lib/stage-labels.ts, que es la fuente única de verdad del
// proceso (Selección 8 etapas → Contratación 5). Este bloque solo traduce
// esa definición a la forma que el kanban necesita (category + owner).
const OWNER_BY_STAGE: Record<string, StageOwner> = {
  aplico: "recruiter",
  prefiltro_enviado: "candidate",
  prefiltro_pasado: "recruiter",
  prefiltro_revision: "recruiter",
  pruebas: "candidate",
  recruiter_interview: "recruiter",
  prueba_tecnica: "shared",
  terna: "recruiter",
  examenes_medicos: "candidate",
  estudio_seguridad: "shared",
  documentacion_ingreso: "candidate",
  oferta: "candidate",
  contratado: "terminal",
};

const STAGES: Array<{ id: string; label: string; category: StageCategory; owner: StageOwner }> =
  CANON_STAGES.map((s) => ({
    id: s.id,
    label: s.label,
    category: (s.id === "contratado" ? "terminal-positive" : STAGE_CATEGORY[s.id]) as StageCategory,
    owner: OWNER_BY_STAGE[s.id] ?? "recruiter",
  }));

/**
 * El tablero es el journey de los 12 gates de Kelly, en este orden
 * (Docs después de Oferta, Onboarding incluido). No hay columnas.
 * Psicométricas y Entrevista HM solo se llenan con codes históricos:
 * no tienen code v4 propio hasta que Kelly lo nombre.
 */
const OWNER_BY_GATE: Record<string, StageOwner> = {
  psicometricas: "candidate",
  entrevista_hm: "recruiter",
};
function ownerDeGate(g: KellyGate): StageOwner {
  return OWNER_BY_GATE[g.id] ?? OWNER_BY_STAGE[g.stages[0]] ?? "recruiter";
}

/** Nota de producto del gate. Assessment es Case global ± On-call. */
const GATE_NOTA: Partial<Record<string, string>> = {
  assessment: "Case global ± On-call",
};

const REJECTED_STAGE = { id: "rechazado", label: "Rechazado", category: "terminal-negative" as StageCategory, owner: "terminal" as StageOwner };

const OWNER_STYLE: Record<StageOwner, { label: string; barColor: string; bgTint: string }> = {
  candidate: { label: "Candidato",  barColor: "#1e40af", bgTint: "rgba(30,64,175,0.04)" },  // azul corporativo
  recruiter: { label: "Reclutador", barColor: "#0a0a0a", bgTint: "rgba(10,10,10,0.04)" },   // negro TS
  shared:    { label: "Compartido", barColor: "#b45309", bgTint: "rgba(180,83,9,0.04)" },    // ámbar
  terminal:  { label: "—",          barColor: "#737373", bgTint: "transparent" },
};

// El rediseño del 28-ago retiró CATEGORY_STYLE, que pintaba cada cabecera de
// negro y cada columna de un tono según la categoría. Ahora la etapa se
// distingue por el peso del nombre y un punto de color; el fondo dejó de
// cargar significado, y con eso el tablero deja de competir con los nombres
// de los candidatos.

export default function PipelineFunnel({
  onBuscarBanco,
}: {
  /** Abre el rediscovery HT de la vacante filtrada. Opcional: el dashboard ya lo tiene en la card. */
  onBuscarBanco?: (vacancy: { id: string; title: string }) => void;
} = {}) {
  const [vista, setVista] = useState<"pipeline" | "dashboard">("pipeline");
  const [candidates, setCandidates] = useState<Cand[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  /** El equipo de Talent. Si la tabla todavía no existe, queda vacío y el
   *  funnel se ve exactamente como antes: nadie pierde el tablero por esto. */
  const [reclutadores, setReclutadores] = useState<Reclutador[]>([]);
  /** Filtro por quién lleva el proceso · 'all' mientras no se elija a nadie. */
  const [duenoFilter, setDuenoFilter] = useState("all");
  // El desplegable arranca solo con las abiertas: es lo que se está trabajando.
  const [verCerradas, setVerCerradas] = useState(false);
  /** Origen: separa lo que se cargó de un proceso anterior de lo que llegó solo. */
  const [origenFilter, setOrigenFilter] = useState<"all" | "cv_proceso_anterior" | "web">("all");
  // Inicializar vacFilter desde URL query (?vacancy=UUID) — persiste entre reloads.
  // Usamos query string (no hash) porque el HR Admin ya usa el hash para el tab.
  const [vacFilter, setVacFilterState] = useState(() => {
    if (typeof window === 'undefined') return 'all';
    const params = new URLSearchParams(window.location.search);
    return params.get('vacancy') || 'all';
  });
  const setVacFilter = (v: string) => {
    setVacFilterState(v);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (v === 'all') params.delete('vacancy');
      else params.set('vacancy', v);
      const search = params.toString();
      // Preservar el hash (que tiene el tab)
      const newUrl = `${window.location.pathname}${search ? '?' + search : ''}${window.location.hash}`;
      window.history.replaceState(null, '', newUrl);
    }
  };
  /**
   * Las vacantes que se están mirando según el filtro por dueño.
   *
   * El apoyo cuenta igual que el dueño: si alguien cubre una vacante mientras
   * el otro está fuera, tiene que verla en su lista o el filtro le esconde
   * justo el trabajo que le tocó.
   */
  const vacantesVisibles = useMemo(
    () =>
      duenoFilter === "all"
        ? vacancies
        : vacancies.filter(
            (v) => v.owner_recruiter_id === duenoFilter || v.support_recruiter_id === duenoFilter,
          ),
    [vacancies, duenoFilter],
  );
  const opcionesVacante = useMemo(
    () => opcionesDeVacante(vacantesVisibles, verCerradas, vacFilter),
    [vacantesVisibles, verCerradas, vacFilter],
  );
  const [loading, setLoading] = useState(true);
  const [agregar, setAgregar] = useState(false);
  const [selectedCand, setSelectedCand] = useState<Cand | null>(null);
  // Quiénes escribieron y esperan respuesta nuestra · lo llena el panel de
  // seguimiento y se marca en las tarjetas.
  const [esperandoIds, setEsperandoIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; ok: number; fail: number } | null>(null);
  /** Estado de la bateria por candidato · ht_candidate_id -> estado. */
  const [bateria, setBateria] = useState<Record<string, BatEstado>>({});
  /** Gate encendido del journey. Null = el primero que tenga gente. */
  const [litGateId, setLitGateId] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  /**
   * Si la vacante filtrada ya no está en el desplegable, se vuelve a «todas».
   *
   * POR QUÉ
   * El filtro vive en la URL (?vacancy=UUID). Si esa vacante se cierra y queda
   * sin candidatos, desaparece de las dos listas del selector — y un <select>
   * cuyo `value` no existe entre sus opciones muestra la PRIMERA, o sea «Todas
   * las vacantes», mientras el filtro real sigue apuntando a la vacante
   * invisible. La pantalla dice «todas» y no muestra a nadie. Pasa al cerrar
   * una vacante teniéndola abierta en el Funnel.
   */
  useEffect(() => {
    if (vacFilter === "all" || vacancies.length === 0) return;
    const existe = [...opcionesVacante.abiertas, ...opcionesVacante.cerradas]
      .some((o) => o.id === vacFilter);
    if (!existe) setVacFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vacancies, opcionesVacante, vacFilter]);

  // Listener para back/forward del browser (popstate)
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('vacancy') || 'all';
      setVacFilterState(v);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function clearSelection() { setSelectedIds(new Set()); }
  function selectAllInStage(stageId: string) {
    // Sobre lo que se está viendo, no sobre la base entera: si no, «seleccionar
    // toda la columna» alcanzaba a gente de procesos cerrados que no aparece
    // en pantalla, y la acción siguiente les caía encima sin que nadie lo viera.
    const ids = filtered.filter(c => kellyGateFromStage(c.stage)?.id === stageId).map(c => c.id);
    setSelectedIds(prev => {
      const n = new Set(prev);
      ids.forEach(id => n.add(id));
      return n;
    });
  }

  async function load() {
    setLoading(true);
    try {
      const [cRes, vRes] = await Promise.all([
        fetch(`/api/headhunting/candidates?client_id=${TS_CLIENT_ID}`),
        fetch(`/api/headhunting/vacancies?client_id=${TS_CLIENT_ID}`),
      ]);
      const cJ = await cRes.json();
      const vJ = await vRes.json();
      // Excluir internos
      const real = (cJ.candidates || []).filter((c: Cand) => !/@tradingsolutions\.com$/i.test(c.email || ""));
      setCandidates(real);
      setVacancies(vJ.vacancies || []);
      // La bateria va aparte y es tolerante a fallo: si no carga, el funnel
      // sigue sirviendo, solo que sin los chips de la prueba.
      void cargarBateria();
      void cargarReclutadores();
    } finally {
      setLoading(false);
    }
  }

  /** El equipo, para el filtro por dueño. Tolerante a fallo a propósito: si la
   *  migración de reclutadores no está corrida, el funnel no se entera. */
  async function cargarReclutadores() {
    try {
      const r = await fetch("/api/admin/reclutadores", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setReclutadores(j.reclutadores || []);
    } catch { /* el funnel no depende de esto */ }
  }

  async function cargarBateria() {
    try {
      const r = await fetch("/api/bateria/estado", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setBateria(j.estados || {});
    } catch { /* el funnel no depende de esto */ }
  }

  /**
   * Abrir la ficha de alguien desde otra pantalla — hoy, desde el 9-box.
   *
   * Si el candidato todavía no está en memoria, se espera a que termine la
   * carga en vez de no hacer nada: un clic que no abre nada es peor que uno
   * que demora, porque no se sabe si falló o si la persona no existe.
   */
  // Es estado y no una ref a propósito: recogerlo tiene que provocar un
  // render, si no el efecto de abajo no vuelve a correr y el pedido se queda
  // esperando para siempre cuando la lista ya estaba cargada.
  const [pedido, setPedido] = useState<string | null>(null);

  // Recoger: al montar (se pidió desde otra pestaña y el Funnel todavía no
  // existía) y cuando llega el evento (ya estaba en pantalla).
  useEffect(() => {
    function recoger() {
      const id = tomarPedidoDeCandidato();
      if (id) setPedido(id);
    }
    recoger();
    return escucharPedidos(recoger);
  }, []);

  // Y resolverlo cuando la lista esté cargada. Si se pidió antes de que los
  // candidatos llegaran, el pedido espera acá en vez de perderse.
  useEffect(() => {
    if (!pedido) return;
    const c = candidates.find((x) => x.id === pedido);
    if (c) { setSelectedCand(c); setPedido(null); }
  }, [candidates, pedido]);

  /**
   * «Todas las vacantes» son las que están ABIERTAS, no todas las que existieron.
   *
   * POR QUÉ
   * Antes no filtraba nada: traía los 802 candidatos históricos desde abril,
   * mezclando procesos cerrados hace meses —Inside Sales, Customer
   * Documentation, Pricing— con los cuatro que están corriendo. El tablero
   * dejaba de ser el trabajo de hoy y pasaba a ser el archivo de la compañía,
   * con columnas de cientos de personas que ya nadie va a mover.
   *
   * Las cerradas siguen a un clic: la casilla «ver cerradas» las vuelve a
   * incluir, porque el proceso de esas personas existió y a veces hay que
   * volver a mirarlo.
   */
  const idsAbiertas = useMemo(
    () => new Set(vacancies.filter(v => v.status == null || v.status === "open").map(v => v.id)),
    [vacancies],
  );

  /** Ids de las vacantes del dueño elegido · vacío significa «sin filtro». */
  const idsDelDueno = useMemo(
    () => (duenoFilter === "all" ? null : new Set(vacantesVisibles.map((v) => v.id))),
    [duenoFilter, vacantesVisibles],
  );

  const filtered = useMemo(() => {
    let base: Cand[];
    if (vacFilter !== "all") base = candidates.filter(c => c.vacancy_id === vacFilter);
    else if (idsDelDueno) base = candidates.filter(c => c.vacancy_id && idsDelDueno.has(c.vacancy_id));
    else if (verCerradas) base = candidates;
    // Sin vacantes cargadas todavía no se esconde nada: mejor de más que un
    // tablero vacío mientras llega la respuesta.
    else if (idsAbiertas.size === 0) base = candidates;
    else base = candidates.filter(c => c.vacancy_id && idsAbiertas.has(c.vacancy_id));

    if (origenFilter === "cv_proceso_anterior") {
      return base.filter(c => c.source === "cv_proceso_anterior");
    }
    if (origenFilter === "web") {
      return base.filter(c => c.source !== "cv_proceso_anterior");
    }
    return base;
  }, [candidates, vacFilter, verCerradas, idsAbiertas, origenFilter, idsDelDueno]);

  /** Dentro de cada columna, quien ya tiene resultado de bateria va primero y
   *  de mayor a menor match. El orden ES el ranking: no hace falta abrir otra
   *  pantalla para saber por quien empezar. Los que no la han presentado
   *  conservan su orden y quedan debajo. */
  const ordenarPorBateria = useCallback((lista: Cand[]) => {
    const m = (c: Cand) => {
      const e = bateria[c.id];
      return e && e.status === "completed" && e.match != null ? e.match : null;
    };
    return [...lista].sort((a, b) => {
      const ma = m(a), mb = m(b);
      if (ma == null && mb == null) return 0;
      if (ma == null) return 1;
      if (mb == null) return -1;
      return mb - ma;
    });
  }, [bateria]);

  const byStage = useMemo(() => {
    const m: Record<string, Cand[]> = {};
    [...STAGES, REJECTED_STAGE].forEach(s => { m[s.id] = []; });
    filtered.forEach(c => {
      // normalizeStage traduce los codes históricos (touring, cwo_interview,
      // bateria_psicometrica…) a la etapa v4 que les corresponde.
      const stage = normalizeStage(c.stage) || "aplico";
      if (!m[stage]) m[stage] = [];
      m[stage].push(c);
    });
    for (const k of Object.keys(m)) m[k] = ordenarPorBateria(m[k]);
    return m;
  }, [filtered, ordenarPorBateria]);

  const byGate = useMemo(() => {
    const m: Record<string, Cand[]> = {};
    KELLY_GATES.forEach(g => { m[g.id] = []; });
    filtered.forEach(c => {
      const gate = kellyGateFromStage(c.stage);
      if (gate && m[gate.id]) m[gate.id].push(c);
    });
    for (const k of Object.keys(m)) m[k] = ordenarPorBateria(m[k]);
    return m;
  }, [filtered, ordenarPorBateria]);

  const leadPorVacante = useMemo(() => {
    const m: Record<string, string> = {};
    for (const v of vacancies) {
      const email = (v.hiring_lead_email ?? "").trim();
      if (email) m[v.id] = email;
    }
    return m;
  }, [vacancies]);

  const litGate = useMemo(() => {
    if (litGateId) {
      const elegido = KELLY_GATES.find((g) => g.id === litGateId);
      if (elegido) return elegido;
    }
    return KELLY_GATES.find((g) => (byGate[g.id] || []).length > 0) ?? KELLY_GATES[0];
  }, [litGateId, byGate]);

  const totals = filtered.length;
  const hiredCount = (byStage['contratado'] || []).length;
  const rejectedCount = (byStage['rechazado'] || []).length;
  const activeCount = totals - hiredCount - rejectedCount;

  return (
    <div className="font-sans">
      {/* ════════════════ HEADER EDITORIAL ════════════════ */}
      <div className="mb-8 pb-6 border-b border-[var(--ts-gray-10)]">
        <div className="flex items-end justify-between flex-wrap gap-6">
          <div>
            <div className="ts-eyebrow mb-3">Talent Acquisition · Pipeline</div>
            <h1 className="ts-display text-[44px] md:text-[56px] text-[var(--ts-black)] m-0">
              Funnel
            </h1>
            <div className="mt-3 inline-flex rounded-full border border-[color:var(--ts-line)] bg-white p-0.5">
              <button
                type="button"
                onClick={() => setVista("pipeline")}
                className={`rounded-full px-4 py-1 text-[13px] ${vista === "pipeline" ? "bg-[var(--ts-ink)] text-white" : "text-[var(--ts-ink)]"}`}
              >
                Pipeline
              </button>
              <button
                type="button"
                onClick={() => setVista("dashboard")}
                className={`rounded-full px-4 py-1 text-[13px] ${vista === "dashboard" ? "bg-[var(--ts-ink)] text-white" : "text-[var(--ts-ink)]"}`}
              >
                Dashboard
              </button>
            </div>
            <p className="text-[15px] text-[var(--ts-gray-60)] mt-3 max-w-[640px] leading-[1.55]">
              Vista del proceso completo · {totals} candidatos
              {vacFilter !== "all" && <span className="text-[var(--ts-black)] font-semibold"> · filtro activo</span>}
              <span className="text-[var(--ts-gray-40)]"> · </span>
              <span className="ts-tabular">{activeCount}</span> activos
              <span className="text-[var(--ts-gray-40)]"> · </span>
              <span className="ts-tabular text-[var(--ts-green)]">{hiredCount}</span> contratados
              <span className="text-[var(--ts-gray-40)]"> · </span>
              <span className="ts-tabular text-[var(--ts-red)]">{rejectedCount}</span> rechazados
              <span className="text-[var(--ts-gray-40)]"> · </span>
              <a href="/hr-admin/trazabilidad" className="underline text-[var(--ts-black)] font-semibold">
                Trazabilidad de contactos
              </a>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {/* Quién lleva el proceso. Aparece solo cuando hay equipo cargado:
                con una sola persona reclutando, el filtro es ruido. */}
            {reclutadores.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="ts-eyebrow text-[10px]">Reclutador</span>
                <select
                  value={duenoFilter}
                  onChange={(e) => {
                    setDuenoFilter(e.target.value);
                    setVacFilter("all");
                  }}
                  className="text-xs font-medium border border-[var(--ts-gray-20)] bg-white px-2 py-1 hover:border-[var(--ts-black)] focus:border-[var(--ts-black)] outline-none transition-colors"
                  style={{ borderRadius: 0 }}
                  title="Muestra solo las vacantes de esa persona, como dueña o como apoyo"
                >
                  <option value="all">Todo el equipo</option>
                  {reclutadores
                    .filter((r) => r.rol !== "hiring_manager")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                </select>
                <a
                  href="/hr-admin/reclutadores"
                  className="text-[11px] underline text-[var(--ts-gray-60)] hover:text-[var(--ts-black)] whitespace-nowrap"
                  title="Equipo de Talent y dueños de vacante"
                >
                  equipo
                </a>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="ts-eyebrow text-[10px]">Origen</span>
              <select
                value={origenFilter}
                onChange={(e) => setOrigenFilter(e.target.value as "all" | "cv_proceso_anterior" | "web")}
                className="text-xs font-medium border border-[var(--ts-gray-20)] bg-white px-2 py-1 hover:border-[var(--ts-black)] focus:border-[var(--ts-black)] outline-none transition-colors"
                style={{ borderRadius: 0 }}
                title="Separa las hojas de vida cargadas de un proceso anterior de quienes aplicaron por la web"
              >
                <option value="all">Todos</option>
                <option value="cv_proceso_anterior">CV proceso anterior</option>
                <option value="web">Aplicaron por la web</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setAgregar(true)}
              className="text-xs font-bold px-3 py-2.5 bg-black text-white"
              style={{ borderRadius: 0 }}
            >
              Agregar candidato
            </button>
            <span className="ts-eyebrow text-[10px]">Vacante</span>
            <div className="flex items-center gap-2">
              <select
                value={vacFilter}
                onChange={(e) => setVacFilter(e.target.value)}
                className="text-sm font-medium border border-[var(--ts-gray-20)] bg-white px-4 py-2.5 hover:border-[var(--ts-black)] focus:border-[var(--ts-black)] outline-none transition-colors min-w-[240px]"
                style={{ borderRadius: 0 }}
              >
                <option value="all">Todas las vacantes</option>
                {opcionesVacante.abiertas.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
                {/* Las cerradas solo aparecen si se piden. Se sigue mostrando
                    la que esté seleccionada aunque esté cerrada: si no, el
                    selector quedaría en blanco filtrando por algo invisible. */}
                {opcionesVacante.cerradas
                  .filter(o => verCerradas || o.id === vacFilter)
                  .length > 0 && (
                  <optgroup label="Cerradas (con candidatos)">
                    {opcionesVacante.cerradas
                      .filter(o => verCerradas || o.id === vacFilter)
                      .map(o => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                  </optgroup>
                )}
              </select>
              {opcionesVacante.cerradas.length > 0 && (
                <label
                  className="flex items-center gap-1.5 text-[11px] text-[var(--ts-gray-60)] whitespace-nowrap cursor-pointer"
                  title="Las vacantes cerradas que todavía tienen candidatos en el proceso"
                >
                  <input
                    type="checkbox"
                    checked={verCerradas}
                    onChange={(e) => setVerCerradas(e.target.checked)}
                  />
                  ver cerradas ({opcionesVacante.cerradas.length})
                </label>
              )}
              {vacFilter !== "all" && onBuscarBanco && (
                <button
                  type="button"
                  onClick={() => {
                    const v = vacancies.find((x) => x.id === vacFilter);
                    onBuscarBanco({ id: vacFilter, title: v?.title || "Vacante" });
                  }}
                  className="text-xs font-bold px-3 py-2.5 border border-black text-black hover:bg-black hover:text-white transition-colors whitespace-nowrap"
                  style={{ borderRadius: 0 }}
                  title="Buscar en el banco HT (rechazados o contratados de otras vacantes) y traerlos a esta"
                >
                  Buscar en banco
                </button>
              )}
              {vacFilter !== "all" && (
                <a
                  href={`/hr-admin/comparar/${vacFilter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold px-3 py-2.5 bg-black text-white hover:bg-gray-800 transition-colors whitespace-nowrap"
                  style={{ borderRadius: 0 }}
                  title="Ver tabla comparativa de todos los candidatos de esta vacante con sus evaluaciones"
                >
                  📊 Comparar
                </a>
              )}
              {vacFilter !== "all" && (
                <a
                  href={`/hr-admin/informe/${vacFilter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold px-3 py-2.5 border border-black text-black hover:bg-black hover:text-white transition-colors whitespace-nowrap"
                  style={{ borderRadius: 0 }}
                  title="Informe de la vacante en PDF para el hiring manager y la dirección · se puede dejar en borrador de Gmail"
                >
                  📄 Informe
                </a>
              )}
              {/* La matriz de pruebas externas de ESTA vacante. Sin este botón
                  la pantalla existe pero no se llega a ella, y una función a la
                  que solo se entra escribiendo la URL es una función que nadie
                  usa. Lleva la vacante puesta: el seguimiento de pruebas se
                  hace por cargo, no sobre la lista entera. */}
              {vacFilter !== "all" && (
                <a
                  href={`/hr-admin/pruebas-externas?vacancy=${vacFilter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold px-3 py-2.5 border border-black text-black hover:bg-black hover:text-white transition-colors whitespace-nowrap"
                  style={{ borderRadius: 0 }}
                  title="Quién presentó qué, en los seis proveedores · con el portal a un clic y el Excel de esta vacante"
                >
                  🧪 Pruebas externas
                </a>
              )}
            </div>
            {/* De quién es el proceso que se está mirando. Sin dueño no hay a
                quién preguntarle, y los correos salen con la agenda del
                equipo en vez de la de quien entrevista. */}
            {vacFilter !== "all" && reclutadores.length > 0 && (() => {
              const v = vacancies.find((x) => x.id === vacFilter);
              const dueno = reclutadores.find((r) => r.id === v?.owner_recruiter_id);
              const apoyo = reclutadores.find((r) => r.id === v?.support_recruiter_id);
              return (
                <div className="text-[11px] text-[var(--ts-gray-60)] mt-0.5">
                  {dueno ? (
                    <>
                      Lleva el proceso <span className="font-bold text-[var(--ts-black)]">{dueno.nombre}</span>
                      {apoyo && <> · apoyo {apoyo.nombre}</>}
                      {!dueno.calendly_url && <span className="text-amber-700"> · sin agenda propia</span>}
                    </>
                  ) : (
                    <span className="text-amber-700">Esta vacante no tiene dueño asignado</span>
                  )}
                  <a href="/hr-admin/reclutadores" className="underline ml-1.5">
                    cambiar
                  </a>
                </div>
              );
            })()}
            {vacFilter !== "all" && (() => {
              const email = (vacancies.find((x) => x.id === vacFilter)?.hiring_lead_email ?? "").trim();
              if (!email) return null;
              return (
                <div className="text-[11px] text-[var(--ts-gray-60)]">
                  Hiring Lead: <span className="font-bold text-[var(--ts-black)]">{email}</span>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {vista === "dashboard" ? (
        <FunnelDashboard
          onOpenCandidate={(id) => {
            pedirAbrirCandidato(id);
            setVista("pipeline");
          }}
        />
      ) : (
      <>
      {/* Seguimiento de contactos de la vacante elegida: quién espera
          respuesta nuestra y quién no tiene ningún contacto. */}
      {vacFilter !== "all" && (
        <SeguimientoVacante
          vacancyId={vacFilter}
          onEsperando={setEsperandoIds}
          onAbrir={(id) => {
            const c = candidates.find((x) => x.id === id);
            if (c) setSelectedCand(c);
          }}
        />
      )}

      {loading ? (
        <div className="text-center py-16 ts-eyebrow text-[var(--ts-gray-40)]">Cargando pipeline…</div>
      ) : (
        <>
          {/* Journey de 12 gates. Onboarding es el paso 12; rechazados quedan aparte. */}
          <JourneyBoard
            byGate={byGate}
            lit={litGate}
            onLit={setLitGateId}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onSelectAll={(id) => {
              const cands = byGate[id] || [];
              const todos = cands.length > 0 && cands.every((c) => selectedIds.has(c.id));
              if (todos) cands.forEach((c) => toggleSelect(c.id));
              else selectAllInStage(id);
            }}
            onOpen={setSelectedCand}
            bateria={bateria}
            esperandoIds={esperandoIds}
            leadPorVacante={leadPorVacante}
          />

          {/* Rechazados aparte del journey. Contratados viven en el gate 12. */}
          <div className="mt-6 border border-[var(--ts-gray-20)]">
            <RejectedColumn
              cands={byStage['rechazado'] || []}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
              onSelect={setSelectedCand}
              onChanged={() => { void load(); }}
            />
          </div>

          {/* Bulk action bar — floating bottom */}
          {selectedIds.size > 0 && (
            <BulkActionBar
              selectedCands={candidates.filter(c => selectedIds.has(c.id))}
              bateria={bateria}
              onClear={clearSelection}
              onActionComplete={() => { clearSelection(); load(); }}
              running={bulkRunning}
              setRunning={setBulkRunning}
              progress={bulkProgress}
              setProgress={setBulkProgress}
            />
          )}

          {/* Rechazados — colapsable + búsqueda + agrupado por vacante */}
          <RejectedSection
            cands={byStage[REJECTED_STAGE.id] || []}
            onSelect={setSelectedCand}
          />
          {/* end rechazados */}
        </>
      )}
      </>
      )}

      {/* Side panel con detalles del candidato */}
      {selectedCand && (
        <CandDetailPanel
          cand={selectedCand}
          hiringLeadEmail={leadPorVacante[selectedCand.vacancy_id] ?? null}
          onClose={() => setSelectedCand(null)}
          onChanged={() => { void load(); }}
        />
      )}
      {agregar && (
        <AgregarCandidato
          vacantes={vacancies.filter((v) => v.status == null || v.status === "open")}
          onClose={() => setAgregar(false)}
          onCreado={() => { setAgregar(false); void load(); }}
        />
      )}
    </div>
  );
}

function AgregarCandidato({
  vacantes,
  onClose,
  onCreado,
}: {
  vacantes: { id: string; title: string }[];
  onClose: () => void;
  onCreado: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [vacante, setVacante] = useState(vacantes[0]?.id || "");
  const [canal, setCanal] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-6" onClick={onClose}>
      <form
        className="bg-white w-full max-w-lg p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          const canalError = errorCanal(canal);
          if (!nombre.trim() || !email.trim() || !vacante) { setMsg("Nombre, email y vacante son obligatorios."); return; }
          if (canalError) { setMsg(canalError); return; }
          setBusy(true);
          setMsg(null);
          try {
            const r = await fetch("/api/headhunting/candidates", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                client_id: TS_CLIENT_ID,
                vacancy_id: vacante,
                name: nombre.trim(),
                email: email.trim(),
                phone: telefono.trim() || null,
                source: canal,
              }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) { setMsg(j.error || "No se pudo crear el candidato."); return; }
            onCreado();
          } catch (err: any) {
            setMsg(err?.message || "Error de red.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="text-lg font-bold">Agregar candidato</h2>
        <input className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="Teléfono (opcional)" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <select className="w-full border border-gray-300 px-3 py-2 text-sm bg-white" value={vacante} onChange={(e) => setVacante(e.target.value)}>
          {vacantes.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
        </select>
        <CanalSelect value={canal} onChange={setCanal} />
        {msg && <div className="text-sm text-red-700">{msg}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm px-3 py-2">Cancelar</button>
          <button type="submit" disabled={busy} className="text-sm font-bold px-4 py-2 bg-black text-white disabled:opacity-50">
            {busy ? "Guardando…" : "Crear"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Journey horizontal de los 12 gates. Un solo paso encendido; el panel
 * de abajo son las fichas de ese paso. Los colores son los de Clara
 * (canvas, ink, mute). El azul solo marca el paso encendido y el eyebrow.
 */
function JourneyBoard({
  byGate, lit, onLit, selectedIds, onToggle, onSelectAll, onOpen, bateria, esperandoIds, leadPorVacante,
}: {
  byGate: Record<string, Cand[]>;
  lit: KellyGate;
  onLit: (id: string) => void;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (gateId: string) => void;
  onOpen: (c: Cand) => void;
  bateria: Record<string, BatEstado>;
  esperandoIds: Set<string>;
  leadPorVacante: Record<string, string>;
}) {
  const cands = byGate[lit.id] || [];
  const todos = cands.length > 0 && cands.every((c) => selectedIds.has(c.id));
  const owner = OWNER_STYLE[ownerDeGate(lit)].label;
  const nota = GATE_NOTA[lit.id];

  return (
    <div style={{ background: "#F3F4F6", borderRadius: 16, padding: 16 }}>
      <div
        role="tablist"
        aria-label="Journey de selección"
        style={{ display: "flex", alignItems: "stretch", overflowX: "auto", gap: 0, paddingBottom: 4 }}
      >
        {KELLY_GATES.map((g, i) => {
          const n = (byGate[g.id] || []).length;
          const estado = g.n < lit.n ? "done" : g.id === lit.id ? "lit" : "upcoming";
          const ink = estado === "upcoming" ? "#9ca3af" : "#1d1d1f";
          return (
            <div key={g.id} style={{ display: "flex", alignItems: "center", flex: "1 0 auto", minWidth: 0 }}>
              <button
                type="button"
                role="tab"
                aria-selected={g.id === lit.id}
                onClick={() => onLit(g.id)}
                title={`${g.n}. ${g.label} · ${n}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  minWidth: 84,
                  padding: "6px 4px",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: ink,
                  fontFamily: "Inter, system-ui, sans-serif",
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    background: estado === "done" ? "#1d1d1f" : "#ffffff",
                    color: estado === "done" ? "#ffffff" : ink,
                    border: estado === "lit"
                      ? "2px solid #1d1d1f"
                      : "1px solid rgba(0,0,0,.06)",
                    boxShadow: estado === "lit" ? "0 0 0 3px #1747D9" : "none",
                  }}
                >
                  {g.n}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: estado === "lit" ? 700 : 500,
                  lineHeight: 1.2,
                  textAlign: "center",
                  maxWidth: 96,
                }}>
                  {g.label}
                </span>
                <span style={{
                  fontSize: 11,
                  fontVariantNumeric: "tabular-nums",
                  color: "#6e6e73",
                  background: "#ffffff",
                  borderRadius: 999,
                  padding: "1px 7px",
                  border: "1px solid rgba(0,0,0,.06)",
                }}>
                  {n}
                </span>
              </button>
              {i < KELLY_GATES.length - 1 && (
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 1,
                    flex: "0 0 18px",
                    background: g.n < lit.n ? "#1d1d1f" : "rgba(0,0,0,.12)",
                    marginBottom: 28,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <section
        aria-label={`Candidatos en ${lit.label}`}
        style={{
          marginTop: 8,
          background: "#ffffff",
          borderRadius: 16,
          border: "1px solid rgba(0,0,0,.06)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{
              color: "#1747D9",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 700,
              fontFamily: "Inter, system-ui, sans-serif",
            }}>
              Talent Acquisition
            </div>
            <h2 style={{ margin: "4px 0 0", fontSize: 22, lineHeight: 1.2, color: "#1d1d1f", fontWeight: 700 }}>
              {lit.n}. {lit.label}
            </h2>
            {nota && (
              <p style={{ margin: "4px 0 0", color: "#6e6e73", fontSize: 13 }}>{nota}</p>
            )}
            <p style={{ margin: "2px 0 0", color: "#6e6e73", fontSize: 12 }}>
              Depende de: {owner}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#6e6e73", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
              {cands.length}
            </span>
            {cands.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectAll(lit.id)}
                style={{
                  background: "#1d1d1f",
                  color: "#ffffff",
                  border: 0,
                  borderRadius: 999,
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {todos ? "Quitar selección" : "Seleccionar"}
              </button>
            )}
          </div>
        </div>

        {cands.length === 0 ? (
          <p style={{ margin: "20px 0 4px", textAlign: "center", color: "#6e6e73", fontSize: 13 }}>
            Nadie en esta etapa
          </p>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 12,
            marginTop: 16,
          }}>
            {cands.map((c) => (
              <JourneyCard
                key={c.id}
                cand={c}
                gate={lit}
                selected={selectedIds.has(c.id)}
                esperando={esperandoIds.has(c.id)}
                bateria={bateria[c.id]}
                hiringLead={leadPorVacante[c.vacancy_id] ?? null}
                onToggle={() => onToggle(c.id)}
                onOpen={() => onOpen(c)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function diasEnEtapa(c: Cand): number | null {
  const iso = c.updated_at || c.created_at;
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

/** Semáforo en gris: el dato sigue, el color no pinta la tarjeta. */
function semaforoDe(c: Cand, bat?: BatEstado): string | null {
  if (c.prefilter_decision === "pass") return "Prefiltro ok";
  if (c.prefilter_decision === "review") return "Prefiltro revisión";
  if (c.prefilter_decision === "reject") return "Prefiltro no";
  if (bat?.status === "completed" && bat.match != null) return `Match ${Math.round(bat.match)}`;
  return null;
}

function JourneyCard({
  cand, gate, selected, esperando, bateria, hiringLead, onToggle, onOpen,
}: {
  cand: Cand;
  gate: KellyGate;
  selected: boolean;
  esperando: boolean;
  bateria?: BatEstado;
  hiringLead?: string | null;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const sub = stageLabel(cand.stage);
  const mostrarSub = gate.stages.length !== 1 || (cand.stage && cand.stage !== gate.stages[0]);
  const dias = diasEnEtapa(cand);
  const sla = dias == null ? null : slaStatus(cand.stage, dias);
  const aging = dias == null
    ? null
    : sla === "serious" || sla === "critical"
      ? `${dias} d · fuera de plazo`
      : `${dias} d`;
  const sem = semaforoDe(cand, bateria);
  const pill: React.CSSProperties = {
    display: "inline-block",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 11,
    lineHeight: 1.4,
    color: "#1d1d1f",
    background: "#F3F4F6",
    border: "1px solid rgba(0,0,0,.06)",
  };

  return (
    <div style={{
      position: "relative",
      background: "#ffffff",
      borderRadius: 16,
      border: selected ? "1px solid #1d1d1f" : "1px solid rgba(0,0,0,.06)",
      padding: 14,
    }}>
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => { e.stopPropagation(); onToggle(); }}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Seleccionar ${cand.name}`}
        style={{ position: "absolute", top: 12, right: 12, width: 14, height: 14, accentColor: "#1d1d1f", cursor: "pointer" }}
      />
      <button type="button" onClick={onOpen} style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: 0,
        padding: 0,
        paddingRight: 22,
        cursor: "pointer",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#1d1d1f",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.25 }}>{cand.name}</div>
        <div style={{ fontSize: 12, color: "#6e6e73", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {cand.email}
        </div>
        {hiringLead && (
          <div style={{ fontSize: 12, color: "#6e6e73", marginTop: 4 }}>
            Hiring Lead: {hiringLead}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          <span style={pill}>{cand.ht_vacancies?.title || "—"}</span>
          {mostrarSub && sub !== gate.label && (
            <span style={{ ...pill, background: "#EEF2FF" }}>{sub}</span>
          )}
          {cand.source === "cv_proceso_anterior" && (
            <span style={{ ...pill, background: "#F5F3FF" }} title="Hoja de vida cargada de un proceso anterior">
              CV proceso anterior
            </span>
          )}
          {esperando && (
            <span style={{ ...pill, background: "#F4F4F5" }} title="El último mensaje es del candidato y no le hemos respondido">
              Espera respuesta
            </span>
          )}
          {cand.notes?.includes(NOTA_BATERIA_PENDIENTE) && (
            <span style={{ ...pill, background: "#FEF3C7" }}>{NOTA_BATERIA_PENDIENTE}</span>
          )}
          {sem && <span style={{ ...pill, color: "#6e6e73" }}>{sem}</span>}
          {aging && (
            <span style={{ ...pill, color: "#6e6e73" }} title={stageSla(cand.stage) ? `Plazo de la etapa: ${stageSla(cand.stage)} días` : undefined}>
              {aging}
            </span>
          )}
        </div>
      </button>
      <ChipBateria est={bateria} />
    </div>
  );
}

/**
 * A dónde va el botón «avanzar».
 *
 * Antes acá vivía un mapa escrito a mano, de mayo, con el pipeline de tres
 * entrevistas. Se quedó viejo sin que nadie lo notara: desde la entrevista
 * mandaba a `hiring_lead_interview`, que hoy normaliza a Terna, así que el
 * candidato se saltaba pruebas y prueba técnica. Ahora sale del orden
 * canónico de stage-labels y no puede volver a desfasarse.
 *
 * `aplico` es la excepción: no cambia de etapa, dispara el envío del
 * prefiltro, y de ahí en adelante manda el orden.
 */
function siguienteDelBoton(stage: string | null | undefined): { id: string; label: string; emoji: string } | null {
  const actual = normalizeStage(stage || "aplico");
  if (actual === "aplico") {
    return { id: "prefiltro_enviado", label: "Enviar prefiltro", emoji: "📋" };
  }
  const siguiente = siguienteEtapa(actual);
  if (!siguiente) return null;
  return {
    id: siguiente.id,
    label: `Pasar a ${siguiente.label}`,
    emoji: EMOJI_ETAPA[siguiente.id] || "➡️",
  };
}

const EMOJI_ETAPA: Record<string, string> = {
  prefiltro_enviado: "📋",
  prefiltro_pasado: "✅",
  prefiltro_revision: "🔍",
  recruiter_interview: "💬",
  pruebas: "🧪",
  prueba_tecnica: "🧮",
  terna: "🏆",
  examenes_medicos: "🩺",
  estudio_seguridad: "🛡️",
  documentacion_ingreso: "📄",
  oferta: "📨",
  contratado: "🎉",
};

// ─── Rechazados · sección rediseñada (colapsable + búsqueda + grupos) ─
function RejectedSection({
  cands, onSelect,
}: {
  cands: Cand[];
  onSelect: (c: Cand) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");

  // Filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cands;
    return cands.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.ht_vacancies?.title || "").toLowerCase().includes(q)
    );
  }, [cands, search]);

  // Group by vacancy
  const groups = useMemo(() => {
    const m: Record<string, Cand[]> = {};
    filtered.forEach(c => {
      const key = c.ht_vacancies?.title || "Sin vacante";
      if (!m[key]) m[key] = [];
      m[key].push(c);
    });
    // Sort groups by size desc
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  if (cands.length === 0) {
    return (
      <div className="mt-6 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
        <span className="text-xs text-gray-400 italic">Sin rechazos por ahora.</span>
      </div>
    );
  }

  return (
    <div className="mt-6 border border-red-200 rounded-xl bg-red-50/30 overflow-hidden">
      {/* Header bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-red-100/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">❌</span>
          <span className="text-sm font-bold uppercase tracking-wide text-red-700">Rechazados</span>
          <span className="text-xs font-bold bg-red-200 text-red-800 px-2 py-0.5 rounded-full">
            {cands.length}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-red-700">
          {!expanded && (
            <span className="text-[10px] text-gray-500 italic">click para expandir</span>
          )}
          <span className="font-bold">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-red-200 bg-white px-4 py-3">
          {/* Search */}
          <div className="mb-3 flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Buscar por nombre, email, vacante…"
              className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-400"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-xs text-gray-500 hover:text-black px-2"
              >
                ✕
              </button>
            )}
            <span className="text-[11px] text-gray-500 whitespace-nowrap">
              {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
            </span>
          </div>

          {/* Groups */}
          {groups.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-4">Sin coincidencias.</p>
          ) : (
            <div className="space-y-3">
              {groups.map(([vacancy, list]) => (
                <details key={vacancy} open={groups.length <= 2 || !!search}>
                  <summary className="text-[11px] uppercase font-bold text-gray-600 cursor-pointer mb-1.5 hover:text-red-700 select-none">
                    {vacancy}{" "}
                    <span className="font-normal text-gray-400">·</span>{" "}
                    <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">{list.length}</span>
                  </summary>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 ml-1">
                    {list.map(c => (
                      <button
                        key={c.id}
                        onClick={() => onSelect(c)}
                        className="text-left bg-white hover:bg-red-50 border border-red-100 rounded-md px-2 py-1.5 transition-colors group"
                        title={c.email}
                      >
                        <div className="text-[11px] font-semibold text-gray-800 truncate group-hover:text-red-900">
                          {c.name}
                        </div>
                        <div className="text-[9px] text-gray-400 truncate group-hover:text-red-600">
                          {c.email}
                        </div>
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Bateria psicometrica en la tarjeta ───────────────────────────
export type BatEstado = {
  token: string;
  status: string;
  invitada: boolean;
  match: number | null;
  conInforme: boolean;
};

/** Una linea por tarjeta: en que va la prueba de esta persona. Si ya hay
 *  resultado, el chip es el link directo al informe imprimible. */
function ChipBateria({ est }: { est?: BatEstado }) {
  if (!est) return null;

  if (est.status === "completed" && est.match != null) {
    return (
      <a href={`/hr-admin/bateria/informe/${est.token}`} target="_blank" rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 flex items-center justify-between gap-1 px-2 py-1 text-[10px] font-semibold"
        style={{ borderRadius: 999, background: "#F3F4F6", color: "#6e6e73", border: "1px solid rgba(0,0,0,.06)" }}
        title="Abrir el informe · match con el perfil del cargo">
        <span>Batería completa · {est.match}%</span>
        <span className="font-normal">{est.conInforme ? "informe ↗" : "sin IA ↗"}</span>
      </a>
    );
  }

  const txt = est.status === "completed" ? "Batería terminada · falta calcular"
    : est.status === "in_progress" ? "Batería en curso"
    : est.status === "consented" ? "Batería abierta"
    : est.invitada ? "Batería enviada · sin abrir"
    : "Batería con enlace · sin enviar";

  return (
    <div
      className="mt-2 px-2 py-1 text-[10px]"
      style={{ borderRadius: 999, background: "#F3F4F6", color: "#6e6e73", border: "1px solid rgba(0,0,0,.06)" }}
      title={txt}
    >
      {txt}
    </div>
  );
}

// ─── Floating bulk action bar ─────────────────────────────────────
function BulkActionBar({
  selectedCands, bateria, onClear, onActionComplete,
  running, setRunning, progress, setProgress,
}: {
  selectedCands: Cand[];
  bateria: Record<string, BatEstado>;
  onClear: () => void;
  onActionComplete: () => void;
  running: boolean;
  setRunning: (v: boolean) => void;
  progress: { done: number; total: number; ok: number; fail: number } | null;
  setProgress: (p: { done: number; total: number; ok: number; fail: number } | null) => void;
}) {
  // Los hooks van antes de cualquier return: si no, React se desincroniza
  // al pasar de "hay seleccion" a "no hay seleccion".
  const [batMsg, setBatMsg] = useState<string | null>(null);
  const [batIsError, setBatIsError] = useState(false);
  const [citando, setCitando] = useState(false);
  /** Rechazo masivo: pasa por el mismo modal con motivo que el individual. */
  const [rechazando, setRechazando] = useState(false);
  const [cita, setCita] = useState({ fechaISO: "", horaLlegada: "08:00", horaFin: "12:00", direccion: "", referencia: "" });
  const [previaCita, setPreviaCita] = useState<any>(null);

  const n = selectedCands.length;
  if (n === 0) return null;

  // Detect dominant stage for contextual actions
  const stageCounts: Record<string, number> = {};
  selectedCands.forEach(c => { const s = c.stage || "aplico"; stageCounts[s] = (stageCounts[s] || 0) + 1; });
  const dominantStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0][0];
  const allSameStage = Object.keys(stageCounts).length === 1;

  /**
   * Acciones que NO son "pasar a la etapa siguiente": estas tienen endpoint
   * propio o hacen algo distinto de mover al candidato. Todo lo demás se
   * deriva del orden canónico, para no volver a mantener el pipeline en tres
   * lugares distintos.
   */
  const accionesEspeciales: Record<string, { label: string; emoji: string; endpoint: (id: string) => string; method: "POST" }> = {
    aplico: { label: "Enviar prefiltro", emoji: "📋", endpoint: (id) => `/api/headhunting/candidates/${id}/send-prefilter`, method: "POST" },
    rechazado: { label: "Enviar encuesta NPS", emoji: "📊", endpoint: (id) => `/api/headhunting/candidates/${id}/send-experience-survey?send=true`, method: "POST" },
  };

  const avanceDerivado = (() => {
    const siguiente = siguienteDelBoton(dominantStage);
    if (!siguiente) return null;
    return {
      label: siguiente.label,
      emoji: siguiente.emoji,
      endpoint: (id: string) => `/api/headhunting/candidates/${id}/stage`,
      method: "POST" as const,
    };
  })();
  const stageAction = allSameStage
    ? (accionesEspeciales[normalizeStage(dominantStage)] ?? avanceDerivado)
    : null;

  /**
   * Bateria: una sola llamada con toda la lista, no una por candidato.
   * El backend reusa el enlace de quien ya tenga uno, asi que volver a
   * seleccionar a alguien no le borra el avance.
   */
  const yaInvitados = selectedCands.filter(c => bateria[c.id]?.invitada).length;

  async function enviarBateria() {
    if (running) return;
    const aviso = yaInvitados
      ? `\n\n${yaInvitados} de ellos ya tenían la batería enviada: se les vuelve a mandar EL MISMO enlace, no uno nuevo.`
      : "";
    if (!confirm(`Se van a crear ${n} borradores de la batería en tu Gmail.${aviso}\n\nNo se envía nada todavía: quedan en Borradores para que los revises.`)) return;
    setRunning(true);
    setBatIsError(false);
    setBatMsg(null);
    try {
      const r = await fetch("/api/bateria/enviar", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({
          modo: "borrador",
          candidatos: selectedCands.map(c => ({
            id: c.id, nombre: c.name, email: c.email, vacante: c.ht_vacancies?.title ?? null,
          })),
        }),
      });
      const txt = await r.text();
      let j: any = {};
      try { j = JSON.parse(txt); } catch { throw new Error(`El servidor respondió ${r.status}`); }
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setBatMsg(j.nota ?? `Listos ${j.ok} borradores.`);
      onActionComplete();
    } catch (e: any) {
      setBatMsg(`No se pudo: ${e?.message ?? "error"}`);
    } finally {
      setRunning(false);
    }
  }

  /** Recordatorio del prefiltro. Solo tiene sentido para quien ya lo recibio
   *  y no lo ha llenado, por eso el boton aparece solo en esa etapa. */
  async function recordarPrefiltro() {
    if (running) return;
    if (!confirm(`Se van a crear ${n} borradores de recordatorio del prefiltro en tu Gmail.\n\nA quien tenga el enlace vigente se le manda EL MISMO, para no borrarle lo que ya llevaba respondido.\n\nNo se envía nada todavía.`)) return;
    setRunning(true);
    setBatIsError(false);
    setBatMsg(null);
    try {
      const r = await fetch("/api/headhunting/candidates/recordatorio-prefiltro", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ modo: "borrador", ids: selectedCands.map(c => c.id) }),
      });
      const txt = await r.text();
      let j: any = {};
      try { j = JSON.parse(txt); } catch { throw new Error(`El servidor respondió ${r.status}`); }
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setBatMsg(j.nota ?? `Listos ${j.ok} borradores.`);
      onActionComplete();
    } catch (e: any) {
      setBatMsg(`No se pudo: ${e?.message ?? "error"}`);
    } finally {
      setRunning(false);
    }
  }

  /** Mover el lote a una etapa concreta, saltando el flujo lineal. Cuando la
   *  bateria decide a quien se pasa al assessment presencial, la etapa
   *  siguiente no es la que toca por orden: es la que uno elige. */
  async function moverA(destino: string) {
    if (running || !destino) return;
    const etiqueta = CANON_STAGES.find((e) => e.id === destino)?.label ?? destino;
    if (!confirm(`Mover ${n} candidato${n > 1 ? "s" : ""} a "${etiqueta}"?`)) return;
    setBatIsError(false);
    setBatMsg(null);
    setRunning(true);
    setProgress({ done: 0, total: n, ok: 0, fail: 0 });
    let ok = 0, fail = 0;
    for (let i = 0; i < selectedCands.length; i++) {
      try {
        const r = await fetch(`/api/headhunting/candidates/${selectedCands[i].id}/stage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: destino }),
        });
        if (r.ok) ok++; else fail++;
      } catch { fail++; }
      setProgress({ done: i + 1, total: n, ok, fail });
    }
    setRunning(false);
    setTimeout(() => { setProgress(null); onActionComplete(); }, 1800);
  }

  async function pedirCita(modo: "previsualizar" | "borrador") {
    if (running) return;
    if (modo === "borrador" && !confirm(`Se van a crear ${n} borradores de citación en tu Gmail.\n\nNo se envía nada todavía.`)) return;
    setRunning(true); setBatIsError(false); setBatMsg(null);
    try {
      const r = await fetch("/api/headhunting/candidates/citar-assessment", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ modo, ...cita, ids: selectedCands.map((c) => c.id) }),
      });
      const txt = await r.text();
      let j: any = {};
      try { j = JSON.parse(txt); } catch { throw new Error(`El servidor respondió ${r.status}`); }
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      if (modo === "previsualizar") { setPreviaCita(j); }
      else { setBatMsg(j.nota ?? `Listos ${j.ok} borradores.`); setCitando(false); setPreviaCita(null); onActionComplete(); }
    } catch (e: any) {
      setBatMsg(`No se pudo: ${e?.message ?? "error"}`);
    } finally {
      setRunning(false);
    }
  }

  async function runBulk(action: "stage_action" | "advance") {
    if (running) return;
    if (!confirm(`Aplicar acción a ${n} candidatos seleccionados? Quien quede en «Prefiltro pasado» recibe la Batería TS por correo de inmediato (desde jointheteam@); el resto de correos quedan como borrador en tu Gmail.`)) return;
    setBatIsError(false);
    setBatMsg(null);
    setRunning(true);
    setProgress({ done: 0, total: n, ok: 0, fail: 0 });
    let ok = 0, fail = 0;
    const errors: string[] = [];

    for (let i = 0; i < selectedCands.length; i++) {
      const c = selectedCands[i];
      try {
        let url = "";
        let body: object | null = null;
        if (action === "stage_action" && stageAction) {
          url = stageAction.endpoint(c.id);
          // For stage transitions: incluir el target stage en el body
          // La misma derivación que el botón: una sola definición del orden.
          const siguiente = siguienteDelBoton(dominantStage);
          if (siguiente && normalizeStage(dominantStage) !== "aplico") {
            body = { stage: siguiente.id };
          }
        } else if (action === "advance") {
          const next = siguienteDelBoton(c.stage);
          if (!next) { fail++; setProgress({ done: i + 1, total: n, ok, fail }); continue; }
          url = `/api/headhunting/candidates/${c.id}/stage`;
          body = { stage: next.id };
        }
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (r.ok) ok++;
        else {
          fail++;
          let msg = `HTTP ${r.status}`;
          try {
            const j = await r.json();
            if (j?.error) msg = String(j.error);
          } catch { /* the status is enough */ }
          if (!errors.includes(msg)) errors.push(msg);
        }
      } catch (e: any) {
        fail++;
        const msg = e?.message ?? "error";
        if (!errors.includes(msg)) errors.push(msg);
      }
      setProgress({ done: i + 1, total: n, ok, fail });
    }

    if (errors.length) {
      setBatIsError(true);
      setBatMsg(errors.join(" · "));
    } else {
      setBatIsError(false);
    }
    setRunning(false);
    setTimeout(() => {
      setProgress(null);
      onActionComplete();
    }, 2500);
  }

  const campo = "w-full border border-neutral-300 rounded-md px-2.5 py-1.5 text-[13px] text-black";

  return (
    <>
    {rechazando && (
      <RejectionModal
        candidateId={selectedCands[0].id}
        candidateName={selectedCands[0].name}
        vacancyTitle={selectedCands[0].ht_vacancies?.title || "la posición"}
        lang={langDe(selectedCands[0])}
        bulk={selectedCands.map((c) => ({ id: c.id, name: c.name, vacancyTitle: c.ht_vacancies?.title || "la posición" }))}
        onClose={() => setRechazando(false)}
        onRejected={() => { setRechazando(false); onActionComplete(); }}
      />
    )}
    {citando && (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-6"
        onClick={(e) => { if (e.target === e.currentTarget) setCitando(false); }}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-5 text-black my-8">
          <h3 className="text-[17px] font-bold m-0">Citar a {n} candidato{n > 1 ? "s" : ""} al assessment</h3>
          <p className="text-[12.5px] text-neutral-500 mt-1 mb-4">
            Estos datos van dentro del correo y también arman el botón «Agregar a mi calendario».
            Salen de la misma fuente, así que no pueden decir cosas distintas. Sin fecha, hora y
            dirección la citación no sirve de nada.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[12px] font-semibold text-neutral-600">
              Fecha del assessment
              <input className={campo} type="date"
                value={cita.fechaISO} onChange={(e) => setCita({ ...cita, fechaISO: e.target.value })} />
            </label>
            <label className="text-[12px] font-semibold text-neutral-600">
              Dirección
              <input className={campo} placeholder="Calle 77B #57-141, piso 8"
                value={cita.direccion} onChange={(e) => setCita({ ...cita, direccion: e.target.value })} />
            </label>
            <label className="text-[12px] font-semibold text-neutral-600">
              Hora de llegada
              <input className={campo} type="time"
                value={cita.horaLlegada} onChange={(e) => setCita({ ...cita, horaLlegada: e.target.value })} />
            </label>
            <label className="text-[12px] font-semibold text-neutral-600">
              Hora de fin aproximada
              <input className={campo} type="time"
                value={cita.horaFin} onChange={(e) => setCita({ ...cita, horaFin: e.target.value })} />
            </label>
            <label className="text-[12px] font-semibold text-neutral-600 sm:col-span-2">
              Cómo llegar · parqueadero (opcional)
              <input className={campo} placeholder="Edificio Green Tower, parqueadero de visitantes en el sótano"
                value={cita.referencia} onChange={(e) => setCita({ ...cita, referencia: e.target.value })} />
            </label>
          </div>

          <div className="flex gap-2 flex-wrap mt-4">
            <button onClick={() => pedirCita("previsualizar")} disabled={running}
              className="text-xs font-semibold px-3 py-2 rounded-full border border-neutral-300 hover:bg-neutral-50">
              Ver el correo
            </button>
            <button onClick={() => pedirCita("borrador")} disabled={running}
              className="text-xs font-bold px-3 py-2 rounded-full bg-emerald-700 text-white hover:bg-emerald-800">
              {running ? "Creando…" : `Crear ${n} borradores en Gmail`}
            </button>
            <button onClick={() => { setCitando(false); setPreviaCita(null); }}
              className="text-xs px-3 py-2 text-neutral-500 hover:text-black">Cerrar</button>
          </div>

          {batMsg && <p className="text-[12.5px] text-red-700 mt-3 font-mono break-words">{batMsg}</p>}

          {previaCita && (
            <div className="mt-4 border border-neutral-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-200">
                <p className="text-[12px] m-0"><b>Para:</b> {previaCita.para}</p>
                <p className="text-[12px] m-0"><b>Asunto:</b> {previaCita.asunto}</p>
              </div>
              <iframe title="Borrador de la citación" srcDoc={previaCita.html}
                className="w-full h-[520px] border-0 bg-neutral-100" />
            </div>
          )}
        </div>
      </div>
    )}

    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-black text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-2 flex-wrap justify-center max-w-[min(94vw,56rem)]">
      <div className="flex items-center gap-2">
        <span className="bg-purple-600 text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center">{n}</span>
        <span className="text-xs font-semibold">seleccionado{n > 1 ? "s" : ""}</span>
        {!allSameStage && (
          <span className="text-[10px] bg-amber-500/30 text-amber-100 px-2 py-0.5 rounded">⚠️ etapas mixtas</span>
        )}
      </div>

      {batMsg && (
        <div className={`text-[11px] px-3 py-1 rounded-full max-w-xs leading-snug ${batIsError ? "bg-red-100 text-red-800" : "bg-white/10"}`}>{batMsg}</div>
      )}

      {progress && (
        <div className="text-xs flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full">
          <span>{progress.done}/{progress.total}</span>
          {progress.ok > 0 && <span className="text-emerald-400">✓ {progress.ok}</span>}
          {progress.fail > 0 && <span className="text-red-400">✗ {progress.fail}</span>}
        </div>
      )}

      {!running && (
        <>
          {stageAction && allSameStage && (
            <button
              onClick={() => runBulk("stage_action")}
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-pink-600 hover:bg-pink-700 inline-flex items-center gap-1.5"
              title={`${stageAction.label} a los ${n} seleccionados`}
            >
              <span>{stageAction.label}</span>
              <span className="text-[10px] opacity-80 tabular-nums">({n})</span>
            </button>
          )}
          {allSameStage && normalizeStage(dominantStage) === "prueba_tecnica" && (
            <button
              onClick={() => setCitando(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-700 hover:bg-emerald-800 inline-flex items-center gap-1.5"
              title="Borrador de citación al assessment presencial"
            >
              <span>Citar al assessment</span>
              <span className="text-[10px] opacity-80 tabular-nums">({n})</span>
            </button>
          )}
          {allSameStage && normalizeStage(dominantStage) === "prefiltro_enviado" && (
            <button
              onClick={recordarPrefiltro}
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 inline-flex items-center gap-1.5"
              title="Borrador de recordatorio para quienes no han llenado el prefiltro"
            >
              <span>Recordar prefiltro</span>
              <span className="text-[10px] opacity-80 tabular-nums">({n})</span>
            </button>
          )}
          <button
            onClick={enviarBateria}
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-violet-600 hover:bg-violet-700 inline-flex items-center gap-1.5"
            title="Crea un borrador en Gmail por candidato, cada uno con su propio enlace"
          >
            <span>Enviar batería</span>
            <span className="text-[10px] opacity-80 tabular-nums">({n})</span>
          </button>
          <select
            defaultValue=""
            onChange={(e) => { const v = e.target.value; e.target.value = ""; void moverA(v); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-neutral-800 text-white border border-neutral-600 cursor-pointer"
            title="Mover los seleccionados a una etapa concreta"
          >
            <option value="">Mover a…</option>
            {CANON_STAGES.filter((e) => e.id !== "contratado").map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
          <button
            onClick={() => runBulk("advance")}
            className="text-xs font-bold px-3 py-1.5 rounded-full hover:opacity-90"
            style={{ background: "#1d1d1f", color: "#ffffff" }}
            title="Avanzar cada uno a su siguiente etapa"
          >
            → Avanzar etapa
          </button>
          <button
            onClick={() => setRechazando(true)}
            className="text-xs font-bold px-3 py-1.5 rounded-full bg-red-600 hover:bg-red-700"
          >
            ❌ Rechazar
          </button>
          <button
            onClick={onClear}
            className="text-xs px-2 py-1.5 text-gray-300 hover:text-white"
          >
            Limpiar
          </button>
        </>
      )}
    </div>
    </>
  );
}

// Contratados van en el gate 12 (Onboarding) del journey, no en una columna.

// Etiquetas cortas por category_key para badges en cards
const REJECTION_CATEGORY_SHORT: Record<string, string> = {
  experiencia_insuficiente: "Experiencia",
  match_cultural: "Cultural",
  pretension_salarial: "Salario",
  disponibilidad_movilidad: "Disponibilidad",
  resultado_evaluacion: "Evaluación",
  comunicacion_proceso: "Comunicación",
  decision_candidato: "Decisión cand",
  proceso_avanzado: "Fuera de tiempo",
};

function RejectedColumn({
  cands,
  selectedIds,
  onToggle,
  onSelect,
  onChanged,
}: {
  cands: Cand[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (c: Cand) => void;
  onChanged?: () => void;
}) {
  // Estado del reenvío, por candidato: evita que un clic bloquee toda la columna.
  const [correo, setCorreo] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);

  // El botón ya no envía: deja un borrador en Gmail para revisarlo y enviarlo
  // desde ahí. Antes de crearlo, el servidor mira Enviados — si el correo ya
  // salió desde Gmail, solo marca la ficha — y no duplica un borrador que siga
  // esperando.
  async function borradorCorreo(c: Cand) {
    if (enviando) return;
    if (!c.email) {
      setCorreo(p => ({ ...p, [c.id]: "Sin correo registrado" }));
      return;
    }
    let force = false;
    if (c.rejection_sent_at) {
      const fecha = new Date(c.rejection_sent_at).toLocaleDateString("es-CO");
      if (!window.confirm(`El correo de rechazo ya le salió a ${c.email} el ${fecha}.\n\n¿Crear otro borrador de todas formas?`)) return;
      force = true;
    }

    setEnviando(c.id);
    setCorreo(p => ({ ...p, [c.id]: "Revisando Gmail…" }));
    try {
      const r = await fetch(`/api/admin/candidates/${c.id}/resend-rejection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "draft", force }),
      });
      const j = await r.json();
      if (!r.ok) {
        // El detalle es lo único que dice por qué falló: sin él quedaría
        // "Error interno" y habría que ir a los logs de Vercel.
        setCorreo(p => ({ ...p, [c.id]: [j.error, j.detail].filter(Boolean).join(" · ") }));
        return;
      }
      setCorreo(p => ({ ...p, [c.id]: j.message || "Borrador listo en Gmail ✓" }));
      onChanged?.();
    } catch (e: any) {
      setCorreo(p => ({ ...p, [c.id]: e?.message || "No se pudo crear el borrador" }));
    } finally {
      setEnviando(null);
    }
  }

  // Pone al día la columna contra Gmail: marca como enviados los que ya
  // salieron desde la bandeja y deja a la vista solo los que de verdad faltan.
  const [sincronizando, setSincronizando] = useState(false);
  const [resumenSync, setResumenSync] = useState<string>("");
  async function sincronizarConGmail() {
    const ids = cands.filter(c => !c.rejection_sent_at).map(c => c.id);
    if (ids.length === 0) {
      setResumenSync("Todos los rechazados ya tienen el correo marcado como enviado.");
      return;
    }
    setSincronizando(true);
    setResumenSync("Revisando Enviados en Gmail…");
    try {
      const r = await fetch("/api/admin/rejections/sync-sent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_ids: ids }),
      });
      const j = await r.json();
      if (!r.ok) {
        setResumenSync(j.error || "No se pudo revisar Gmail");
        return;
      }
      const ya = (j.ya_habian_salido || []).length;
      const faltan = (j.sin_correo_de_rechazo || []).length;
      setResumenSync(
        `${ya} ya habían salido desde Gmail y quedaron marcados. ` +
        (faltan > 0 ? `${faltan} de verdad no tienen correo de rechazo: usa «Borrador» en cada uno.` : "No falta ninguno."),
      );
      onChanged?.();
    } catch (e: any) {
      setResumenSync(e?.message || "No se pudo revisar Gmail");
    } finally {
      setSincronizando(false);
    }
  }

  // Filtro por categoría · solo los rechazos clasificados
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showSavedOnly, setShowSavedOnly] = useState(false);

  // Agrupar por categoría para los chips
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    cands.forEach(c => {
      const k = c.rejection_category || "sin_clasificar";
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [cands]);

  const visibleCands = useMemo(() => {
    return cands.filter(c => {
      if (showSavedOnly && !c.rejection_save_for_future) return false;
      if (categoryFilter === "all") return true;
      if (categoryFilter === "sin_clasificar") return !c.rejection_category;
      return c.rejection_category === categoryFilter;
    });
  }, [cands, categoryFilter, showSavedOnly]);

  const savedCount = cands.filter(c => c.rejection_save_for_future).length;

  return (
    <div className="bg-white p-5">
      <div className="flex items-baseline justify-between mb-3 pb-3 border-b border-[var(--ts-gray-10)]">
        <div className="flex items-baseline gap-3">
          <XCircle className="w-4 h-4 text-[var(--ts-red)] flex-shrink-0 self-center" />
          <div className="ts-eyebrow text-[var(--ts-red)]">Rechazados</div>
        </div>
        <div className="text-[28px] font-extrabold ts-tabular text-[var(--ts-red)]" style={{ letterSpacing: '-0.04em' }}>
          {visibleCands.length}<span className="text-[14px] text-[var(--ts-gray-40)]">/{cands.length}</span>
        </div>
      </div>

      {/* Cuántos rechazos no tienen correo registrado · y cómo ponerlos al día */}
      {cands.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-[var(--ts-gray-60)]">
            {cands.filter(c => !c.rejection_sent_at).length} sin correo registrado
          </span>
          <button
            onClick={sincronizarConGmail}
            disabled={sincronizando}
            title="Busca en Enviados de Gmail los correos de rechazo que salieron desde la bandeja y los marca en el ATS"
            className="ml-auto text-[9px] uppercase tracking-[1px] font-bold px-2 py-1 border border-[var(--ts-gray-10)] text-[var(--ts-gray-60)] hover:border-[var(--ts-black)] hover:text-[var(--ts-black)] disabled:opacity-40 disabled:cursor-wait"
          >
            {sincronizando ? "Revisando…" : "Verificar en Gmail"}
          </button>
        </div>
      )}
      {resumenSync && (
        <div className="text-[10px] text-[var(--ts-gray-60)] -mt-1 mb-3 leading-snug">{resumenSync}</div>
      )}

      {/* Filtros · categoría + saved for future */}
      {cands.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`text-[10px] uppercase tracking-[1px] px-2 py-1 border ${categoryFilter === "all" ? "border-[var(--ts-black)] bg-[var(--ts-black)] text-white" : "border-[var(--ts-gray-10)] text-[var(--ts-gray-60)] hover:border-[var(--ts-gray-40)]"}`}
          >
            Todos
          </button>
          {Object.entries(byCategory).map(([key, count]) => (
            <button
              key={key}
              onClick={() => setCategoryFilter(key)}
              className={`text-[10px] uppercase tracking-[1px] px-2 py-1 border ${categoryFilter === key ? "border-[var(--ts-black)] bg-[var(--ts-black)] text-white" : "border-[var(--ts-gray-10)] text-[var(--ts-gray-60)] hover:border-[var(--ts-gray-40)]"}`}
            >
              {REJECTION_CATEGORY_SHORT[key] || key} · {count}
            </button>
          ))}
          {savedCount > 0 && (
            <button
              onClick={() => setShowSavedOnly(!showSavedOnly)}
              className={`text-[10px] uppercase tracking-[1px] px-2 py-1 border ${showSavedOnly ? "border-[var(--ts-green)] bg-[var(--ts-green)] text-white" : "border-[var(--ts-green-border,#bce3c5)] text-[var(--ts-green)] hover:border-[var(--ts-green)]"}`}
              title="CV Bank · perfiles guardados para futuras búsquedas"
            >
              ★ Saved · {savedCount}
            </button>
          )}
        </div>
      )}

      {visibleCands.length === 0 ? (
        <div className="ts-eyebrow text-[10px] text-[var(--ts-gray-40)] py-4">
          {cands.length === 0 ? "Sin rechazos" : "Sin coincidencias con el filtro"}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
          {visibleCands.map(c => {
            const isSelected = selectedIds.has(c.id);
            const catShort = c.rejection_category ? (REJECTION_CATEGORY_SHORT[c.rejection_category] || c.rejection_category) : "Sin motivo";
            return (
              <div
                key={c.id}
                className={`relative bg-white border p-2.5 transition-all ${isSelected ? 'border-[var(--ts-black)]' : 'border-[var(--ts-red-border)] hover:border-[var(--ts-red)]'}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(c.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-2 right-2 w-3.5 h-3.5 cursor-pointer accent-[var(--ts-black)]"
                />
                <button onClick={() => onSelect(c)} className="w-full text-left pr-5">
                  <div className="text-[13px] font-semibold text-[var(--ts-gray-90)] leading-tight">
                    {c.name}
                    {c.rejection_save_for_future && (
                      <span className="ml-1.5 text-[var(--ts-green)]" title="Guardado para CV Bank">★</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--ts-gray-60)] mt-0.5">{c.ht_vacancies?.title || '—'}</div>
                  <div className="text-[9px] uppercase tracking-[1px] text-[var(--ts-red)] mt-1 font-bold">
                    {catShort}
                  </div>
                </button>

                {/* Correo de rechazo · queda en borrador para enviarlo desde Gmail */}
                <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-[var(--ts-gray-10)]">
                  {c.rejection_sent_at ? (
                    <span className="text-[9px] uppercase tracking-[1px] text-[var(--ts-green)] font-bold">
                      ✓ Enviado {new Date(c.rejection_sent_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                    </span>
                  ) : c.rejection_draft_id ? (
                    <span
                      className="text-[9px] uppercase tracking-[1px] text-[var(--ts-gray-60)] font-bold"
                      title="Se creó un borrador. Si ya lo enviaste desde Gmail, «Verificar en Gmail» lo marca."
                    >
                      Borrador · sin confirmar
                    </span>
                  ) : (
                    <span className="text-[9px] uppercase tracking-[1px] text-[var(--ts-gray-40)] font-bold">
                      Sin enviar
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); borradorCorreo(c); }}
                    disabled={enviando === c.id}
                    title="Deja el correo de rechazo en Borradores de Gmail para revisarlo y enviarlo desde ahí"
                    className="ml-auto text-[9px] uppercase tracking-[1px] font-bold px-2 py-0.5 border border-[var(--ts-gray-10)] text-[var(--ts-gray-60)] hover:border-[var(--ts-black)] hover:text-[var(--ts-black)] disabled:opacity-40 disabled:cursor-wait transition-colors"
                  >
                    {enviando === c.id ? "···" : "✉ Borrador"}
                  </button>
                </div>
                {correo[c.id] && (
                  <div className="text-[9px] text-[var(--ts-gray-60)] mt-1 leading-snug">{correo[c.id]}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Side panel con detalle + respuestas del prefiltro ──────────────
function CandDetailPanel({ cand, onClose, onChanged, hiringLeadEmail }: { cand: Cand; onClose: () => void; onChanged?: () => void; hiringLeadEmail?: string | null }) {
  const pf = cand.prefilter_data;
  const decision = cand.prefilter_decision;
  const decisionBadge = decision === "pass" ? { label: "✅ PASS", color: "#10B981" }
    : decision === "review" ? { label: "⚠️ REVIEW", color: "#F59E0B" }
    : decision === "reject" ? { label: "❌ REJECT", color: "#EF4444" }
    : null;

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string>("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [canal, setCanal] = useState(cand.source || "");
  const [canalMsg, setCanalMsg] = useState<string | null>(null);
  const [showJointScheduling, setShowJointScheduling] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const currentStage = cand.stage || "aplico";
  const nextStage = siguienteDelBoton(currentStage);
  const isTerminal = currentStage === "rechazado" || currentStage === "contratado";

  async function moveToStage(targetStage: string, label: string) {
    if (busy) return;
    setBusy(true);
    setFeedback(`${label}…`);
    try {
      const res = await fetch(`/api/headhunting/candidates/${cand.id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: targetStage }),
      });
      const j = await res.json();
      if (j.success) {
        setFeedback(j.bateria_auto?.enviado
          ? "✅ Prefiltro pasado · Batería TS enviada por correo"
          : j.bateria_auto
            ? `✅ Prefiltro pasado · la Batería TS no salió: ${j.bateria_auto.motivo}`
            : `✅ Movido a ${label.replace(/^Movido a /, "")}`);
        // Re-fetch sin reload: preserva filtro de vacante
        setTimeout(() => {
          onChanged?.();
          onClose();
        }, 1000);
      } else {
        setFeedback(`❌ ${[j.error, j.detail].filter(Boolean).join(" · ") || "Error"}`);
      }
    } catch (e) {
      setFeedback(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function reject() {
    // Abre el modal con clasificación obligatoria · ya no usamos confirm() ni el path legacy
    setShowRejectModal(true);
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="bg-white w-[560px] h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold">{cand.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{cand.ht_vacancies?.title || "—"}</p>
            {hiringLeadEmail && (
              <p className="text-xs text-gray-500 mt-0.5">Hiring Lead: {hiringLeadEmail}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
        </div>

        {/* Action bar */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center gap-2 flex-wrap">
          {!isTerminal && nextStage && (
            <button
              onClick={() => moveToStage(nextStage.id, nextStage.label)}
              disabled={busy}
              className="text-xs font-semibold px-4 py-2 rounded-full bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <span>{nextStage.label}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Move to ANY stage dropdown */}
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              // Rechazar siempre pasa por el modal con motivo, nunca por el
              // cambio de etapa pelado: sin motivo no hay clasificación.
              if (v === REJECTED_STAGE.id) { setShowRejectModal(true); e.target.value = ""; return; }
              const s = STAGES.find(x => x.id === v);
              if (s) moveToStage(s.id, `Movido a ${s.label}`);
              e.target.value = "";
            }}
            disabled={busy}
            className="text-xs font-semibold px-3 py-2 rounded-full border-2 border-purple-300 text-purple-800 bg-white hover:bg-purple-50 disabled:opacity-50 cursor-pointer"
            title="Mover a cualquier etapa (salta el flujo lineal)"
          >
            <option value="">Mover a etapa…</option>
            {STAGES.filter(s => s.id !== currentStage).map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
            <option disabled>──────────</option>
            <option value={REJECTED_STAGE.id}>{REJECTED_STAGE.label}</option>
          </select>

          {!isTerminal && (currentStage === "prefiltro_enviado" || currentStage === "aplico") && (
            <button
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setFeedback("Regenerando link de prefiltro…");
                try {
                  const r = await fetch(`/api/headhunting/candidates/${cand.id}/send-prefilter`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  });
                  const j = await r.json();
                  if (j.success) {
                    setFeedback(j.channel === "gmail-draft" ? "✅ Draft Gmail listo con link nuevo" : `⚠️ ${j.note || j.channel}`);
                    setTimeout(() => setFeedback(""), 4000);
                  } else {
                    setFeedback(`❌ ${[j.error, j.detail].filter(Boolean).join(" · ") || "Error"}`);
                  }
                } catch (e) {
                  setFeedback(`❌ ${(e as Error).message}`);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="text-xs font-bold px-4 py-2 rounded-full border-2 border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-50"
              title="Regenera el token del cuestionario y crea un nuevo draft en tu Gmail con el link"
            >
              🔄 Reenviar Prefiltro
            </button>
          )}

          {/* Invitación Wellness → HM. Va en la ficha, como Reenviar Prefiltro,
              y no toca el botón Agendar (ts_interviews) para poder rebasar
              sobre feat/ats-fase0-soft-delete. */}
          {!isTerminal && (
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              disabled={busy}
              className="text-xs font-bold px-4 py-2 rounded-full border-2 border-black text-black bg-white hover:bg-gray-50 disabled:opacity-50"
              title="Envía la invitación de Wellness o de Hiring Manager. En preview solo llega a la lista de prueba."
            >
              Invitar a entrevista
            </button>
          )}

          {/* El informe de la persona después de las pruebas: la batería propia
              y las de los seis proveedores, leídas juntas. Va aquí, al lado del
              CV, porque es la otra mitad de lo mismo — quién es el candidato,
              no cómo va la búsqueda. */}
          <a
            href={`/hr-admin/candidato/${cand.id}/informe`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold px-4 py-2 rounded-full border-2 border-indigo-300 text-indigo-800 bg-indigo-50 hover:bg-indigo-100"
            title="Todas las pruebas de esta persona leídas juntas · con vista para el líder y para el CEO"
          >
            🧭 Informe de pruebas
          </a>

          {/* La hoja de vida vive en la otra base, indexada por aplicación. La
              ruta hace ese puente por correo para que desde acá sea un clic y
              no una consulta a Neon. */}
          <button
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              setFeedback("Buscando la hoja de vida…");
              try {
                const r = await fetch(`/api/admin/candidates/${cand.id}/cv`);
                if (!r.ok) {
                  const j = await r.json().catch(() => ({}));
                  setFeedback(`❌ ${[j.error, j.detail].filter(Boolean).join(" · ") || "No se pudo abrir"}`);
                  return;
                }
                // Se descarga desde el blob y no abriendo la URL: así el
                // navegador manda la cookie de sesión igual que el resto del
                // panel, sin depender de que la pestaña nueva la lleve.
                const blob = await r.blob();
                const cabecera = r.headers.get("Content-Disposition") || "";
                const nombre = /filename="([^"]+)"/.exec(cabecera)?.[1] || "hoja-de-vida.pdf";
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = nombre;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                setFeedback("✅ Descargada");
                setTimeout(() => setFeedback(""), 3000);
              } catch (e) {
                setFeedback(`❌ ${(e as Error).message}`);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="text-xs font-bold px-4 py-2 rounded-full border-2 border-gray-300 text-gray-800 bg-white hover:bg-gray-50 disabled:opacity-50"
            title="Descarga el PDF que subió el candidato al aplicar"
          >
            📄 Hoja de vida
          </button>

          {!isTerminal && (
            <button
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setFeedback("Generando Calendly…");
                try {
                  const r = await fetch(`/api/admin/candidates/${cand.id}/send-calendly`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  });
                  const j = await r.json();
                  if (j.success) {
                    setFeedback("✅ Draft Gmail listo · WhatsApp link copiado");
                    if (j.wa_link) {
                      try { await navigator.clipboard.writeText(j.wa_link); } catch {}
                    }
                    setTimeout(() => setFeedback(""), 4000);
                  } else {
                    setFeedback(`❌ ${[j.error, j.detail].filter(Boolean).join(" · ") || "Error"}`);
                  }
                } catch (e) {
                  setFeedback(`❌ ${(e as Error).message}`);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="text-xs font-bold px-4 py-2 rounded-full border-2 border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              title="Genera draft Gmail con link Calendly + copia link WhatsApp al portapapeles"
            >
              📅 Enviar Calendly
            </button>
          )}

          {!isTerminal && (
            <button
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setFeedback("Creando borrador de pruebas…");
                try {
                  const r = await fetch(`/api/headhunting/candidates/${cand.id}/send-test-battery`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  });
                  const j = await r.json();
                  if (j.success) {
                    setFeedback(`✅ ${j.note || "Borrador listo en Gmail. Antes de enviarlo, pega los enlaces de Bluesite y Psicoalianza."}`);
                  } else {
                    setFeedback(`❌ ${[j.error, j.detail].filter(Boolean).join(" · ") || "Error"}`);
                  }
                } catch (e) {
                  setFeedback(`❌ ${(e as Error).message}`);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="text-xs font-bold px-4 py-2 rounded-full border-2 border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 disabled:opacity-50"
              title="Crea un borrador en Gmail. Antes de enviarlo, pega los enlaces personalizados de Bluesite y Psicoalianza."
            >
              Pruebas complementarias
            </button>
          )}

          {!isTerminal && currentStage === "cwo_interview" && (
            <button
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setFeedback("Generando draft para Mary…");
                try {
                  const r = await fetch(`/api/admin/candidates/${cand.id}/send-to-mary-psico`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  });
                  const j = await r.json();
                  if (j.success) {
                    // Mueve a Pruebas Psicométricas (cola) · el batch a Mary se dispara aparte
                    await moveToStage("bateria_psicometrica", "Pasó las 3 entrevistas · va a Pruebas Psicométricas");
                    setFeedback("✅ Draft individual para Mary listo · candidato en Pruebas Psicométricas");
                    setTimeout(() => setFeedback(""), 4000);
                  } else {
                    setFeedback(`❌ ${[j.error, j.detail].filter(Boolean).join(" · ") || "Error"}`);
                  }
                } catch (e) {
                  setFeedback(`❌ ${(e as Error).message}`);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="text-xs font-bold px-4 py-2 rounded-full border-2 border-emerald-400 text-emerald-800 bg-white hover:bg-emerald-50 disabled:opacity-50"
              title="Pasó las 3 entrevistas · genera draft Gmail individual a Mary Banquez y mueve a cola de Pruebas Psicométricas. (El batch 2x/día se hace desde la columna Pruebas Psicométricas)"
            >
              🧪 Pasar a Pruebas · Mary
            </button>
          )}

          {/* Botón "Agendar conjunta" oculto · usar "Enviar Calendly" que ya dispara
              el Calendly Collective (Kelly + Yohanna) para la vacante TAL.
              El código backend del joint-scheduling sigue disponible si el sucesor
              quiere arreglar bugs de TZ/almuerzo y revivirlo. */}
          {false && !isTerminal && (
            <button
              onClick={() => setShowJointScheduling(true)}
              disabled={busy}
              className="text-xs font-bold px-4 py-2 rounded-full border-2 border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50"
              title="Agendar entrevista conjunta con varios entrevistadores (CWO + Hiring Manager) · sin Calendly"
            >
              📅 Agendar conjunta
            </button>
          )}

          {!isTerminal && (
            <button
              onClick={reject}
              disabled={busy}
              className="text-xs font-bold px-4 py-2 rounded-full border-2 border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
              title="Clasificá el motivo + edita el mensaje al candidato"
            >
              ❌ Rechazar con motivo
            </button>
          )}

          {isTerminal && (
            <span className="text-xs text-gray-500 italic">
              {currentStage === "rechazado" ? "❌ Etapa terminal — usa dropdown para reactivar" : "🎉 Contratado — usa dropdown si necesitas mover"}
            </span>
          )}

          {feedback && (
            <span className="text-xs ml-auto text-gray-700">{feedback}</span>
          )}
        </div>

        <div className="p-6 space-y-5 text-sm">
          {/* Identidad */}
          <Section title="Contacto">
            <Row k="Email" v={cand.email} />
            {cand.phone && <Row k="Teléfono" v={cand.phone} />}
            {cand.cv_url && <Row k="LinkedIn" v={<a href={cand.cv_url} target="_blank" rel="noreferrer" className="text-blue-600 underline truncate inline-block max-w-[280px]">{cand.cv_url}</a>} />}
          </Section>

          {/* Estado */}
          <Section title="Canal">
            <div className="text-[11px] text-gray-500 mb-2">{cand.source ? etiquetaCanal(cand.source) : "Sin canal"}</div>
            <CanalSelect value={canal} onChange={setCanal} />
            <button
              type="button"
              className="mt-2 text-xs font-bold px-3 py-1.5 bg-black text-white"
              onClick={async () => {
                const err = errorCanal(canal);
                if (err) { setCanalMsg(err); return; }
                setCanalMsg(null);
                const r = await fetch(`/api/headhunting/candidates/${cand.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ source: canal, exigir_canal: true }),
                });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) { setCanalMsg(j.error || "No se guardó el canal."); return; }
                setCanalMsg("Canal guardado.");
                onChanged?.();
              }}
            >
              Guardar canal
            </button>
            {canalMsg && <div className="text-xs mt-1 text-gray-700">{canalMsg}</div>}
          </Section>

          <Section title="Estado actual">
            <Row k="Stage" v={<span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{cand.stage || "aplico"}</span>} />
            <Row k="Status Integridad" v={cand.status} />
            {decisionBadge && (
              <Row k="Decisión prefiltro" v={
                <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: decisionBadge.color }}>
                  {decisionBadge.label}
                </span>
              } />
            )}
            {cand.prefilter_completed_at && (
              <Row k="Completó prefiltro" v={new Date(cand.prefilter_completed_at).toLocaleString("es-CO")} />
            )}
            {cand.notes?.includes(NOTA_BATERIA_PENDIENTE) && (
              <Row k="Batería TS" v={NOTA_BATERIA_PENDIENTE} />
            )}
          </Section>

          {/* Historial de contactos · correos de Gmail, WhatsApp importado,
              llamadas anotadas y cambios de etapa, en orden. */}
          <Section title="🧾 Historial de contactos">
            <HistorialContactos key={cand.id} candidateId={cand.id} />
          </Section>

          {/* Motivo de rechazo · solo si ya está clasificado */}
          {cand.stage === "rechazado" && (
            cand.rejection_category
              ? <RejectionDetailBlock cand={cand} />
              : <Section title="Motivo"><div className="text-sm text-amber-800">Sin motivo</div></Section>
          )}

          {/* Elevare results — solo si ya hizo el assessment */}
          {(cand.status === "completed" || cand.status === "in_progress" ||
            String(cand.stage || "").startsWith("assessment_")) && (
            <ElevareResultsBlock candidateId={cand.id} candidateStatus={cand.status} />
          )}

          {/* La entrevista IA por voz se retiró del funnel el 18-ago-2026:
              no aplica en el flujograma del proceso. La evaluación de los
              16 mandatos del CEO con IA sí se conserva, acá abajo. */}

          {/* Evaluación de los 16 mandatos del CEO con IA — se conserva.
              Se compara por posición en el funnel v4 en vez de listar codes
              sueltos: visible desde "Entrevista reclutador" (orden 6). */}
          {(stageOrder(cand.stage) >= 6 || String(cand.stage) === "rechazado") && (
            <RecruiterAssessmentCard candidateId={cand.id} candidateName={cand.name || ""} stage="recruiter_interview" />
          )}

          {/* El mismo assessment desde el lente de la CWO · desde "Terna" (orden 8) */}
          {(stageOrder(cand.stage) >= 8 || String(cand.stage) === "rechazado") && (
            <RecruiterAssessmentCard candidateId={cand.id} candidateName={cand.name || ""} stage="cwo_interview" />
          )}

          {/* Respuestas del prefiltro */}
          {pf && (
            <>
              <Section title="📋 Datos personales (prefiltro)">
                {pf.doc_type && <Row k="Tipo doc" v={pf.doc_type} />}
                {pf.doc_number && <Row k="Núm doc" v={pf.doc_number} />}
                {pf.phone && <Row k="Celular" v={pf.phone} />}
                {pf.city && <Row k="Ciudad" v={pf.city} />}
              </Section>

              <Section title="💼 Disponibilidad y salario">
                {pf.salary && <Row k="Expectativa salarial" v={<strong>{pf.salary}</strong>} />}
                {pf.availability && <Row k="Inicio disponible" v={pf.availability} />}
                {pf.relocate && <Row k="Mudanza Barranquilla" v={pf.relocate} />}
              </Section>

              <Section title="🌎 Idioma">
                {pf.english_level && <Row k="Nivel inglés" v={pf.english_level} />}
                {pf.english_cert && <Row k="Certifica inglés" v={pf.english_cert} />}
              </Section>

              <Section title="🎓 Formación + experiencia">
                {pf.edu_type && <Row k="Formación" v={pf.edu_type} />}
                {typeof pf.years_logistics === "number" && <Row k="Años logística/comex" v={`${pf.years_logistics} años`} />}
                {typeof pf.intl_clients === "boolean" && <Row k="Clientes internacionales" v={pf.intl_clients ? "Sí" : "No"} />}
                {typeof pf.excel_level === "number" && <Row k="Excel (1-5)" v={`${pf.excel_level}/5`} />}
                {pf.crms && pf.crms.length > 0 && (
                  <Row k="CRMs usados" v={pf.crms.join(", ")} />
                )}
              </Section>

              {pf._meta?.china && (
                <Section title="🇨🇳 Prefiltro China">
                  {pf.current_city && <Row k="Ciudad" v={pf.current_city} />}
                  {typeof pf._meta.work_authorized === "boolean" && (
                    <Row
                      k="Autorizado para trabajar"
                      v={
                        <strong className={pf._meta.work_authorized ? "text-emerald-700" : "text-red-700"}>
                          {pf._meta.work_authorized ? "Sí" : "No"}
                        </strong>
                      }
                    />
                  )}
                  {typeof pf._meta.onsite_available === "boolean" && (
                    <Row k="Presencial" v={pf._meta.onsite_available ? "Sí" : "No"} />
                  )}
                  {typeof pf.years_experience === "number" && <Row k="Años de experiencia" v={`${pf.years_experience}`} />}
                  {(pf._meta.salary_usd_expectation || pf.salary_usd) && (
                    <Row
                      k="Expectativa (USD/mes)"
                      v={
                        <span className={pf._meta.salary_over_budget ? "text-red-700 font-bold" : "font-bold"}>
                          {pf._meta.salary_usd_expectation || pf.salary_usd}
                          {pf._meta.salary_over_budget && pf._meta.salary_cap_usd
                            ? ` · sobre el tope de USD ${pf._meta.salary_cap_usd}`
                            : ""}
                        </span>
                      }
                    />
                  )}
                </Section>
              )}

              {pf._meta?.panama_ops && (
                <Section title="🇵🇦 Prefiltro Panama Ops">
                  {pf.current_city && <Row k="Ciudad" v={pf.current_city} />}
                  {typeof pf._meta.work_authorized_panama === "boolean" && (
                    <Row
                      k="Autorizado para trabajar (PA)"
                      v={
                        <strong className={pf._meta.work_authorized_panama ? "text-emerald-700" : "text-red-700"}>
                          {pf._meta.work_authorized_panama ? "Sí" : "No"}
                        </strong>
                      }
                    />
                  )}
                  {typeof pf._meta.onsite_panama_city === "boolean" && (
                    <Row
                      k="Presencial Panamá City"
                      v={
                        <strong className={pf._meta.onsite_panama_city ? "text-emerald-700" : "text-red-700"}>
                          {pf._meta.onsite_panama_city ? "Sí" : "No"}
                        </strong>
                      }
                    />
                  )}
                  {typeof (pf._meta.years_freight_panama ?? pf.years_freight_panama) === "number" && (
                    <Row
                      k="Años freight Panamá"
                      v={
                        <span className={pf._meta.years_freight_short ? "text-amber-700 font-bold" : undefined}>
                          {pf._meta.years_freight_panama ?? pf.years_freight_panama}
                          {pf._meta.years_freight_short ? " · bajo el mínimo (4)" : ""}
                        </span>
                      }
                    />
                  )}
                  {typeof pf._meta.ocean_fcl_lcl === "boolean" && (
                    <Row k="Ocean FCL/LCL" v={pf._meta.ocean_fcl_lcl ? "Sí" : "No"} />
                  )}
                  {typeof pf._meta.air_freight === "boolean" && (
                    <Row k="Air freight" v={pf._meta.air_freight ? "Sí" : "No"} />
                  )}
                  {typeof pf._meta.bl_awb_docs === "boolean" && (
                    <Row k="B/L · AWB docs" v={pf._meta.bl_awb_docs ? "Sí" : "No"} />
                  )}
                  {typeof pf._meta.warehouse_ftz === "boolean" && (
                    <Row k="Warehouse / FTZ" v={pf._meta.warehouse_ftz ? "Sí" : "No"} />
                  )}
                  {pf.english_level && (
                    <Row
                      k="Inglés"
                      v={
                        <span className={pf._meta.english_fails ? "text-amber-700 font-bold" : undefined}>
                          {pf.english_level}
                          {pf._meta.english_fails ? " · bajo B1" : ""}
                        </span>
                      }
                    />
                  )}
                  {(pf._meta.salary_usd_expectation || pf.salary_usd) && (
                    <Row
                      k="Expectativa (USD/mes)"
                      v={
                        <span className={pf._meta.salary_over_budget ? "text-red-700 font-bold" : "font-bold"}>
                          {pf._meta.salary_usd_expectation || pf.salary_usd}
                          {pf._meta.salary_over_budget && pf._meta.salary_cap_usd
                            ? ` · sobre el tope de USD ${pf._meta.salary_cap_usd}`
                            : ""}
                        </span>
                      }
                    />
                  )}
                </Section>
              )}

              {pf.license_status && (
                <Section title="🛡️ Credenciales SIG-SST">
                  <Row
                    k="Licencia en SST"
                    v={
                      <strong className={pf.license_status === "si" ? "text-emerald-700" : "text-red-700"}>
                        {LICENCIA_LABEL[pf.license_status] || pf.license_status}
                      </strong>
                    }
                  />
                  {pf.license_number && <Row k="Número y entidad" v={pf.license_number} />}
                  {pf.license_expiry && <Row k="Vence" v={pf.license_expiry} />}
                  {typeof pf.course_50h === "boolean" && <Row k="Curso 50 horas" v={pf.course_50h ? "Sí" : "No"} />}
                  {typeof pf.course_20h === "boolean" && (
                    <Row k="Actualización 20 horas" v={pf.course_20h ? `Sí${pf.course_20h_year ? ` · ${pf.course_20h_year}` : ""}` : "No"} />
                  )}
                  {typeof pf.postgrad_sig === "boolean" && <Row k="Posgrado SST/HSEQ/SIG" v={pf.postgrad_sig ? "Sí" : "No"} />}
                  {pf.auditor_certs && pf.auditor_certs.length > 0 && (
                    <Row k="Auditor certificado en" v={pf.auditor_certs.join(", ")} />
                  )}
                  {pf.systems_managed && pf.systems_managed.length > 0 && (
                    <Row k="Sistemas manejados" v={pf.systems_managed.join(", ")} />
                  )}
                  {typeof pf.years_sig === "number" && <Row k="Años en SIG y SST" v={`${pf.years_sig} años`} />}
                  {typeof pf.years_leading_sig === "number" && (
                    <Row k="Años liderando el sistema" v={<strong>{pf.years_leading_sig} años</strong>} />
                  )}
                  {typeof pf.cert_audit_cycles === "number" && (
                    <Row k="Ciclos de auditoría externa" v={`${pf.cert_audit_cycles}`} />
                  )}
                  {pf.sectors && pf.sectors.length > 0 && <Row k="Sectores" v={pf.sectors.join(", ")} />}
                </Section>
              )}

              <Section title="💰 Ventas, pricing, liderazgo">
                {typeof pf.years_sales === "number" && <Row k="Años en ventas" v={`${pf.years_sales} años`} />}
                {typeof pf.pricing_exp === "boolean" && <Row k="Experiencia pricing" v={pf.pricing_exp ? "Sí" : "No"} />}
                {typeof pf.leadership === "boolean" && (
                  <Row k="Lideró equipos" v={
                    pf.leadership ? `Sí — ${pf.team_size || 0} personas` : "No"
                  } />
                )}
              </Section>

              {(pf.why_ts || pf.next_role || pf.extra || pf.case_answer) && (
                <Section title="✍️ Sobre el candidato">
                  {pf.case_answer && (
                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 mb-2">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-amber-800 mb-1">
                        Caso · eficacia sin registrar, auditoría en 6 semanas
                      </p>
                      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{pf.case_answer}</p>
                    </div>
                  )}
                  {pf.why_ts && (
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-2">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-blue-800 mb-1">¿Por qué TS?</p>
                      <p className="text-sm text-gray-800 leading-relaxed">{pf.why_ts}</p>
                    </div>
                  )}
                  {pf.next_role && (
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-2">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-600 mb-1">Qué busca en próximo rol</p>
                      <p className="text-sm text-gray-800 leading-relaxed">{pf.next_role}</p>
                    </div>
                  )}
                  {pf.extra && (
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-600 mb-1">Algo más</p>
                      <p className="text-sm text-gray-800 leading-relaxed">{pf.extra}</p>
                    </div>
                  )}
                </Section>
              )}
            </>
          )}

          {!pf && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-500 italic">Aún no ha completado el prefiltro.</p>
            </div>
          )}

          {/* Evidencia del proceso · vive aquí para que el expediente quede completo */}
          <CandidateFilesBlock candidateId={cand.id} candidateName={cand.name} />

          {/* La calificación va debajo de la evidencia, y no al revés: el orden
              en pantalla es el orden del argumento.

              Se monta SIEMPRE, aunque el cargo no tenga rúbrica. Antes se
              escondía, y el resultado fue una ficha que no decía nada: había
              que adivinar si el bloque no existía, si estaba más abajo, o si
              algo se había roto. Sin rúbrica el panel lo dice con todas las
              letras. */}
          <EvaluacionPanel
            candidateId={cand.id}
            rubricaKey={rubricaDeVacante(cand.ht_vacancies?.title)?.key}
            cargo={cand.ht_vacancies?.title}
          />
        </div>
      </div>
    </div>

    {showRejectModal && (
      <RejectionModal
        candidateId={cand.id}
        candidateName={cand.name}
        vacancyTitle={cand.ht_vacancies?.title || "la posición"}
        lang={langDe(cand)}
        onClose={() => setShowRejectModal(false)}
        onRejected={() => {
          setShowRejectModal(false);
          setFeedback("✅ Rechazado · clasificado · draft listo en Gmail");
          setTimeout(() => {
            onChanged?.();
            onClose();
          }, 1200);
        }}
      />
    )}

    {showInvite && (
      <InvitarEntrevistaModal
        candidateId={cand.id}
        candidateName={cand.name || ""}
        onClose={() => setShowInvite(false)}
      />
    )}

    {showJointScheduling && (
      <JointSchedulingModal
        candidateId={cand.id}
        candidateName={cand.name || ""}
        candidateEmail={cand.email || ""}
        vacancyTitle={cand.ht_vacancies?.title || "la posición"}
        onClose={() => setShowJointScheduling(false)}
        onCreated={() => setFeedback("✅ Sesión de agendamiento conjunto creada · revisa el link en el modal")}
      />
    )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

// ─── Bloque de motivo de rechazo · pull lazy del catálogo para mostrar labels humanos
function RejectionDetailBlock({ cand }: { cand: Cand }) {
  const [catalog, setCatalog] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/admin/rejection-categories")
      .then(r => r.json())
      .then(j => setCatalog(j.categories || []))
      .catch(() => {});
  }, []);

  const cat = catalog.find((c: any) => c.category_key === cand.rejection_category);
  const subDetail = cat?.sub_details?.find((sd: any) => sd.key === cand.rejection_sub_detail);

  return (
    <div className="border border-[var(--ts-red-border,#fbcfcf)] bg-[var(--ts-red-bg,#fff5f5)] p-4">
      <h3 className="text-[11px] uppercase tracking-[1.5px] font-bold text-[var(--ts-red)] mb-3">
        Motivo de rechazo
      </h3>
      <div className="space-y-2 text-[13px]">
        <div>
          <div className="text-[10px] uppercase tracking-[1px] text-[var(--ts-gray-60)]">Categoría</div>
          <div className="font-semibold text-[var(--ts-black)]">
            {cat?.category_label || cand.rejection_category}
          </div>
        </div>
        {subDetail && (
          <div>
            <div className="text-[10px] uppercase tracking-[1px] text-[var(--ts-gray-60)]">Detalle</div>
            <div className="font-semibold text-[var(--ts-black)]">{subDetail.label}</div>
          </div>
        )}
        {(cand as any).rejection_note_private && (
          <div>
            <div className="text-[10px] uppercase tracking-[1px] text-[var(--ts-gray-60)]">Nota privada · interna</div>
            <div className="text-[var(--ts-gray-90)] italic leading-relaxed">
              {(cand as any).rejection_note_private}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 pt-2 border-t border-[var(--ts-red-border,#fbcfcf)]">
          {cand.rejection_save_for_future ? (
            <span className="text-[11px] font-semibold text-[var(--ts-green)]">★ Guardado en CV Bank</span>
          ) : (
            <span className="text-[11px] text-[var(--ts-gray-60)]">Sin marcar para CV Bank</span>
          )}
          {cand.rejected_at && (
            <span className="text-[11px] text-[var(--ts-gray-60)] ml-auto">
              {new Date(cand.rejected_at).toLocaleDateString("es-CO")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-3 text-sm py-1">
      <span className="text-gray-500 flex-shrink-0">{k}:</span>
      <span className="text-right text-gray-900">{v}</span>
    </div>
  );
}

// ─── Bloque Entrevista IA · ElevenLabs Conversational AI ──────────
function AIInterviewBlock({ candidateId, candidateEmail }: { candidateId: string; candidateEmail?: string }) {
  const [interview, setInterview] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");
  const [aiEnabled, setAiEnabled] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/admin/ai-interview-flag", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setAiEnabled(j.enabled === true))
      .catch(() => setAiEnabled(false));
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // We don't have a direct endpoint for "list ai_interviews by candidate"
      // — let's use a simpler check via candidates endpoint or skip and just
      // show button always.
      const r = await fetch(`/api/headhunting/candidates/${candidateId}/ai-interview-status`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setInterview(j.interview || null);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [candidateId]);

  React.useEffect(() => { load(); }, [load]);

  async function sendInterview() {
    if (sending || !aiEnabled) return;
    if (!confirm("¿Enviar entrevista IA por voz a este candidato? Se creará un draft en Gmail.")) return;
    setSending(true);
    setFeedback("Generando entrevista IA…");
    try {
      const r = await fetch(`/api/headhunting/candidates/${candidateId}/send-ai-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json();
      if (j.success) {
        setFeedback(`✅ Entrevista lista · revisa tu Gmail Drafts y envía a candidato`);
        load();
      } else {
        setFeedback(`❌ ${[j.error, j.detail].filter(Boolean).join(" · ") || "Error"}`);
      }
    } catch (e) {
      setFeedback(`❌ ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  if (loading) return null;

  const recommendation = visibleRecommendation(interview?.ai_recommendation);
  const recoColor =
    recommendation === "AVANZA" ? "#10B981" :
    recommendation === "EN ESPERA" ? "#F59E0B" :
    recommendation === "NO AVANZA" ? "#EF4444" : "#6B7280";

  return (
    <Section title="🎙️ Entrevista IA por voz">
      {!aiEnabled && <p className="text-xs text-gray-600 mb-2">Entrevista IA desactivada</p>}
      {interview && interview.status === "completed" && interview.ai_score != null ? (
        <>
          <div className="bg-gradient-to-br from-pink-50 to-purple-50 border border-pink-100 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              {recommendation && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ background: recoColor }}>
                  {recommendation}
                </span>
              )}
              <div className="flex items-baseline gap-1"><span className="text-xl font-extrabold">{Math.round(interview.ai_score)}</span><span className="text-[10px] text-gray-500">global</span></div>
              {interview.competency_score != null && (
                <div className="flex items-baseline gap-1"><span className="text-xl font-extrabold text-purple-700">{Math.round(interview.competency_score)}</span><span className="text-[10px] text-gray-500">competencias</span></div>
              )}
              {interview.english_level && interview.english_level !== "no_evaluated" && (
                <div className="flex items-baseline gap-1"><span className="text-xl font-extrabold text-blue-700">{interview.english_level}</span><span className="text-[10px] text-gray-500">inglés</span></div>
              )}
            </div>
            {interview.ai_summary && (
              <p className="text-xs text-gray-700 leading-relaxed">{interview.ai_summary}</p>
            )}
          </div>

          {/* Audio player con manejo de errores */}
          {interview.audio_url && (
            <RobustAudioPlayer
              audioUrl={interview.audio_url}
              candidateEmail={candidateEmail}
              label="🎧 Audio de la entrevista"
            />
          )}

          {/* Competencias detalladas */}
          {Array.isArray(interview.competencies_scores) && interview.competencies_scores.length > 0 && (
            <details className="mb-3">
              <summary className="text-xs font-bold cursor-pointer text-purple-800 mb-2">📊 Detalle de competencias ({interview.competencies_scores.length})</summary>
              <div className="space-y-1.5 mt-2 pl-2">
                {interview.competencies_scores.map((c: any, i: number) => {
                  const color = c.score >= 8 ? "bg-emerald-500" : c.score >= 6 ? "bg-amber-500" : "bg-red-500";
                  return (
                    <div key={i} className="text-xs">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 truncate font-semibold">{c.name}</div>
                        <div className="flex items-center gap-1">
                          <div className="w-12 h-1.5 bg-gray-200 rounded">
                            <div className={`h-full rounded ${color}`} style={{ width: `${(c.score || 0) * 10}%` }} />
                          </div>
                          <span className="font-bold w-6 text-right">{c.score}</span>
                        </div>
                      </div>
                      {c.evidence && (<p className="text-[10px] text-gray-600 italic mt-0.5 pl-1">&quot;{c.evidence}&quot;</p>)}
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {/* Inglés detallado */}
          {interview.english_detail && interview.english_level !== "no_evaluated" && (
            <details className="mb-3">
              <summary className="text-xs font-bold cursor-pointer text-blue-800 mb-2">🌎 Detalle de inglés ({interview.english_level})</summary>
              <div className="mt-2 pl-2 text-xs space-y-1">
                <div className="grid grid-cols-2 gap-1">
                  {[["Fluidez", interview.english_detail.fluency], ["Pronunciación", interview.english_detail.pronunciation], ["Gramática", interview.english_detail.grammar], ["Vocabulario", interview.english_detail.vocabulary], ["Comprensión", interview.english_detail.comprehension]].map(([label, score]: any, i) => (
                    <div key={i} className="flex justify-between"><span className="text-gray-600">{label}:</span><span className="font-bold">{score}/10</span></div>
                  ))}
                </div>
                {interview.english_detail.professional_readiness && (
                  <div className="mt-2 pt-2 border-t border-blue-100">
                    <strong>Listo para clientes:</strong>{" "}
                    {interview.english_detail.professional_readiness === "ready_for_clients" ? "✅ Sí" :
                     interview.english_detail.professional_readiness === "needs_practice" ? "⚠️ Necesita práctica" : "❌ No listo"}
                  </div>
                )}
                {interview.english_detail.summary && (<p className="text-[11px] text-gray-700 italic mt-1">{interview.english_detail.summary}</p>)}
              </div>
            </details>
          )}

          {/* Strengths & gaps */}
          {(interview.ai_strengths?.length > 0 || interview.ai_gaps?.length > 0) && (
            <details className="mb-3">
              <summary className="text-xs font-bold cursor-pointer text-gray-700 mb-2">💪 Fortalezas y gaps</summary>
              <div className="mt-2 pl-2 space-y-2 text-xs">
                {interview.ai_strengths?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-emerald-700 mb-1">Fortalezas</p>
                    <ul className="space-y-1">
                      {interview.ai_strengths.map((s: any, i: number) => (
                        <li key={i}><strong>{s.area}:</strong> <span className="text-gray-600 italic">&quot;{s.evidence}&quot;</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {interview.ai_gaps?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-red-700 mb-1">Gaps</p>
                    <ul className="space-y-1">
                      {interview.ai_gaps.map((g: any, i: number) => (
                        <li key={i}><strong>{g.area}</strong> <span className={g.severity === "high" ? "text-red-700" : g.severity === "medium" ? "text-amber-700" : "text-gray-500"}>({g.severity})</span>: <span className="text-gray-600 italic">&quot;{g.evidence}&quot;</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Red flags */}
          {interview.ai_red_flags && interview.ai_red_flags.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3">
              <p className="text-[10px] uppercase font-bold text-red-700 mb-1">🚩 Red flags ({interview.ai_red_flags.length})</p>
              <ul className="text-xs text-red-800 list-disc pl-4 space-y-0.5">
                {interview.ai_red_flags.map((f: string, i: number) => (<li key={i}>{f}</li>))}
              </ul>
            </div>
          )}
        </>
      ) : interview && interview.status === "completed" && interview.conversation_id && interview.ai_score == null ? (
        <PendingScoringPanel interview={interview} onScored={() => load()} candidateEmail={candidateEmail} enabled={aiEnabled} />
      ) : interview && interview.status === "in_progress" ? (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3 text-xs text-blue-900">
          ⏳ Candidato en entrevista — esperando que termine. Iniciada: {new Date(interview.started_at).toLocaleString("es-CO")}
        </div>
      ) : interview && interview.status === "invited" ? (
        <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 mb-3 text-xs text-yellow-900">
          📩 Entrevista enviada. Esperando que el candidato la inicie. Token expira: {new Date(interview.token_expires_at).toLocaleDateString("es-CO")}
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 text-xs text-gray-600">
          Aún no se ha enviado entrevista IA a este candidato.
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={sendInterview}
          disabled={!aiEnabled || sending || (interview && interview.status === "in_progress")}
          className="text-xs font-semibold px-3 py-1.5 rounded-full bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? "…" :
            interview && interview.status === "completed" ? "🔄 Reenviar entrevista" :
            interview && interview.status === "invited" ? "🔄 Reenviar enlace" :
            "🎙️ Enviar entrevista IA"}
        </button>
        {interview?.token && (
          <a
            href={`/entrevista-ia/${interview.token}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold px-3 py-1.5 rounded-full border-2 border-pink-400 text-pink-800 hover:bg-pink-50"
          >
            👀 Ver enlace candidato
          </a>
        )}
      </div>
      {feedback && (<div className="mt-2 text-xs text-gray-600 italic">{feedback}</div>)}
    </Section>
  );
}

// ─── Botón inline para correr scoring AI de UNA entrevista pendiente ─
function PendingScoringPanel({ interview, onScored, candidateEmail, enabled = true }: { interview: any; onScored: () => void; candidateEmail?: string; enabled?: boolean }) {
  const [running, setRunning] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [result, setResult] = React.useState<{ ok: boolean; message: string; score?: number; error_kind?: string } | null>(null);

  // Cronómetro mientras corre
  React.useEffect(() => {
    if (!running) { setElapsed(0); return; }
    const start = Date.now();
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const runScoring = async () => {
    if (!enabled) return;
    setRunning(true);
    setResult(null);
    try {
      // Timeout 100s — un poco más que el del backend (90s) para no cortar antes
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 100_000);

      const r = await fetch('/api/admin/rescore-ai-interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview_ids: [interview.id] }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!r.ok) {
        setResult({ ok: false, message: `HTTP ${r.status}: el endpoint falló. Mirá logs de Vercel.` });
        return;
      }

      const j = await r.json();
      const myResult = j.results?.find((x: any) => x.interview_id === interview.id);
      if (myResult?.success) {
        setResult({ ok: true, message: `Score: ${myResult.score}/100`, score: myResult.score });
        setTimeout(() => onScored(), 800);
      } else {
        setResult({
          ok: false,
          message: myResult?.error || j.error || 'Error desconocido (sin detalle del backend)',
          error_kind: myResult?.error_kind,
        });
      }
    } catch (e: any) {
      const isAbort = e?.name === 'AbortError';
      setResult({
        ok: false,
        message: isAbort
          ? 'Timeout cliente (>100s). Probablemente Vercel cortó la conexión. Revisá logs.'
          : (e?.message || 'Error de red'),
        error_kind: isAbort ? 'timeout' : 'network',
      });
    } finally {
      setRunning(false);
    }
  };

  // Mensaje de ayuda según el tipo de error
  const errorHelp = (kind?: string): string | null => {
    if (kind === 'no_transcript') {
      return 'Solución: Click "Reenviar entrevista" para que el candidato la haga otra vez. ElevenLabs ya borró el audio/transcripción de la sesión anterior.';
    }
    if (kind === 'timeout') {
      return 'Solución: Reintentar (a veces Anthropic tarda más con transcripts largos). Si persiste, revisar logs en Vercel.';
    }
    return null;
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-xs text-amber-900">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-bold">✓ Entrevista completada</div>
          <div className="text-[11px] text-amber-700 mt-0.5">conversation_id ya capturado · falta correr scoring AI (~1 min)</div>
        </div>
      </div>
      {interview.audio_url && (
        <RobustAudioPlayer
          audioUrl={interview.audio_url}
          candidateEmail={candidateEmail}
          label="🎧 Audio disponible"
        />
      )}
      {result ? (
        <div className={`mt-2 p-2.5 rounded text-[11px] ${result.ok ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
          <div className="font-bold">
            {result.ok ? `✅ Scoring completado · ${result.message} · refrescando…` : `❌ ${result.message}`}
          </div>
          {!result.ok && errorHelp(result.error_kind) && (
            <div className="mt-1.5 text-[10px] font-medium opacity-90">→ {errorHelp(result.error_kind)}</div>
          )}
          {!result.ok && (
            <button
              onClick={() => { setResult(null); }}
              className="mt-2 text-[10px] font-bold underline"
            >
              Reintentar
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={runScoring}
          disabled={running || !enabled}
          className="w-full bg-black hover:bg-gray-800 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-full flex items-center justify-center gap-1.5"
        >
          {!enabled ? "Entrevista IA desactivada" : running ? `⏳ Corriendo 3 agentes Claude · ${elapsed}s/90s` : "🤖 Correr scoring AI ahora"}
        </button>
      )}
    </div>
  );
}

// ─── Bloque de resultados de Elevare con AI scoring + auditor anti-cheat ─
function ElevareResultsBlock({
  candidateId,
  candidateStatus,
}: {
  candidateId: string;
  candidateStatus?: string;
}) {
  const [data, setData] = React.useState<{
    result: any;
    audit: any;
  }>({ result: null, audit: null });
  const [loading, setLoading] = React.useState(true);
  const [scoring, setScoring] = React.useState(false);
  const [auditing, setAuditing] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/headhunting/results/${candidateId}`, { cache: "no-store" });
      const j = await r.json();
      setData({
        result: j.result,
        audit: j.result?.benchmark_comparison?.proctoring?.ai_audit || null,
      });
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function runScoring() {
    if (scoring) return;
    setScoring(true);
    setFeedback("Calculando con Claude…");
    try {
      const r = await fetch(`/api/headhunting/candidates/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId }),
      });
      const j = await r.json();
      if (j.success) {
        setFeedback(`✅ Match ${Math.round(j.match_percentage)}% · ${j.recommendation}`);
        load();
      } else {
        setFeedback(`❌ ${j.error || "Error"}${j.details ? `: ${j.details.slice(0, 80)}` : ""}`);
      }
    } catch (e) {
      setFeedback(`❌ ${(e as Error).message}`);
    } finally {
      setScoring(false);
    }
  }

  async function runAudit() {
    if (auditing) return;
    setAuditing(true);
    setFeedback("Auditando anti-cheat con Claude…");
    try {
      const r = await fetch(`/api/headhunting/results/${candidateId}/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json();
      if (j.success) {
        setFeedback(`✅ ${j.audit.verdict} · integridad ${j.audit.integrity_score}/100`);
        load();
      } else {
        setFeedback(`❌ ${j.error || "Error"}${j.detail ? `: ${j.detail.slice(0, 80)}` : ""}`);
      }
    } catch (e) {
      setFeedback(`❌ ${(e as Error).message}`);
    } finally {
      setAuditing(false);
    }
  }

  if (loading) {
    return (
      <Section title="🧠 Resultados Integridad">
        <div className="text-xs text-gray-400">Cargando…</div>
      </Section>
    );
  }

  const result = data.result;
  const audit = data.audit;
  const proctoring = result?.benchmark_comparison?.proctoring;
  const matchPct = result?.match_percentage ?? 0;
  const recoColor =
    result?.recommendation === "AVANZA"
      ? "#10B981"
      : result?.recommendation === "EN ESPERA"
      ? "#F59E0B"
      : result?.recommendation === "NO AVANZA"
      ? "#EF4444"
      : "#6B7280";
  const verdictColor =
    audit?.verdict === "CONFIABLE"
      ? "#10B981"
      : audit?.verdict === "SOSPECHOSO"
      ? "#F59E0B"
      : audit?.verdict === "NO CONFIABLE"
      ? "#EF4444"
      : "#6B7280";

  const hasResult = !!result && (result.match_percentage > 0 || result.recommendation !== "PENDIENTE");

  return (
    <Section title="🧠 Resultado prueba virtual">
      {/* Resumen */}
      {hasResult ? (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-100 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-3 mb-2">
            <span
              className="px-2.5 py-1 rounded-full text-xs font-bold text-white"
              style={{ background: recoColor }}
            >
              {result.recommendation}
            </span>
            <span className="text-xl font-extrabold">{Math.round(matchPct)}%</span>
            <span className="text-xs text-gray-500">match</span>
            {result.benchmark_comparison?.percentile_rank && (
              <span className="text-xs text-gray-500 ml-auto">
                P{result.benchmark_comparison.percentile_rank}
              </span>
            )}
          </div>
          {result.recommendation_reason && (
            <p className="text-xs text-gray-700 leading-relaxed">
              {result.recommendation_reason}
            </p>
          )}
          {result.red_flags?.length > 0 && (
            <div className="mt-2 pt-2 border-t border-purple-200">
              <p className="text-[10px] uppercase font-bold text-red-700 mb-1">
                Red flags ({result.red_flags.length})
              </p>
              <ul className="text-xs text-red-800 list-disc pl-4 space-y-0.5">
                {result.red_flags.slice(0, 3).map((f: string, i: number) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 text-xs text-gray-600">
          {candidateStatus === "completed"
            ? "Candidato completó la evaluación. Calcula el score con IA para ver match y recomendación."
            : "Aún no hay resultados (status: " + (candidateStatus || "—") + ")"}
        </div>
      )}

      {/* Anti-cheat audit */}
      {audit ? (
        <div
          className="border-l-4 rounded-r-lg p-3 mb-3 bg-gray-50"
          style={{ borderColor: verdictColor }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold" style={{ color: verdictColor }}>
              ● {audit.verdict}
            </span>
            <span className="text-xs text-gray-500">
              · integridad {audit.integrity_score}/100
            </span>
          </div>
          <p className="text-xs text-gray-700 leading-relaxed">{audit.verdict_reason}</p>
          {audit.red_flags?.length > 0 && (
            <details className="mt-1.5">
              <summary className="text-xs font-semibold cursor-pointer text-gray-600">
                {audit.red_flags.length} red flags · ver detalle
              </summary>
              <ul className="mt-1 text-[11px] text-gray-700 space-y-1 pl-3">
                {audit.red_flags.map((f: any, i: number) => (
                  <li key={i}>
                    <span
                      className={
                        "px-1 py-0.5 rounded text-[9px] font-bold mr-1 " +
                        (f.severity === "high"
                          ? "bg-red-200 text-red-800"
                          : f.severity === "medium"
                          ? "bg-amber-200 text-amber-800"
                          : "bg-gray-200 text-gray-700")
                      }
                    >
                      {f.severity}
                    </span>
                    <strong>{f.category}:</strong> {f.evidence}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : proctoring ? (
        <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-2.5 mb-3 text-xs text-yellow-900">
          📹 Proctoring: cámara {proctoring.camera_enabled ? "✓" : "✗"} ·{" "}
          {proctoring.total_tab_switches ?? 0} cambios pestaña ·{" "}
          {proctoring.total_camera_snapshots ?? 0} snapshots
          <div className="text-[10px] text-yellow-700 mt-1">
            Sin auditoría IA aún · ejecuta el auditor para evaluar trampa
          </div>
        </div>
      ) : null}

      {/* Acciones */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={runScoring}
          disabled={scoring || candidateStatus !== "completed"}
          className="text-xs font-semibold px-3 py-1.5 rounded-full bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {scoring ? "…" : hasResult ? "🔄 Recalcular" : "🧠 Calcular score"}
        </button>
        <button
          onClick={runAudit}
          disabled={auditing || !hasResult}
          className="text-xs font-semibold px-3 py-1.5 rounded-full border-2 border-amber-400 text-amber-800 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
          title={!hasResult ? "Calcula el score primero" : "Auditar anti-cheat con IA"}
        >
          {auditing ? "…" : audit ? "🔄 Re-auditar" : "🔍 Auditar trampa"}
        </button>
        <a
          href={`/hr-admin/report/${candidateId}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold px-3 py-1.5 rounded-full bg-black text-white hover:bg-gray-800"
        >
          📄 Ver informe completo →
        </a>
      </div>

      {feedback && (
        <div className="mt-2 text-xs text-gray-600 italic">{feedback}</div>
      )}
    </Section>
  );
}

/* ─── Robust Audio Player · maneja errores y diagnostica ────────── */
function RobustAudioPlayer({
  audioUrl,
  candidateEmail,
  label = '🎧 Audio de la entrevista',
}: {
  audioUrl: string;
  candidateEmail?: string;
  label?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const runDiagnosis = async () => {
    if (!candidateEmail) return;
    setDiagnosing(true);
    setDiagResult(null);
    try {
      const r = await fetch(`/api/admin/diag/audio?email=${encodeURIComponent(candidateEmail)}`, { cache: 'no-store' });
      const j = await r.json();
      setDiagResult(j);
    } catch (e: any) {
      setDiagResult({ error: e?.message || 'Error de red' });
    } finally {
      setDiagnosing(false);
    }
  };

  return (
    <div className="mb-3">
      <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">{label}</p>
      {!error ? (
        <audio
          key={reloadKey}
          src={audioUrl}
          controls
          className="w-full"
          preload="metadata"
          onError={(e) => {
            const target = e.currentTarget as HTMLAudioElement;
            const code = target.error?.code;
            const codeName = code === 1 ? 'MEDIA_ERR_ABORTED'
              : code === 2 ? 'MEDIA_ERR_NETWORK'
              : code === 3 ? 'MEDIA_ERR_DECODE'
              : code === 4 ? 'MEDIA_ERR_SRC_NOT_SUPPORTED'
              : 'desconocido';
            setError(codeName);
          }}
        />
      ) : (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-xs">
          <div className="font-bold text-red-900 mb-1">No se pudo cargar el audio</div>
          <div className="text-red-700 mb-2">Error: {error}. Causas comunes: el conversation_id de ElevenLabs ya no tiene audio guardado, o la API key cambió.</div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setError(null); setReloadKey(k => k + 1); }}
              className="text-[11px] font-semibold px-3 py-1 rounded-full bg-white border border-gray-300 hover:border-black"
            >
              ↻ Reintentar
            </button>
            {candidateEmail && (
              <button
                onClick={runDiagnosis}
                disabled={diagnosing}
                className="text-[11px] font-semibold px-3 py-1 rounded-full bg-black text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {diagnosing ? 'Diagnosticando…' : '🔬 Diagnosticar'}
              </button>
            )}
          </div>
          {diagResult && (
            <div className="mt-2 p-2 bg-white border border-red-100 rounded text-[10px] font-mono whitespace-pre-wrap break-all">
              <div className="font-bold mb-1">Diagnóstico:</div>
              {diagResult.recommendation && (
                <div className="text-red-900 font-semibold mb-1 not-italic">→ {diagResult.recommendation}</div>
              )}
              <pre className="text-gray-700">{JSON.stringify({
                has_conversation_id: diagResult.diagnosis?.has_conversation_id,
                audio_url_kind: diagResult.diagnosis?.audio_url_kind,
                elevenlabs_check: diagResult.elevenlabs_check,
              }, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



