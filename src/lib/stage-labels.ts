/**
 * FUENTE ÚNICA DE VERDAD del funnel de selección.
 *
 * v4 · 18-ago-2026 — Kelly redefinió el proceso en dos fases:
 *   SELECCIÓN (8 etapas) → CONTRATACIÓN (5 etapas)
 *
 * REGLAS:
 *  1. Ningún archivo debe declarar su propia lista de etapas. Importar de acá.
 *  2. Nunca imprimir el code crudo en pantalla — usar `stageLabel(code)`.
 *  3. Los codes viejos siguen siendo válidos en BD; `normalizeStage()` los
 *     traduce a la etapa canónica v4 para agrupar, contar y mostrar.
 */

// ─────────────────────────────────────────────────────────────
// Etapas canónicas v4
// ─────────────────────────────────────────────────────────────

export type Phase = 'seleccion' | 'contratacion';

export type StageCode =
  // ── Fase 1 · Selección ──
  | 'aplico'
  | 'prefiltro_enviado'
  | 'prefiltro_pasado'
  | 'prefiltro_revision'
  | 'pruebas'
  | 'recruiter_interview'
  | 'prueba_tecnica'
  | 'terna'
  // ── Fase 2 · Contratación ──
  | 'examenes_medicos'
  | 'estudio_seguridad'
  | 'documentacion_ingreso'
  | 'oferta'
  | 'contratado'
  // ── Terminal ──
  | 'rechazado';

export interface StageDef {
  id: StageCode;
  /** Posición 1..13 dentro del proceso completo */
  order: number;
  phase: Phase;
  /** Etiqueta corta — chips y tablas */
  label: string;
  /** Etiqueta larga — títulos y tooltips */
  labelLong: string;
  /** Quién tiene la pelota mientras el candidato está acá */
  owner: string;
  /** Días máximos antes de considerarlo atascado */
  sla: number;
  /** Acción concreta que debe ejecutar el responsable */
  action: string;
}

export const PHASE_LABEL: Record<Phase, string> = {
  seleccion: 'Selección',
  contratacion: 'Contratación',
};

