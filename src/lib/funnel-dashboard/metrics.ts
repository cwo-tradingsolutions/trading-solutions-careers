/**
 * Métricas del dashboard del Funnel. Puras: la ruta lee las tablas y esto
 * calcula. Las fórmulas son las del SPEC de People Analytics (29-oct-2026);
 * el orden de los gates sale de KELLY_GATES, no de una lista copiada.
 *
 * Gates 6 y 8 no tienen StageCode propio: se muestran y se saltan en la
 * conversión (el paso es 5→7 y 7→9). El % fuera de SLA mira solo el código
 * en el que el candidato está ahora, contra STAGE_SLA_DAYS de ese código.
 * Prefiltro y Médicos/Seguridad no suman sus SLA. Un incumplimiento viejo,
 * ya saldado, no entra al porcentaje.
 * Offer accept = llegó a gate ≥10 y a gate 12. Docs va después de Oferta
 * y no cambia esa cuenta.
 */

import {
  KELLY_GATES,
  STAGES,
  kellyGateFromStage,
  normalizeStage,
  stageDef,
  stageLabel,
  stageSla,
  type KellyGate,
} from "../stage-labels";

export const MIN_N = 5;
export const SIN_CANAL = "Sin canal";
export const SIN_PAIS = "Sin país";
export const SIN_AREA = "Sin área";
export const SIN_RECRUITER = "Sin recruiter";
export const SIN_HITO = "sin hito";
export const SIN_CODIGO = "sin código aún";
export const MUESTRA = "Muestra insuficiente";

const DIA = 86_400_000;

export type DashFilters = {
  vacancyId: string | null;
  area: string | null;
  country: string | null;
  recruiterId: string | null;
  source: string | null;
  from: string | null;
  to: string | null;
  /** Gate de Kelly, o "rechazado". No se aplica al embudo ni a los KPI de cohorte. */
  stageGateId: string | null;
};

export type DashCandidate = {
  id: string;
  name: string;
  vacancy_id: string;
  stage: string | null;
  source: string | null;
  created_at: string;
  rejected: boolean;
};

export type DashEvent = {
  candidate_id: string;
  to_stage: string;
  changed_at: string;
  source: string | null;
};

export type DashVacancy = {
  id: string;
  title: string;
  area: string | null;
  country: string | null;
  status: string | null;
  owner_recruiter_id: string | null;
};

export type DashMilestone = {
  vacancy_id: string;
  hr_request_date: string | null;
  hire_date: string | null;
};

export type DashRecruiter = { id: string; nombre: string };

export type DashboardInput = {
  candidates: DashCandidate[];
  events: DashEvent[];
  vacancies: DashVacancy[];
  milestones: DashMilestone[];
  recruiters: DashRecruiter[];
  /** pipeline_aging_days de ts_dashboard_config. null si la fila no existe. */
  agingTargetDays: number | null;
  filters: DashFilters;
  now: string;
  example?: boolean;
};

export type Metric = {
  value: number | null;
  n: number;
  insufficient: boolean;
  delta: number | null;
};

export type FunnelRow = {
  gateId: string;
  n: number;
  label: string;
  reached: number;
  direct: number;
  sinCodigo: boolean;
  empty: boolean;
  conversionToNext: {
    toN: number;
    toLabel: string;
    num: number;
    den: number;
    rate: number | null;
    insufficient: boolean;
  } | null;
};

export type SlaBar = {
  gateId: string;
  n: number;
  label: string;
  avgDays: number | null;
  maxDays: number | null;
  over: number;
  evaluable: number;
  approx: number;
  /** Un solo número solo cuando el gate tiene un código. Nunca la suma. */
  sla: number | null;
  codes: { id: string; label: string; sla: number }[];
  sinCodigo: boolean;
  insufficient: boolean;
  status: "ok" | "warning" | "serious" | "critical" | null;
};

export type ChannelRow = {
  source: string;
  applicants: number;
  terna: number;
  hired: number;
  notTerna: number;
  ternaNotHired: number;
  ternaPct: number | null;
  hiredPct: number | null;
  insufficient: boolean;
};

export type MonthPoint = {
  month: string;
  ttf: number | null;
  ttfN: number;
  tth: number | null;
  tthN: number;
};

export type VacancyRow = {
  id: string;
  title: string;
  area: string;
  country: string;
  owner: string;
  open: boolean;
  agingDays: number | null;
  agingLabel: string;
  semaforo: "ok" | "warning" | "serious" | "critical" | "sin_hito" | "sin_target" | "cerrada";
  target: number | null;
  bottleneck: string | null;
  candidates: number;
  overSla: number;
};

export type DrillRow = {
  id: string;
  name: string;
  stageLabel: string;
  days: number | null;
  sla: number | null;
  overSla: boolean;
  approx: boolean;
  source: string;
  lastEvent: string;
  href: string | null;
};

