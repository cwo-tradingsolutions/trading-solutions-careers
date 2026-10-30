import { supabaseAdmin } from "@/lib/supabase";
import {
  buildDashboard,
  buildDrill,
  exampleInput,
  filtersFromParams,
  type DashFilters,
  type DashboardInput,
  type DashboardPayload,
} from "./metrics";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

type PageResult = { data: unknown[] | null; error: { message: string } | null };

async function pages(make: (from: number, to: number) => PromiseLike<PageResult>): Promise<Record<string, unknown>[]> {
  const size = 1000;
  const all: Record<string, unknown>[] = [];
  // `make` tiene que ordenar por una clave total (created_at, luego id; o id).
  // Sin eso el offset repite o salta filas cuando hay más de `size`.
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
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
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
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    candRows = candRows.map((r) => ({ ...r, source: null }));
  }

  const vacancies = await pages((from, to) =>
    supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, area, country, status, owner_recruiter_id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

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
        .order("id", { ascending: true })
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

  return {
    filters,
    now: new Date().toISOString(),
    agingTargetDays,
    recruiters,
    vacancies: vacancies.map((v) => ({
      id: String(v.id),
      title: String(v.title ?? "Sin título"),
      area: str(v.area),
      country: str(v.country),
      status: str(v.status),
      owner_recruiter_id: str(v.owner_recruiter_id),
    })),
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