export const STAGES: StageDef[] = [
  // ───────────── SELECCIÓN ─────────────
  {
    id: 'aplico', order: 1, phase: 'seleccion',
    label: 'Aplicó', labelLong: 'Aplicó a la vacante',
    owner: 'Automático', sla: 3,
    action: 'Enviar el prefiltro',
  },
  {
    id: 'prefiltro_enviado', order: 2, phase: 'seleccion',
    label: 'Prefiltro enviado', labelLong: 'Prefiltro enviado al candidato',
    owner: 'Espera candidato', sla: 5,
    action: 'Hacer follow-up si no responde',
  },
  {
    id: 'prefiltro_pasado', order: 3, phase: 'seleccion',
    label: 'Prefiltro pasado', labelLong: 'Prefiltro pasado · superó los knock-outs automáticos',
    owner: 'Recruiter', sla: 2,
    action: 'Pasar a revisión del recruiter',
  },
  {
    id: 'prefiltro_revision', order: 4, phase: 'seleccion',
    label: 'Revisión de prefiltro', labelLong: 'Revisión de prefiltro por el recruiter',
    owner: 'Recruiter', sla: 2,
    action: 'Revisar respuestas y decidir avance',
  },
  {
    // ORDEN CORREGIDO 11-sep-2026. Antes la bateria y el assessment iban
    // DESPUES de la entrevista, con el argumento de que cada prueba cuesta
    // plata y tiempo por persona y no vale gastarla en quien la entrevista
    // habria descartado igual. Ese argumento sigue siendo valido para pruebas
    // individuales, pero no para este proceso: la bateria se manda sola por
    // correo y el assessment es una sola manana para ocho personas. Aqui sale
    // mas barato filtrar antes de entrevistar.
    id: 'pruebas', order: 5, phase: 'seleccion',
    label: 'Batería', labelLong: 'Batería de selección en línea',
    owner: 'Espera candidato', sla: 4,
    action: 'Revisar quién no ha presentado la batería y recordárselo',
  },
  {
    id: 'prueba_tecnica', order: 6, phase: 'seleccion',
    label: 'Assessment presencial', labelLong: 'Assessment presencial y prueba técnica',
    owner: 'Compartido', sla: 5,
    action: 'Citar a la sesión y consolidar las calificaciones de los evaluadores',
  },
  {
    id: 'recruiter_interview', order: 7, phase: 'seleccion',
    label: 'Entrevista reclutador', labelLong: 'Entrevista con el reclutador',
    owner: 'Recruiter', sla: 5,
    action: 'Completar scorecard y decidir avance',
  },
  {
    id: 'terna', order: 8, phase: 'seleccion',
    label: 'Terna para Hiring Lead', labelLong: 'Terna entregada al Hiring Lead / Manager',
    owner: 'Hiring Lead / Manager', sla: 5,
    action: 'Pedir decisión al Hiring Lead',
  },

  // ─────────── CONTRATACIÓN ───────────
  {
    id: 'examenes_medicos', order: 9, phase: 'contratacion',
    label: 'Exámenes médicos', labelLong: 'Exámenes médicos de ingreso',
    owner: 'Espera candidato', sla: 3,
    action: 'Confirmar cita y resultado',
  },
  {
    id: 'estudio_seguridad', order: 10, phase: 'contratacion',
    label: 'Estudio de seguridad', labelLong: 'Estudio de seguridad',
    owner: 'Proveedor externo', sla: 5,
    action: 'Hacer seguimiento al proveedor',
  },
  {
    id: 'documentacion_ingreso', order: 11, phase: 'contratacion',
    label: 'Documentación de ingreso', labelLong: 'Documentación de ingreso',
    owner: 'Espera candidato', sla: 3,
    action: 'Verificar documentos faltantes',
  },
  {
    id: 'oferta', order: 12, phase: 'contratacion',
    label: 'Oferta', labelLong: 'Oferta enviada · esperando respuesta',
    owner: 'Espera candidato', sla: 7,
    action: 'Hacer follow-up de la respuesta',
  },
  {
    id: 'contratado', order: 13, phase: 'contratacion',
    label: 'Contratación', labelLong: 'Contratado',
    owner: 'Nómina', sla: 2,
    action: 'Iniciar onboarding',
  },
];

export const REJECTED_STAGE: StageDef = {
  id: 'rechazado', order: 99, phase: 'seleccion',
  label: 'Rechazado', labelLong: 'Rechazado',
  owner: '—', sla: 0, action: '',
};

/** Todas las etapas incluyendo la terminal negativa */
export const ALL_STAGES: StageDef[] = [...STAGES, REJECTED_STAGE];

/** Solo las etapas donde un candidato está "vivo" (excluye contratado y rechazado) */
export const ACTIVE_STAGES: StageCode[] = STAGES
  .filter((s) => s.id !== 'contratado')
  .map((s) => s.id);

/** Orden canónico de codes, para ordenar y calcular avance */
export const STAGE_ORDER: StageCode[] = STAGES.map((s) => s.id);

export const STAGE_RANK: Record<string, number> = Object.fromEntries(
  STAGES.map((s) => [s.id, s.order]),
);

export const STAGES_BY_PHASE: Record<Phase, StageDef[]> = {
  seleccion: STAGES.filter((s) => s.phase === 'seleccion'),
  contratacion: STAGES.filter((s) => s.phase === 'contratacion'),
};

const BY_ID: Record<string, StageDef> = Object.fromEntries(
  ALL_STAGES.map((s) => [s.id, s]),
);

// ─────────────────────────────────────────────────────────────
// Compatibilidad con los codes viejos que ya viven en la BD
// ─────────────────────────────────────────────────────────────