export type DashboardPayload = {
  example: boolean;
  asOf: string;
  kpis: {
    ttf: Metric;
    tth: Metric;
    sla: Metric & { over: number; approx: number };
    offer: Metric & { accepted: number; resolved: number; pending: number };
    open: Metric & {
      agingMedian: number | null;
      agingN: number;
      agingInsufficient: boolean;
      sinHito: number;
      target: number | null;
    };
    conversion: Metric & { num: number; den: number };
    quality90: { placeholder: true; note: string };
    cost: { placeholder: true; note: string };
  };
  funnel: FunnelRow[];
  slaBars: SlaBar[];
  channels: ChannelRow[];
  monthly: MonthPoint[];
  vacancies: VacancyRow[];
  quality: {
    candidates: number;
    withoutSource: number;
    withoutSourcePct: number | null;
    withoutHistory: number;
    withoutHistoryPct: number | null;
    vacancies: number;
    withoutMilestones: number;
  };
  options: {
    vacancies: { id: string; title: string }[];
    areas: string[];
    countries: string[];
    recruiters: { id: string; nombre: string }[];
    sources: string[];
    stages: { id: string; label: string }[];
  };
  gaps: string[];
};

export function emptyFilters(): DashFilters {
  return {
    vacancyId: null,
    area: null,
    country: null,
    recruiterId: null,
    source: null,
    from: null,
    to: null,
    stageGateId: null,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

export function canalDe(source: string | null | undefined): string {
  const s = (source ?? "").trim();
  return s.length ? s : SIN_CANAL;
}

export function paisDe(country: string | null | undefined): string {
  const s = (country ?? "").trim();
  return s.length ? s : SIN_PAIS;
}

export function areaDe(area: string | null | undefined): string {
  const s = (area ?? "").trim();
  return s.length ? s : SIN_AREA;
}

/** Días entre dos instantes. Negativo no se usa: el reloj no corre al revés. */
export function daySpan(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, ms / DIA);
}

export function inPeriod(iso: string, from: string | null, to: string | null): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  if (from) {
    const f = new Date(from).getTime();
    if (Number.isFinite(f) && t < f) return false;
  }
  if (to) {
    let end = new Date(to).getTime();
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end += DIA - 1;
    if (Number.isFinite(end) && t > end) return false;
  }
  return true;
}

export function gatesConCodigo(): KellyGate[] {
  return KELLY_GATES.filter((g) => g.stages.length > 0);
}

/** Pares de conversión. Los gates sin código propio no entran: 5→7 y 7→9. */
export function pasosConversion(): { from: KellyGate; to: KellyGate }[] {
  const coded = gatesConCodigo();
  const steps: { from: KellyGate; to: KellyGate }[] = [];
  for (let i = 0; i < coded.length - 1; i++) steps.push({ from: coded[i], to: coded[i + 1] });
  return steps;
}

export function maxGateIndex(codes: (string | null | undefined)[]): number {
  let max = 0;
  for (const code of codes) {
    if (!code) continue;
    if (normalizeStage(code) === "rechazado") continue;
    const g = kellyGateFromStage(code);
    if (g && g.n > max) max = g.n;
  }
  return max;
}

export function etiquetaEtapa(code: string | null | undefined): string {
  if (!code) return "Sin etapa";
  if (normalizeStage(code) === "rechazado") return "Rechazado";
  const g = kellyGateFromStage(code);
  if (g && g.stages.length === 0) return g.label;
  const def = stageDef(code);
  if (def) return def.label;
  if (g) return g.label;
  return "Etapa no reconocida";
}

/**
 * SLA que se puede dibujar como una línea. Un gate de varios códigos no
 * tiene un solo número: sumarlos castigaría de menos a quien se pasó en
 * un código corto.
 */
export function slaDeGate(gate: KellyGate): {
  sla: number | null;
  codes: { id: string; label: string; sla: number }[];
} {
  const codes = gate.stages.map((id) => {
    const def = STAGES.find((s) => s.id === id);
    return { id, label: def?.label ?? id, sla: def?.sla ?? 0 };
  });
  return { sla: codes.length === 1 ? codes[0].sla : null, codes };
}

export type CodeSpan = {
  code: string;
  label: string;
  days: number;
  sla: number | null;
  breached: boolean;
  approx: boolean;
};

/** Tiempo en cada código del gate. El backfill no entra al semáforo. */
export function spansEnGate(events: DashEvent[], gateId: string, asOf: string): CodeSpan[] {
  const gate = KELLY_GATES.find((g) => g.id === gateId);
  if (!gate) return [];
  const asOfMs = new Date(asOf).getTime();
  const sorted = events
    .filter((e) => e.to_stage && new Date(e.changed_at).getTime() <= asOfMs)
    .sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());

  const out: CodeSpan[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    const g = kellyGateFromStage(ev.to_stage);
    if (!g || g.id !== gateId) continue;
    if (normalizeStage(ev.to_stage) === "rechazado") continue;
    const end = sorted[i + 1]?.changed_at ?? asOf;
    const days = daySpan(ev.changed_at, end);
    const noCode = g.stages.length === 0;
    const sla = noCode ? null : stageSla(ev.to_stage);
    const approx = ev.source === "backfill";
    out.push({
      code: normalizeStage(ev.to_stage) || ev.to_stage,
      label: noCode ? g.label : (stageDef(ev.to_stage)?.label ?? g.label),
      days,
      sla,
      breached: !approx && sla != null && days > sla,
      approx,
    });
  }
  return out;
}

export type SlaActual = {
  /** Hay reloj fiable del código en el que está ahora. */
  evaluable: boolean;
  /** Backfill, o el último evento no es la etapa actual. Fuera del %. */
  approx: boolean;
  breached: boolean;
  days: number | null;
  sla: number | null;
};

