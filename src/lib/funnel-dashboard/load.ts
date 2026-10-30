import { supabaseAdmin } from "@/lib/supabase";
import { VACANCY_MAP } from "@/lib/vacancy-map";
import {
  buildDashboard,
  buildDrill,
  exampleInput,
  filtersFromParams,
  type DashFilters,
  type DashboardInput,
  type DashboardPayload,
  type SalaryCurrency,
} from "./metrics";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

type PageResult = { data: unknown[] | null; error: { message: string } | null };

async function pages(make: (from: number, to: number) => PromiseLike<PageResult>): Promise<Record<string, unknown>[]> {
  const size = 1000;
  const all: Record<string, unknown>[] = [];
  for (let i = 0; i < 40; i++) {
    const { data, error } = await make(i * size, i * size + size - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < size) break;
  }
  return all;
}

export async function loadDashboardInput(clientId: string, filters: DashFilters): Promise<DashboardInput> {
  let candRows: Record<string, unknown>[];
  try {
    candRows = await pages((from, to) =>
      supabaseAdmin
        .from("ht_candidates")
        .select("id, name, vacancy_id, stage, source, created_at, status")
        .eq("client_id", clientId)
        .range(from, to),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/source/i.test(message)) throw err;
    candRows = await pages((from, to) =>
      supabaseAdmin
        .from("ht_candidates")
        .select("id, name, vacancy_id, stage, created_at, status")
        .eq("client_id", clientId)
        .range(from, to),
    );
    candRows = candRows.map((r) => ({ ...r, source: null }));
  }

  const vacancies = await loadVacancyRows(clientId);

  const vacIds = vacancies.map((v) => String(v.id));
  const candIds = candRows.map((c) => String(c.id));

  const milestones: Record<string, unknown>[] = [];
  for (let i = 0; i < vacIds.length; i += 150) {
    const slice = vacIds.slice(i, i + 150);
    if (slice.length === 0) continue;
    const rows = await pages((from, to) =>
      supabaseAdmin
        .from("ht_vacancy_milestones")
        .select("vacancy_id, hr_request_date, hire_date")
        .in("vacancy_id", slice)
        .range(from, to),
    );
    milestones.push(...rows);
  }

  const events: Record<string, unknown>[] = [];
  for (let i = 0; i < candIds.length; i += 150) {
    const slice = candIds.slice(i, i + 150);
    if (slice.length === 0) continue;
    const rows = await pages((from, to) =>
      supabaseAdmin
        .from("ht_candidate_stage_events")
        .select("candidate_id, to_stage, changed_at, source")
        .in("candidate_id", slice)
        .range(from, to),
    );
    events.push(...rows);
  }

  let recruiters: { id: string; nombre: string }[] = [];
  try {
    const rows = await pages((from, to) =>
      supabaseAdmin.from("ts_recruiters").select("id, nombre").range(from, to),
    );
    recruiters = rows.map((r) => ({ id: String(r.id), nombre: String(r.nombre ?? "Sin nombre") }));
  } catch {
    recruiters = [];
  }

  let agingTargetDays: number | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from("ts_dashboard_config")
      .select("pipeline_aging_days")
      .eq("id", 1)
      .maybeSingle();
    if (!error && data && typeof data.pipeline_aging_days === "number") {
      agingTargetDays = data.pipeline_aging_days;
    }
  } catch {
    agingTargetDays = null;
  }

  const str = (v: unknown) => (v == null ? null : String(v));
  const salaries = await loadSalaries(clientId, vacancies);

  return {
    filters,
    now: new Date().toISOString(),
    agingTargetDays,
    recruiters,
    vacancies: vacancies.map((v) => {
      const pay = salaries.map.get(String(v.id));
      return {
        id: String(v.id),
        title: String(v.title ?? "Sin título"),
        area: str(v.area),
        country: str(v.country),
        status: str(v.status),
        owner_recruiter_id: str(v.owner_recruiter_id),
        salary_cap_amount: pay?.amount ?? null,
        salary_cap_currency: pay?.currency ?? null,
        salary_texts: pay?.texts ?? [],
      };
    }),
    salarySourceErrors: salaries.errors,
    milestones: milestones.map((m) => ({
      vacancy_id: String(m.vacancy_id),
      hr_request_date: str(m.hr_request_date),
      hire_date: str(m.hire_date),
    })),
    candidates: candRows.map((c) => ({
      id: String(c.id),
      name: String(c.name ?? "Sin nombre"),
      vacancy_id: String(c.vacancy_id ?? ""),
      stage: str(c.stage),
      source: str(c.source),
      created_at: String(c.created_at ?? new Date(0).toISOString()),
      rejected: c.status === "rejected" || c.stage === "rechazado" || c.stage === "prefiltro_rechazado",
    })),
    events: events.map((e) => ({
      candidate_id: String(e.candidate_id),
      to_stage: String(e.to_stage ?? ""),
      changed_at: String(e.changed_at),
      source: str(e.source),
    })),
  };
}