/**
 * Codes históricos → etapa canónica v4.
 * No se reescribe la BD: se traduce al leer. Así ningún candidato
 * en curso se pierde ni queda en una etapa que ya no existe.
 */
export const LEGACY_STAGE_MAP: Record<string, StageCode> = {
  // El prefiltro rechazado siempre fue un descarte
  prefiltro_rechazado: 'rechazado',

  // Todo lo que antes eran pruebas sueltas ahora vive dentro de "Pruebas"
  assessment_invitado: 'pruebas',
  assessment_en_progreso: 'pruebas',
  assessment_completado: 'pruebas',
  bateria_psicometrica: 'pruebas',
  solicitud_enviada_mary: 'pruebas',
  touring: 'pruebas',            // Máquina de Turing es ahora una sub-prueba

  // La entrevista IA hacía el trabajo del screening del reclutador
  entrevista_ia: 'recruiter_interview',

  // Las dos entrevistas de decisión se consolidaron en la Terna
  hiring_lead_interview: 'terna',
  cwo_interview: 'terna',

  // Onboarding salió del funnel de selección
  onboarding: 'contratado',
};

/** Codes que el endpoint de cambio de etapa sigue aceptando (nuevos + legacy) */
export const VALID_STAGES: string[] = [
  ...ALL_STAGES.map((s) => s.id),
  ...Object.keys(LEGACY_STAGE_MAP),
];

/**
 * Traduce cualquier code (nuevo o histórico) a la etapa canónica v4.
 * Un code desconocido se devuelve tal cual para no romper el render.
 */
export function normalizeStage(code: string | null | undefined): string {
  if (!code) return '';
  if (BY_ID[code]) return code;
  return LEGACY_STAGE_MAP[code] ?? code;
}

// ─────────────────────────────────────────────────────────────
// Sub-pruebas de la etapa "Pruebas"
// ─────────────────────────────────────────────────────────────

export interface TestDef {
  id: string;
  label: string;
  owner: string;
  sla: number;
}

/** La batería completa, tal como está en el Hiring Flow de Trading Solutions */
export const PRUEBAS: TestDef[] = [
  { id: 'disc',           label: 'DISC · personalidad',   owner: 'Espera candidato',  sla: 4 },
  { id: 'motivacion',     label: 'Motivación',            owner: 'Espera candidato',  sla: 4 },
  { id: 'maquina_turing', label: 'Máquina de Turing',     owner: 'Espera candidato',  sla: 4 },
  { id: 'betesa',         label: 'Betesa',                owner: 'Espera candidato',  sla: 4 },
  { id: 'iq_factorial',   label: 'IQ Factorial',          owner: 'Espera candidato',  sla: 4 },
  { id: 'neurocluster',   label: 'Análisis Neurocluster', owner: 'Proveedor externo', sla: 5 },
];

/** Sub-evaluaciones de la etapa "Prueba técnica / Assessment" */
export const EVALUACIONES_TECNICAS: TestDef[] = [
  { id: 'assessment_grupal',  label: 'Assessment grupal',        owner: 'Caso situacional + 6 competencias', sla: 5 },
  { id: 'prueba_tecnica_cargo', label: 'Prueba técnica del cargo', owner: 'Líder de área · caso práctico',   sla: 5 },
];

/** Sub-items por etapa — para el desglose del dashboard */
export const STAGE_BREAKDOWN: Record<string, TestDef[]> = {
  pruebas: PRUEBAS,
  prueba_tecnica: EVALUACIONES_TECNICAS,
};

// ─────────────────────────────────────────────────────────────
// Mapas derivados (compatibilidad con los imports que ya existen)
// ─────────────────────────────────────────────────────────────

export const STAGE_LABEL_SHORT: Record<string, string> = Object.fromEntries(
  ALL_STAGES.map((s) => [s.id, s.label]),
);

export const STAGE_LABEL_LONG: Record<string, string> = Object.fromEntries(
  ALL_STAGES.map((s) => [s.id, s.labelLong]),
);