/**
 * Fuera de SLA = días en el código ACTUAL > STAGE_SLA_DAYS de ese código.
 *
 * El último evento tiene que ser esa etapa. Si es backfill, o el historial
 * no cuadra con la etapa actual, queda aproximado y no entra al porcentaje.
 * Un incumplimiento ya saldado (otro código del mismo gate) no cuenta, y
 * los SLA de Prefiltro o Médicos/Seguridad no se suman.
 */
export function slaActual(events: DashEvent[], stage: string | null, asOf: string): SlaActual {
  const t = new Date(asOf).getTime();
  const evs = events
    .filter((e) => e.to_stage && new Date(e.changed_at).getTime() <= t)
    .sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
  const last = evs[evs.length - 1];
  const g = kellyGateFromStage(stage);
  if (!last || !g || g.stages.length === 0 || normalizeStage(last.to_stage) !== normalizeStage(stage)) {
    return { evaluable: false, approx: true, days: null, sla: null, breached: false };
  }
  const days = daySpan(last.changed_at, asOf);
  const sla = stageSla(stage);
  if (last.source === "backfill" || sla == null) {
    return { evaluable: false, approx: true, days, sla, breached: false };
  }
  return { evaluable: true, approx: false, days, sla, breached: days > sla };
}

export function fueraDeSlaEnGate(events: DashEvent[], stage: string, asOf: string): boolean {
  return slaActual(events, stage, asOf).breached;
}

export function offerAccept(
  rows: { events: DashEvent[]; rejected: boolean }[],
  period: { from: string | null; to: string | null },
): { accepted: number; resolved: number; pending: number; rate: number | null; n: number; insufficient: boolean } {
  let accepted = 0;
  let resolved = 0;
  let pending = 0;
  for (const row of rows) {
    const offerEvents = row.events.filter((e) => {
      const g = kellyGateFromStage(e.to_stage);
      return !!g && g.n >= 10 && normalizeStage(e.to_stage) !== "rechazado";
    });
    if (offerEvents.length === 0) continue;
    const first = offerEvents.reduce((a, b) =>
      new Date(a.changed_at).getTime() <= new Date(b.changed_at).getTime() ? a : b,
    );
    if (!inPeriod(first.changed_at, period.from, period.to)) continue;
    const hit12 = row.events.some((e) => kellyGateFromStage(e.to_stage)?.n === 12);
    const rejected =
      row.rejected || row.events.some((e) => normalizeStage(e.to_stage) === "rechazado");
    if (hit12) {
      accepted += 1;
      resolved += 1;
    } else if (rejected) {
      resolved += 1;
    } else {
      pending += 1;
    }
  }
  const rate = resolved > 0 ? (accepted / resolved) * 100 : null;
  const insufficient = resolved < MIN_N;
  return {
    accepted,
    resolved,
    pending,
    rate: insufficient ? null : rate,
    n: resolved,
    insufficient,
  };
}

function pack(value: number | null, n: number): { value: number | null; n: number; insufficient: boolean } {
  if (n < MIN_N) return { value: null, n, insufficient: true };
  return { value, n, insufficient: false };
}

function delta(curr: number | null, prev: number | null, currN: number, prevN: number): number | null {
  if (curr == null || prev == null || currN < MIN_N || prevN < MIN_N) return null;
  return curr - prev;
}

function previousFilters(f: DashFilters): DashFilters | null {
  if (!f.from || !f.to) return null;
  const start = new Date(f.from).getTime();
  let end = new Date(f.to).getTime();
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.to)) end += DIA - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const len = end - start;
  const prevEnd = start - 1;
  const prevStart = prevEnd - len;
  return { ...f, from: new Date(prevStart).toISOString(), to: new Date(prevEnd).toISOString() };
}

function gateActual(stage: string | null | undefined): { gate: KellyGate | null; rechazado: boolean } {
  if (!stage || normalizeStage(stage) === "rechazado") {
    return { gate: null, rechazado: normalizeStage(stage) === "rechazado" };
  }
  return { gate: kellyGateFromStage(stage), rechazado: false };
}

function matchesStage(stage: string | null | undefined, stageGateId: string | null): boolean {
  if (!stageGateId) return true;
  if (stageGateId === "rechazado") return normalizeStage(stage) === "rechazado";
  return gateActual(stage).gate?.id === stageGateId;
}

type Prepared = {
  eventsByCand: Map<string, DashEvent[]>;
  milestoneByVac: Map<string, DashMilestone>;
  recruiterName: Map<string, string>;
};

function prepare(input: DashboardInput): Prepared {
  const eventsByCand = new Map<string, DashEvent[]>();
  for (const e of input.events) {
    const arr = eventsByCand.get(e.candidate_id) ?? [];
    arr.push(e);
    eventsByCand.set(e.candidate_id, arr);
  }
  const milestoneByVac = new Map<string, DashMilestone>();
  for (const m of input.milestones) milestoneByVac.set(m.vacancy_id, m);
  const recruiterName = new Map(input.recruiters.map((r) => [r.id, r.nombre]));
  return { eventsByCand, milestoneByVac, recruiterName };
}

function vacancyOk(v: DashVacancy, f: DashFilters): boolean {
  if (f.vacancyId && v.id !== f.vacancyId) return false;
  if (f.area && areaDe(v.area) !== f.area) return false;
  if (f.country && paisDe(v.country) !== f.country) return false;
  if (f.recruiterId === SIN_RECRUITER && v.owner_recruiter_id) return false;
  if (f.recruiterId && f.recruiterId !== SIN_RECRUITER && v.owner_recruiter_id !== f.recruiterId) return false;
  return true;
}