async function loadVacancyRows(clientId: string): Promise<Record<string, unknown>[]> {
  // ht_vacancies no tiene closed_at. No se pide ni se inventa.
  const attempts = [
    "id, title, area, country, status, owner_recruiter_id, requisition_id",
    "id, title, area, country, status, owner_recruiter_id",
  ];
  let last: unknown;
  for (const cols of attempts) {
    try {
      return await pages((from, to) =>
        supabaseAdmin.from("ht_vacancies").select(cols).eq("client_id", clientId).range(from, to),
      );
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("No se pudieron leer las vacantes");
}

function positiveAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Salario de la vacante, en este orden, sin columnas nuevas:
 * 1. ht_requisitions.salary_cap_cop (tope interno, COP), por requisition_id o vacancy_id
 * 2. punto medio de salary_public y, si hay DATABASE_URL, de vacancies.salary_range
 *    (Neon, vía VACANCY_MAP), solo con dos extremos y moneda COP o USD
 * 3. sin dato
 *
 * PREFILTER_SALARY_CAPS_COP queda fuera: es el umbral del prefiltro contra
 * la aspiración del candidato, no el salario de la vacante. Puede volver
 * solo etiquetado «umbral prefiltro», después de que Justina lo valide.
 */
async function loadSalaries(
  clientId: string,
  vacancies: Record<string, unknown>[],
): Promise<{ map: Map<string, { amount: number | null; currency: SalaryCurrency | null; texts: string[] }>; errors: string[] }> {
  const out = new Map<string, { amount: number | null; currency: SalaryCurrency | null; texts: string[] }>();
  const errors: string[] = [];
  let reqs: Record<string, unknown>[] = [];
  try {
    reqs = await pages((from, to) =>
      supabaseAdmin
        .from("ht_requisitions")
        .select("id, vacancy_id, salary_cap_cop, salary_public")
        .eq("client_id", clientId)
        .range(from, to),
    );
  } catch {
    errors.push("Error al cargar fuente ht_requisitions");
    reqs = [];
  }
  const byReq = new Map<string, { amount: number | null; text: string | null }>();
  const byVac = new Map<string, { amount: number | null; text: string | null }>();
  for (const row of reqs) {
    const pack = {
      amount: positiveAmount(row.salary_cap_cop),
      text: row.salary_public ? String(row.salary_public) : null,
    };
    byReq.set(String(row.id), pack);
    if (row.vacancy_id) byVac.set(String(row.vacancy_id), pack);
  }

  const jobs = await loadJobSalaryRanges(vacancies.map((v) => String(v.id)));
  if (jobs.error) errors.push(jobs.error);
  for (const v of vacancies) {
    const id = String(v.id);
    const linked =
      (v.requisition_id ? byReq.get(String(v.requisition_id)) : undefined) || byVac.get(id) || null;
    const cap = linked?.amount ?? null;
    const texts = [linked?.text, jobs.map.get(id)].filter((t): t is string => Boolean(t));
    out.set(id, { amount: cap, currency: cap ? "COP" : null, texts });
  }
  return { map: out, errors };
}

async function loadJobSalaryRanges(
  vacancyIds: string[],
): Promise<{ map: Map<string, string>; error: string | null }> {
  const out = new Map<string, string>();
  const pairs = Object.entries(VACANCY_MAP)
    .map(([jobId, vacancyId]) => ({ jobId: Number(jobId), vacancyId }))
    .filter((p) => vacancyIds.includes(p.vacancyId) && Number.isFinite(p.jobId));
  if (pairs.length === 0 || !process.env.DATABASE_URL) return { map: out, error: null };
  try {
    const { neon } = await import("@/lib/sql");
    const sql = neon(process.env.DATABASE_URL);
    const ids = pairs.map((p) => p.jobId);
    const marks = ids.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await sql(`SELECT id, salary_range FROM vacancies WHERE id IN (${marks})`, ids);
    const byJob = new Map<number, string>();
    for (const row of rows as { id: unknown; salary_range: unknown }[]) {
      if (row.salary_range) byJob.set(Number(row.id), String(row.salary_range));
    }
    for (const pair of pairs) {
      const text = byJob.get(pair.jobId);
      if (text) out.set(pair.vacancyId, text);
    }
  } catch {
    return { map: out, error: "Error al cargar fuente vacancies.salary_range" };
  }
  return { map: out, error: null };
}

export async function dashboardResponse(url: URL): Promise<DashboardPayload> {
  const filters = filtersFromParams(url.searchParams);
  if (url.searchParams.get("example") === "1") {
    const sample = exampleInput();
    return buildDashboard({ ...sample, filters });
  }
  const clientId = url.searchParams.get("client_id") || TS_CLIENT_ID;
  const input = await loadDashboardInput(clientId, filters);
  return buildDashboard(input);
}

export async function drillResponse(url: URL) {
  const vacancyId = url.searchParams.get("vacancy");
  if (!vacancyId) return { error: "vacancy es requerido" as const };
  const filters = { ...filtersFromParams(url.searchParams), vacancyId: null };
  if (url.searchParams.get("example") === "1") {
    const sample = exampleInput();
    return { example: true, ...buildDrill({ ...sample, filters }, vacancyId) };
  }
  const clientId = url.searchParams.get("client_id") || TS_CLIENT_ID;
  const input = await loadDashboardInput(clientId, filters);
  return { example: false, ...buildDrill(input, vacancyId) };
}