export const STAGE_ACTION: Record<string, string> = Object.fromEntries(
  STAGES.filter((s) => s.action).map((s) => [s.id, s.action]),
);

export const STAGE_SLA_DAYS: Record<string, number> = Object.fromEntries(
  STAGES.map((s) => [s.id, s.sla]),
);

export const STAGE_PHASE: Record<string, Phase> = Object.fromEntries(
  STAGES.map((s) => [s.id, s.phase]),
);

/**
 * Categoría del stage — se conserva porque varios componentes colorean con esto.
 */
export const STAGE_CATEGORY: Record<string, 'screening' | 'assessment' | 'interview' | 'decision' | 'terminal'> = {
  aplico: 'screening',
  prefiltro_enviado: 'screening',
  prefiltro_pasado: 'screening',
  prefiltro_revision: 'screening',
  pruebas: 'assessment',
  recruiter_interview: 'interview',
  prueba_tecnica: 'assessment',
  terna: 'decision',
  examenes_medicos: 'decision',
  estudio_seguridad: 'decision',
  documentacion_ingreso: 'decision',
  oferta: 'decision',
  contratado: 'terminal',
  rechazado: 'terminal',
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Definición completa de una etapa (acepta codes históricos) */
export function stageDef(code: string | null | undefined): StageDef | null {
  const id = normalizeStage(code);
  return BY_ID[id] ?? null;
}

/** Etiqueta corta con fallback al code */
export function stageLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return stageDef(code)?.label ?? code;
}

/** Etiqueta larga con fallback */
export function stageLabelLong(code: string | null | undefined): string {
  if (!code) return '—';
  return stageDef(code)?.labelLong ?? code;
}

/** Acción a ejecutar en esta etapa */
export function stageAction(code: string | null | undefined): string | null {
  if (!code) return null;
  return stageDef(code)?.action || null;
}

/** SLA en días */
export function stageSla(code: string | null | undefined): number | null {
  if (!code) return null;
  return stageDef(code)?.sla ?? null;
}

/** Fase a la que pertenece la etapa */
export function stagePhase(code: string | null | undefined): Phase | null {
  if (!code) return null;
  return stageDef(code)?.phase ?? null;
}

/** Posición 1..13 en el proceso */
export function stageOrder(code: string | null | undefined): number {
  return stageDef(code)?.order ?? 0;
}

/**
 * La etapa que sigue, según este archivo y nada más.
 *
 * POR QUÉ ESTÁ ACÁ Y NO EN LA PANTALLA
 * El orden del proceso estaba escrito por tercera vez dentro del componente
 * del funnel —un mapa de transiciones y una cadena de if/else, las dos de la
 * versión de mayo— y se quedaron viejas: el botón «avanzar» mandaba desde la
 * entrevista a etapas que ya no existen y que, al normalizarse, caían en
 * Terna. O sea que el candidato se saltaba pruebas y prueba técnica sin que
 * nadie lo hubiera decidido. Derivarlo del orden canónico es lo que impide
 * que vuelva a pasar.
 *
 * Acepta codes históricos: `stageDef` los normaliza antes.
 */
export function siguienteEtapa(code: string | null | undefined): StageDef | null {
  const actual = stageDef(code);
  if (!actual || actual.id === 'rechazado') return null;
  return STAGES.find((s) => s.order === actual.order + 1) ?? null;
}

/**
 * Estado de un candidato frente al SLA de su etapa.
 *  ok       → dentro del SLA
 *  warning  → justo en el límite
 *  serious  → lo pasó
 *  critical → lo pasó por más del doble
 */
export function slaStatus(code: string | null | undefined, days: number): 'ok' | 'warning' | 'serious' | 'critical' {
  const sla = stageSla(code);
  if (!sla) return 'ok';
  if (days >= sla * 2) return 'critical';
  if (days > sla) return 'serious';
  if (days >= sla) return 'warning';
  return 'ok';
}