type Core = Omit<DashboardPayload, "example" | "options" | "gaps"> & { _ttfPrev?: never };

function compute(input: DashboardInput, prep: Prepared, filters: DashFilters): Core {
  const asOf = input.now;
  const vacs = input.vacancies.filter((v) => vacancyOk(v, filters));
  const vacIds = new Set(vacs.map((v) => v.id));
  // Vacante + canal, sin recortar por fecha de aplicación. TTH y offer
  // filtran por la fecha del evento. Conversión, canal y calidad usan la cohorte.
  const scoped = input.candidates
    .filter((c) => vacIds.has(c.vacancy_id))
    .filter((c) => !filters.source || canalDe(c.source) === filters.source)
    .map((c) => {
      const evs = prep.eventsByCand.get(c.id) ?? [];
      return { c, evs, maxGate: maxGateIndex(evs.map((e) => e.to_stage)) };
    });
  const enriched = scoped.filter((r) => inPeriod(r.c.created_at, filters.from, filters.to));

  const ternaN = KELLY_GATES.find((g) => g.id === "terna")?.n ?? 7;

  // ── TTF: hire_date en el periodo, ambas fechas presentes ──
  const ttfValues: number[] = [];
  const ttfByMonth = new Map<string, number[]>();
  for (const v of vacs) {
    const m = prep.milestoneByVac.get(v.id);
    if (!m?.hr_request_date || !m.hire_date) continue;
    if (!inPeriod(m.hire_date, filters.from, filters.to)) continue;
    const days = daySpan(m.hr_request_date, m.hire_date);
    ttfValues.push(days);
    const month = m.hire_date.slice(0, 7);
    const arr = ttfByMonth.get(month) ?? [];
    arr.push(days);
    ttfByMonth.set(month, arr);
  }
  const ttfMed = median(ttfValues);
  const ttfPacked = pack(ttfMed, ttfValues.length);

  // ── TTH ──
  const tthValues: number[] = [];
  const tthByMonth = new Map<string, number[]>();
  for (const row of scoped) {
    const hires = row.evs.filter((e) => kellyGateFromStage(e.to_stage)?.id === "onboarding");
    if (hires.length === 0) continue;
    const first = hires.reduce((a, b) =>
      new Date(a.changed_at).getTime() <= new Date(b.changed_at).getTime() ? a : b,
    );
    if (!inPeriod(first.changed_at, filters.from, filters.to)) continue;
    const days = daySpan(row.c.created_at, first.changed_at);
    tthValues.push(days);
    const month = first.changed_at.slice(0, 7);
    const arr = tthByMonth.get(month) ?? [];
    arr.push(days);
    tthByMonth.set(month, arr);
  }
  const tthPacked = pack(median(tthValues), tthValues.length);

  // ── Conversión por gate (sin filtro de etapa) ──
  const steps = pasosConversion().map(({ from, to }) => {
    const den = enriched.filter((r) => r.maxGate >= from.n).length;
    const num = enriched.filter((r) => r.maxGate >= to.n).length;
    const rate = den > 0 ? (num / den) * 100 : null;
    const p = pack(rate, den);
    return {
      fromN: from.n,
      toN: to.n,
      toLabel: to.label,
      num,
      den,
      rate: p.value,
      insufficient: p.insufficient,
    };
  });
  const reached1 = enriched.filter((r) => r.maxGate >= 1).length;
  const reached12 = enriched.filter((r) => r.maxGate >= 12).length;
  const convRate = reached1 > 0 ? (reached12 / reached1) * 100 : null;
  const convPacked = pack(convRate, reached1);

  const directByGate = new Map<string, number>();
  for (const g of KELLY_GATES) directByGate.set(g.id, 0);
  for (const row of enriched) {
    const seen = new Set<string>();
    for (const e of row.evs) {
      const g = kellyGateFromStage(e.to_stage);
      if (!g || seen.has(g.id)) continue;
      if (normalizeStage(e.to_stage) === "rechazado") continue;
      seen.add(g.id);
      directByGate.set(g.id, (directByGate.get(g.id) ?? 0) + 1);
    }
  }

  const funnel: FunnelRow[] = KELLY_GATES.map((g) => {
    const sinCodigo = g.stages.length === 0;
    const reached = sinCodigo
      ? (directByGate.get(g.id) ?? 0)
      : enriched.filter((r) => r.maxGate >= g.n).length;
    const step = steps.find((s) => s.fromN === g.n) ?? null;
    return {
      gateId: g.id,
      n: g.n,
      label: g.label,
      reached,
      direct: directByGate.get(g.id) ?? 0,
      sinCodigo,
      empty: reached === 0,
      conversionToNext: step
        ? {
            toN: step.toN,
            toLabel: step.toLabel,
            num: step.num,
            den: step.den,
            rate: step.rate,
            insufficient: step.insufficient,
          }
        : null,
    };
  });

  // ── SLA: foto de quien sigue activo. El filtro de etapa sí aplica. ──
  const active = enriched.filter((r) => {
    const g = gateActual(r.c.stage);
    if (g.rechazado || g.gate?.id === "onboarding") return false;
    if (!matchesStage(r.c.stage, filters.stageGateId)) return false;
    return true;
  });

  let slaOver = 0;
  let slaEval = 0;
  let slaApprox = 0;
  const slaByGate = new Map<string, { days: number[]; over: number; eval: number; approx: number; people: number }>();
  for (const g of KELLY_GATES) {
    slaByGate.set(g.id, { days: [], over: 0, eval: 0, approx: 0, people: 0 });
  }

  for (const row of active) {
    const g = gateActual(row.c.stage).gate;
    if (!g) continue;
    const bucket = slaByGate.get(g.id);
    if (!bucket) continue;
    bucket.people += 1;
    const clock = slaActual(row.evs, row.c.stage, asOf);
    if (g.stages.length === 0 || !clock.evaluable) {
      bucket.approx += 1;
      slaApprox += 1;
      continue;
    }
    if (clock.days != null) bucket.days.push(clock.days);
    bucket.eval += 1;
    slaEval += 1;
    if (clock.breached) {
      bucket.over += 1;
      slaOver += 1;
    }
  }

  const slaRate = slaEval > 0 ? (slaOver / slaEval) * 100 : null;
  const slaPacked = pack(slaRate, slaEval);

  const slaBars: SlaBar[] = KELLY_GATES.filter((g) => g.id !== "onboarding").map((g) => {
    const b = slaByGate.get(g.id)!;
    const spec = slaDeGate(g);
    const avg = b.days.length ? b.days.reduce((s, n) => s + n, 0) / b.days.length : null;
    const max = b.days.length ? Math.max(...b.days) : null;
    const insufficient = b.eval < MIN_N;
    let status: SlaBar["status"] = null;
    if (!insufficient && avg != null && spec.sla != null) {
      if (avg >= spec.sla * 2) status = "critical";
      else if (avg > spec.sla) status = "serious";
      else if (avg >= spec.sla) status = "warning";
      else status = "ok";
    } else if (!insufficient && avg != null && spec.sla == null && b.eval > 0) {
      status = b.over > 0 ? "serious" : "ok";
    }
    return {
      gateId: g.id,
      n: g.n,
      label: g.label,
      avgDays: insufficient ? null : avg,
      maxDays: insufficient ? null : max,
      over: b.over,
      evaluable: b.eval,
      approx: b.approx,
      sla: spec.sla,
      codes: spec.codes,
      sinCodigo: g.stages.length === 0,
      insufficient,
      status,
    };
  });

  // ── Canal ──
  const channelMap = new Map<string, { applicants: number; terna: number; hired: number }>();
  for (const row of enriched) {
    const key = canalDe(row.c.source);
    const cur = channelMap.get(key) ?? { applicants: 0, terna: 0, hired: 0 };
    cur.applicants += 1;
    if (row.maxGate >= ternaN) cur.terna += 1;
    if (row.maxGate >= 12) cur.hired += 1;
    channelMap.set(key, cur);
  }
  const channels: ChannelRow[] = [...channelMap.entries()]
    .map(([source, v]) => {
      const insufficient = v.applicants < MIN_N;
      return {
        source,
        applicants: v.applicants,
        terna: v.terna,
        hired: v.hired,
        notTerna: v.applicants - v.terna,
        ternaNotHired: Math.max(0, v.terna - v.hired),
        ternaPct: insufficient ? null : (v.terna / v.applicants) * 100,
        hiredPct: insufficient ? null : (v.hired / v.applicants) * 100,
        insufficient,
      };
    })
    .sort((a, b) => b.applicants - a.applicants || a.source.localeCompare(b.source, "es"));

  // ── Offer ──
  const offer = offerAccept(
    scoped.map((r) => ({ events: r.evs, rejected: r.c.rejected })),
    { from: filters.from, to: filters.to },
  );

  // ── Abiertas + aging (foto, sin filtro de etapa ni de canal de la cohorte) ──
  const openVacs = vacs.filter((v) => v.status === "open");
  const agingDays: number[] = [];
  let sinHito = 0;
  for (const v of openVacs) {
    const m = prep.milestoneByVac.get(v.id);
    if (m?.hire_date) continue;
    if (!m?.hr_request_date) {
      sinHito += 1;
      continue;
    }
    agingDays.push(daySpan(m.hr_request_date, asOf));
  }
  const agingMed = median(agingDays);
  const agingPacked = pack(agingMed, agingDays.length);

  // ── Tabla. El filtro de etapa recorta candidatos, no la vacante. ──
  const vacancies: VacancyRow[] = vacs.map((v) => {
    const people = enriched.filter(
      (r) => r.c.vacancy_id === v.id && matchesStage(r.c.stage, filters.stageGateId),
    );
    const m = prep.milestoneByVac.get(v.id);
    const open = v.status === "open";
    let agingLabel = "—";
    let aging: number | null = null;
    let semaforo: VacancyRow["semaforo"] = open ? "sin_hito" : "cerrada";
    if (open && m?.hire_date) {
      agingLabel = "con hire_date";
      semaforo = "ok";
    } else if (open && m?.hr_request_date) {
      aging = daySpan(m.hr_request_date, asOf);
      agingLabel = `${Math.round(aging)} d`;
      const target = input.agingTargetDays;
      if (target == null) semaforo = "sin_target";
      else if (aging >= target * 2) semaforo = "critical";
      else if (aging > target) semaforo = "serious";
      else if (aging >= target) semaforo = "warning";
      else semaforo = "ok";
    } else if (open) {
      agingLabel = SIN_HITO;
      semaforo = "sin_hito";
    }
    const gateCounts = new Map<string, { n: number; over: number; label: string }>();
    let overSla = 0;
    for (const row of people) {
      const g = gateActual(row.c.stage);
      if (g.rechazado || !g.gate || g.gate.id === "onboarding") continue;
      const breached = slaActual(row.evs, row.c.stage, asOf).breached;
      if (breached) overSla += 1;
      const cur = gateCounts.get(g.gate.id) ?? { n: 0, over: 0, label: g.gate.label };
      cur.n += 1;
      if (breached) cur.over += 1;
      gateCounts.set(g.gate.id, cur);
    }
    const bottleneck = [...gateCounts.values()].sort((a, b) => b.over - a.over || b.n - a.n)[0];
    const owner = v.owner_recruiter_id
      ? prep.recruiterName.get(v.owner_recruiter_id) ?? "Sin nombre"
      : SIN_RECRUITER;
    return {
      id: v.id,
      title: v.title,
      area: areaDe(v.area),
      country: paisDe(v.country),
      owner,
      open,
      agingDays: aging,
      agingLabel,
      semaforo,
      target: input.agingTargetDays,
      bottleneck: bottleneck && bottleneck.n > 0 ? bottleneck.label : null,
      candidates: people.length,
      overSla,
    };
  });
  vacancies.sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (a.agingDays == null && b.agingDays == null) return a.title.localeCompare(b.title, "es");
    if (a.agingDays == null) return 1;
    if (b.agingDays == null) return -1;
    return b.agingDays - a.agingDays;
  });

  // ── Calidad (cohorte filtrada, sin recorte de etapa) ──
  const withoutSource = enriched.filter((r) => canalDe(r.c.source) === SIN_CANAL).length;
  const withoutHistory = enriched.filter((r) => r.evs.length === 0).length;
  const vacsWithoutMs = vacs.filter((v) => !prep.milestoneByVac.has(v.id)).length;

  const months = new Set<string>([...ttfByMonth.keys(), ...tthByMonth.keys()]);
  const monthly: MonthPoint[] = [...months].sort().map((month) => {
    const ttf = ttfByMonth.get(month) ?? [];
    const tth = tthByMonth.get(month) ?? [];
    return {
      month,
      ttfN: ttf.length,
      tthN: tth.length,
      ttf: ttf.length >= MIN_N ? median(ttf) : null,
      tth: tth.length >= MIN_N ? median(tth) : null,
    };
  });

  return {
    asOf,
    kpis: {
      ttf: { ...ttfPacked, delta: null },
      tth: { ...tthPacked, delta: null },
      sla: { ...slaPacked, delta: null, over: slaOver, approx: slaApprox },
      offer: {
        value: offer.rate,
        n: offer.n,
        insufficient: offer.insufficient,
        delta: null,
        accepted: offer.accepted,
        resolved: offer.resolved,
        pending: offer.pending,
      },
      open: {
        value: openVacs.length,
        n: openVacs.length,
        insufficient: false,
        delta: null,
        agingMedian: agingPacked.value,
        agingN: agingDays.length,
        agingInsufficient: agingPacked.insufficient,
        sinHito,
        target: input.agingTargetDays,
      },
      conversion: {
        value: convPacked.value,
        n: reached1,
        insufficient: convPacked.insufficient,
        delta: null,
        num: reached12,
        den: reached1,
      },
      quality90: {
        placeholder: true,
        note: "Próximamente. Cohorte de contratados contra tenure y evaluación en Buk (WLLN-3.4). No se calcula en el ATS.",
      },
      cost: {
        placeholder: true,
        note: "Próximamente. No hay campo de monto por vacante (3.1 / 3.2).",
      },
    },
    funnel,
    slaBars,
    channels,
    monthly,
    vacancies,
    quality: {
      candidates: enriched.length,
      withoutSource,
      withoutSourcePct: enriched.length >= MIN_N ? (withoutSource / enriched.length) * 100 : null,
      withoutHistory,
      withoutHistoryPct: enriched.length >= MIN_N ? (withoutHistory / enriched.length) * 100 : null,
      vacancies: vacs.length,
      withoutMilestones: vacsWithoutMs,
    },
  };
}