// ─────────────────────────────────────────────────────────────
// Gates de Kelly · el tablero y los eventos para agentes
// ─────────────────────────────────────────────────────────────

/**
 * Los 12 gates con los que Kelly lee el proceso (27-oct-2026).
 *
 * POR QUÉ NO SON LAS ETAPAS
 * Las etapas son lo que se escribe en la BD; los gates son cómo se agrupan
 * para el tablero y para los agentes que consumen `candidate.stage_changed`.
 * Un gate puede juntar varias etapas (Prefiltro, Médicos/Seguridad) y dos
 * gates —Psicométricas y Entrevista HM— todavía no tienen code propio: solo
 * los llenan codes históricos. No se inventa un StageCode nuevo hasta que
 * Kelly lo nombre; mientras tanto se sigue escribiendo con los codes v4.
 *
 * El orden de este arreglo ES el orden del tablero: Docs va después de Oferta.
 */
export type KellyGateId =
  | 'nuevo'
  | 'prefiltro'
  | 'bateria_ts'
  | 'assessment'
  | 'entrevista_sel'
  | 'psicometricas'
  | 'terna'
  | 'entrevista_hm'
  | 'medicos_seguridad'
  | 'oferta'
  | 'docs'
  | 'onboarding';

export interface KellyGate {
  id: KellyGateId;
  /** 1..12 */
  n: number;
  label: string;
  /** Etapas v4 que caen en este gate */
  stages: StageCode[];
  /** Codes históricos que caen acá ANTES de normalizar (sin code v4 propio) */
  legacy: string[];
}

export const KELLY_GATES: KellyGate[] = [
  { id: 'nuevo',             n: 1,  label: 'Nuevo',              stages: ['aplico'], legacy: [] },
  { id: 'prefiltro',         n: 2,  label: 'Prefiltro',          stages: ['prefiltro_enviado', 'prefiltro_pasado', 'prefiltro_revision'], legacy: [] },
  { id: 'bateria_ts',        n: 3,  label: 'Batería TS',         stages: ['pruebas'], legacy: [] },
  { id: 'assessment',        n: 4,  label: 'Assessment',         stages: ['prueba_tecnica'], legacy: [] },
  { id: 'entrevista_sel',    n: 5,  label: 'Entrevista Sel.',    stages: ['recruiter_interview'], legacy: [] },
  { id: 'psicometricas',     n: 6,  label: 'Psicométricas',      stages: [], legacy: ['bateria_psicometrica', 'solicitud_enviada_mary'] },
  { id: 'terna',             n: 7,  label: 'Terna',              stages: ['terna'], legacy: [] },
  { id: 'entrevista_hm',     n: 8,  label: 'Entrevista HM',      stages: [], legacy: ['hiring_lead_interview'] },
  { id: 'medicos_seguridad', n: 9,  label: 'Médicos/Seguridad',  stages: ['examenes_medicos', 'estudio_seguridad'], legacy: [] },
  { id: 'oferta',            n: 10, label: 'Oferta',             stages: ['oferta'], legacy: [] },
  { id: 'docs',              n: 11, label: 'Docs',               stages: ['documentacion_ingreso'], legacy: [] },
  { id: 'onboarding',        n: 12, label: 'Onboarding',         stages: ['contratado'], legacy: [] },
];

const GATE_BY_RAW: Record<string, KellyGate> = Object.fromEntries(
  KELLY_GATES.flatMap((g) => [...g.stages, ...g.legacy].map((code) => [code, g])),
);

/**
 * Gate de Kelly para cualquier code (v4 o histórico).
 * Primero mira el code crudo —así `hiring_lead_interview` cae en Entrevista HM
 * y no en Terna— y después el normalizado. Rechazado y codes desconocidos → null.
 */
export function kellyGateFromStage(code: string | null | undefined): KellyGate | null {
  if (!code) return GATE_BY_RAW['aplico'];
  return GATE_BY_RAW[code] ?? GATE_BY_RAW[normalizeStage(code)] ?? null;
}