const GAPS = [
  "Calidad @90d vive en Buk: no hay puente ATS↔Buk.",
  "Costo por vacante: el ATS no tiene campo de monto.",
  "Gates 6 Psicométricas y 8 Entrevista HM no tienen código de escritura. Se muestran con «sin código aún» y no entran a la conversión.",
  "No existe tabla de ofertas: la aceptación sale de los eventos de etapa (gate ≥10 y gate 12).",
  "Eventos source=backfill no entran al SLA: la fecha es reconstruida.",
  "TTF necesita hr_request_date y hire_date. Sin hito, la vacante abierta dice «sin hito», no 0.",
  "País y canal vacíos se muestran como Sin país y Sin canal.",
];

export function buildDashboard(input: DashboardInput): DashboardPayload {
  const prep = prepare(input);
  const curr = compute(input, prep, input.filters);
  const prevF = previousFilters(input.filters);
  const prev = prevF ? compute(input, prep, prevF) : null;
  if (prev) {
    curr.kpis.ttf.delta = delta(curr.kpis.ttf.value, prev.kpis.ttf.value, curr.kpis.ttf.n, prev.kpis.ttf.n);
    curr.kpis.tth.delta = delta(curr.kpis.tth.value, prev.kpis.tth.value, curr.kpis.tth.n, prev.kpis.tth.n);
    curr.kpis.sla.delta = delta(curr.kpis.sla.value, prev.kpis.sla.value, curr.kpis.sla.n, prev.kpis.sla.n);
    curr.kpis.offer.delta = delta(curr.kpis.offer.value, prev.kpis.offer.value, curr.kpis.offer.n, prev.kpis.offer.n);
    curr.kpis.conversion.delta = delta(
      curr.kpis.conversion.value,
      prev.kpis.conversion.value,
      curr.kpis.conversion.n,
      prev.kpis.conversion.n,
    );
  }

  const options = {
    vacancies: [...input.vacancies]
      .sort((a, b) => a.title.localeCompare(b.title, "es"))
      .map((v) => ({ id: v.id, title: v.title })),
    areas: unique(input.vacancies.map((v) => areaDe(v.area))),
    countries: unique(input.vacancies.map((v) => paisDe(v.country))),
    recruiters: [
      ...input.recruiters.map((r) => ({ id: r.id, nombre: r.nombre })),
      { id: SIN_RECRUITER, nombre: SIN_RECRUITER },
    ],
    sources: unique(input.candidates.map((c) => canalDe(c.source))),
    stages: [
      ...KELLY_GATES.map((g) => ({ id: g.id, label: g.label })),
      { id: "rechazado", label: "Rechazado" },
    ],
  };

  return { ...curr, example: !!input.example, options, gaps: GAPS };
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "es"));
}

export function buildDrill(input: DashboardInput, vacancyId: string): { vacancy: VacancyRow | null; rows: DrillRow[] } {
  const board = buildDashboard({ ...input, filters: { ...input.filters, vacancyId } });
  const vacancy = board.vacancies.find((v) => v.id === vacancyId) ?? null;
  const prep = prepare(input);
  const rows: DrillRow[] = [];
  for (const c of input.candidates) {
    if (c.vacancy_id !== vacancyId) continue;
    if (input.filters.source && canalDe(c.source) !== input.filters.source) continue;
    if (!inPeriod(c.created_at, input.filters.from, input.filters.to)) continue;
    if (!matchesStage(c.stage, input.filters.stageGateId)) continue;
    const g = gateActual(c.stage);
    if (g.rechazado || !g.gate || g.gate.id === "onboarding") continue;
    const evs = prep.eventsByCand.get(c.id) ?? [];
    const noCode = g.gate.stages.length === 0;
    const clock = slaActual(evs, c.stage, input.now);
    if (noCode || !clock.breached) continue;
    const last = [...evs].sort(
      (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
    )[0];
    const when = last ? last.changed_at.slice(0, 10) : "sin evento";
    const lastLabel = last ? etiquetaEtapa(last.to_stage) : "Sin historial";
    const backfill = last?.source === "backfill";
    rows.push({
      id: c.id,
      name: c.name,
      stageLabel: etiquetaEtapa(c.stage),
      days: clock.days == null ? null : Math.round(clock.days * 10) / 10,
      sla: noCode ? null : stageSla(c.stage),
      overSla: true,
      approx: backfill || clock.approx,
      source: canalDe(c.source),
      lastEvent: `${lastLabel} · ${when}${backfill ? " · backfill" : ""}`,
      href: input.example ? null : `/hr-admin/report/${c.id}`,
    });
  }
  rows.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
  return { vacancy, rows };
}

/** Fixture fijo para el preview etiquetado y para revisar la forma del tablero. */
export function exampleInput(): DashboardInput {
  const now = "2026-10-29T12:00:00.000Z";
  const day = (offset: number) => new Date(new Date(now).getTime() + offset * DIA).toISOString();
  const recruiters: DashRecruiter[] = [{ id: "rec-1", nombre: "Kelly Castañeda" }];
  const vacancies: DashVacancy[] = [
    { id: "v1", title: "Analista de datos", area: "Datos", country: "Colombia", status: "closed", owner_recruiter_id: "rec-1" },
    { id: "v2", title: "Ejecutivo comercial", area: "Comercial", country: "Colombia", status: "closed", owner_recruiter_id: "rec-1" },
    { id: "v3", title: "Full stack", area: "Tecnología", country: "México", status: "closed", owner_recruiter_id: "rec-1" },
    { id: "v4", title: "People partner", area: "Talento", country: null, status: "closed", owner_recruiter_id: "rec-1" },
    { id: "v5", title: "Controller", area: "Finanzas", country: "Colombia", status: "closed", owner_recruiter_id: null },
    { id: "v6", title: "CSM Andino", area: "Cliente", country: "Perú", status: "closed", owner_recruiter_id: "rec-1" },
    { id: "v7", title: "SDR Norte", area: "Comercial", country: "México", status: "open", owner_recruiter_id: "rec-1" },
    { id: "v8", title: "Analista SIG", area: "Operaciones", country: null, status: "open", owner_recruiter_id: "rec-1" },
    { id: "v9", title: "Backend", area: "Tecnología", country: "Colombia", status: "open", owner_recruiter_id: null },
    { id: "v10", title: "Finance analyst", area: "Finanzas", country: "Colombia", status: "open", owner_recruiter_id: "rec-1" },
    { id: "v11", title: "Diseñador", area: "Producto", country: "Colombia", status: "open", owner_recruiter_id: "rec-1" },
    { id: "v12", title: "Legal counsel", area: "Legal", country: null, status: "open", owner_recruiter_id: "rec-1" },
  ];
  const ttfDays = [20, 22, 24, 30, 40, 48];
  const milestones: DashMilestone[] = ttfDays.map((d, i) => ({
    vacancy_id: `v${i + 1}`,
    hr_request_date: day(-80 - d),
    hire_date: day(-80),
  }));
  milestones.push(
    { vacancy_id: "v7", hr_request_date: day(-10), hire_date: null },
    { vacancy_id: "v8", hr_request_date: day(-30), hire_date: null },
    { vacancy_id: "v9", hr_request_date: day(-40), hire_date: null },
    { vacancy_id: "v10", hr_request_date: day(-50), hire_date: null },
  );

  const candidates: DashCandidate[] = [];
  const events: DashEvent[] = [];
  const add = (
    id: string,
    name: string,
    vacancy: string,
    stage: string,
    source: string | null,
    createdOffset: number,
    trail: { stage: string; offset: number; source?: string }[],
    rejected = false,
  ) => {
    candidates.push({
      id,
      name,
      vacancy_id: vacancy,
      stage,
      source,
      created_at: day(createdOffset),
      rejected,
    });
    for (const step of trail) {
      events.push({
        candidate_id: id,
        to_stage: step.stage,
        changed_at: day(step.offset),
        source: step.source ?? "ui",
      });
    }
  };

  const tth = [10, 12, 14, 18, 21, 30];
  const hireAt = -80;
  for (let i = 0; i < 6; i++) {
    const created = hireAt - tth[i];
    add(`h${i}`, `Ejemplo contratado ${i + 1}`, `v${i + 1}`, "contratado", i < 4 ? null : "LinkedIn", created, [
      { stage: "aplico", offset: created },
      { stage: "oferta", offset: hireAt - 3 },
      { stage: "contratado", offset: hireAt },
    ]);
  }
  add("r1", "Ejemplo rechazado oferta 1", "v7", "rechazado", "Referido", -40, [
    { stage: "aplico", offset: -40 },
    { stage: "oferta", offset: -20 },
    { stage: "rechazado", offset: -18 },
  ], true);
  add("r2", "Ejemplo rechazado oferta 2", "v8", "rechazado", null, -35, [
    { stage: "aplico", offset: -35 },
    { stage: "oferta", offset: -15 },
    { stage: "rechazado", offset: -14 },
  ], true);

  // Activos fuera de SLA en prefiltro (6 días > SLA 5). No suman 5+2+2.
  for (let i = 0; i < 3; i++) {
    add(`p${i}`, `Ejemplo prefiltro ${i + 1}`, "v7", "prefiltro_enviado", null, -20, [
      { stage: "aplico", offset: -20 },
      { stage: "prefiltro_enviado", offset: -6 },
    ]);
  }
  add("b1", "Ejemplo batería 1", "v8", "pruebas", "LinkedIn", -15, [
    { stage: "aplico", offset: -15 },
    { stage: "pruebas", offset: -2 },
  ]);
  add("b2", "Ejemplo batería 2", "v8", "pruebas", "LinkedIn", -14, [
    { stage: "aplico", offset: -14 },
    { stage: "pruebas", offset: -2 },
  ]);
  add("e1", "Ejemplo entrevista 1", "v9", "recruiter_interview", null, -12, [
    { stage: "aplico", offset: -12 },
    { stage: "recruiter_interview", offset: -1 },
  ]);
  add("e2", "Ejemplo entrevista 2", "v9", "recruiter_interview", "Referido", -11, [
    { stage: "aplico", offset: -11 },
    { stage: "recruiter_interview", offset: -1 },
  ]);
  add("t1", "Ejemplo terna", "v10", "terna", null, -9, [
    { stage: "aplico", offset: -9 },
    { stage: "terna", offset: -2 },
  ]);
  for (let i = 0; i < 8; i++) {
    add(`a${i}`, `Ejemplo aplicó ${i + 1}`, i < 4 ? "v11" : "v12", "aplico", i < 5 ? null : "LinkedIn", -3, [
      { stage: "aplico", offset: -1 },
    ]);
  }
  // Sin historial: entra a calidad, no al embudo.
  candidates.push({
    id: "nh1",
    name: "Ejemplo sin historial",
    vacancy_id: "v12",
    stage: "aplico",
    source: null,
    created_at: day(-4),
    rejected: false,
  });

  return {
    candidates,
    events,
    vacancies,
    milestones,
    recruiters,
    agingTargetDays: 21,
    filters: emptyFilters(),
    now,
    example: true,
  };
}

export function filtersFromParams(sp: URLSearchParams): DashFilters {
  const pick = (k: string) => {
    const v = sp.get(k);
    return v && v !== "all" ? v : null;
  };
  return {
    vacancyId: pick("vacancy"),
    area: pick("area"),
    country: pick("country"),
    recruiterId: pick("recruiter"),
    source: pick("source"),
    from: pick("from"),
    to: pick("to"),
    stageGateId: pick("stage"),
  };
}

/** Evita imprimir un code crudo si alguien arma un texto con stageLabel a ciegas. */
export function labelSeguro(code: string | null | undefined): string {
  const label = etiquetaEtapa(code);
  if (label === "Etapa no reconocida") return label;
  if (code && label === code) return stageLabel(code) === code ? "Etapa no reconocida" : stageLabel(code);
  return label;
}
