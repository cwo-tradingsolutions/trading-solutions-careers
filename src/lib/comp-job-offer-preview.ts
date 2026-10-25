/**
 * Preview de Comp cuando Samuel mueve un candidato a la etapa existente `oferta`.
 *
 * No crea etapas, no mueve la etapa y no envía la carta. Si el flag está
 * apagado, falta el URL o el deploy es producción, se registra y se omite.
 *
 * Env:
 *   COMP_JOB_OFFER_WEBHOOK_URL       URL del stub de Comp (preview).
 *   COMP_JOB_OFFER_PREVIEW_ENABLED   tiene que ser "true" para llamar.
 * Producción (`VERCEL_ENV=production`) no llama aunque el flag esté prendido.
 *
 * Fuera del payload a propósito: salario propuesto, aspiración, tope,
 * empleador, ESC2 y EC. Comp llena salario y empleador.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeStage } from "@/lib/stage-labels";

export const COMP_JOB_OFFER_WEBHOOK_URL_ENV = "COMP_JOB_OFFER_WEBHOOK_URL";
export const COMP_JOB_OFFER_PREVIEW_ENABLED_ENV = "COMP_JOB_OFFER_PREVIEW_ENABLED";

export interface CompPreviewEnv {
  VERCEL_ENV?: string;
  COMP_JOB_OFFER_PREVIEW_ENABLED?: string;
  COMP_JOB_OFFER_WEBHOOK_URL?: string;
}

/** Etapas de selección / contratación desde las que el avance a oferta es esperable. */
const HIRING_FROM_STAGES = new Set([
  "pruebas",
  "recruiter_interview",
  "prueba_tecnica",
  "terna",
  "examenes_medicos",
  "estudio_seguridad",
  "documentacion_ingreso",
]);

const TERMINAL_FROM_STAGES = new Set(["rechazado", "contratado"]);

const FORBIDDEN_KEY = /^(esc2|ec|empleador|salary_aspiration_cop|salary_cap_cop|salario_propuesto)$/i;

export type CompSkipReason =
  | "not_oferta"
  | "already_oferta"
  | "terminal_from_stage"
  | "odd_from_stage"
  | "prod_hold"
  | "flag_off"
  | "url_missing";

export interface CompJobOfferPreviewPayload {
  stage: "oferta";
  preview: true;
  candidate_id: string;
  name: string;
  email: string;
  cargo: string;
  idioma: string | null;
  country: string | null;
  ubicacion: string | null;
  region: string | null;
  reporta_a: string | null;
  hiring_lead_email: string | null;
  vacancy_id: string | null;
  requisition_id: string | null;
}

export type CompPreviewResult =
  | { status: "skipped"; reason: string; idempotency_key: string }
  | { status: "sent"; http_status: number; idempotency_key: string }
  | { status: "error"; detail: string; idempotency_key: string; http_status?: number };

export interface OfertaCompSource {
  candidate_id: string;
  name: string | null;
  email: string | null;
  preferred_language: string | null;
  location: string | null;
  vacancy_id: string | null;
  cargo: string | null;
  country: string | null;
  region: string | null;
  hiring_lead_email: string | null;
  requisition_id: string | null;
  reporta_a: string | null;
  ubicacion_perfil: string | null;
}

export type CompHookPlan =
  | { kind: "skip"; result: Extract<CompPreviewResult, { status: "skipped" }> }
  | { kind: "prepare"; url: string; idempotency_key: string };

export function compIdempotencyKey(candidateId: string, vacancyId: string | null): string {
  return `${candidateId}:${vacancyId ?? ""}`;
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function manualCompPreviewRequested(value: unknown): boolean {
  return value === true || value === "true";
}

export function evaluateOfertaTransition(input: {
  fromStage: string | null;
  toStage: string;
  manualPreview: boolean;
}): { fire: true } | { fire: false; reason: CompSkipReason } {
  if (input.toStage !== "oferta") return { fire: false, reason: "not_oferta" };

  const fromNorm = normalizeStage(input.fromStage);
  if (input.fromStage === "oferta" || fromNorm === "oferta") {
    return { fire: false, reason: "already_oferta" };
  }
  if (TERMINAL_FROM_STAGES.has(fromNorm)) {
    return { fire: false, reason: "terminal_from_stage" };
  }
  if (!HIRING_FROM_STAGES.has(fromNorm)) {
    if (input.manualPreview) return { fire: true };
    return { fire: false, reason: "odd_from_stage" };
  }
  return { fire: true };
}

function readCompPreviewEnv(env?: CompPreviewEnv): CompPreviewEnv {
  if (env) return env;
  return {
    VERCEL_ENV: process.env.VERCEL_ENV,
    COMP_JOB_OFFER_PREVIEW_ENABLED: process.env[COMP_JOB_OFFER_PREVIEW_ENABLED_ENV],
    COMP_JOB_OFFER_WEBHOOK_URL: process.env[COMP_JOB_OFFER_WEBHOOK_URL_ENV],
  };
}

export function compPreviewGate(env?: CompPreviewEnv):
  | { open: true; url: string }
  | { open: false; reason: "prod_hold" | "flag_off" | "url_missing" } {
  const resolved = readCompPreviewEnv(env);
  if (resolved.VERCEL_ENV === "production") return { open: false, reason: "prod_hold" };

  const flag = (resolved.COMP_JOB_OFFER_PREVIEW_ENABLED || "").trim().toLowerCase();
  if (flag !== "true") return { open: false, reason: "flag_off" };

  const url = (resolved.COMP_JOB_OFFER_WEBHOOK_URL || "").trim();
  if (!url) return { open: false, reason: "url_missing" };

  return { open: true, url };
}

export function resolveCompHookPlan(input: {
  fromStage: string | null;
  toStage: string;
  manualPreview: boolean;
  candidateId: string;
  vacancyId: string | null;
  env?: CompPreviewEnv;
}): CompHookPlan {
  const key = compIdempotencyKey(input.candidateId, input.vacancyId);
  const transition = evaluateOfertaTransition(input);
  if (!transition.fire) {
    return { kind: "skip", result: { status: "skipped", reason: transition.reason, idempotency_key: key } };
  }
  const gate = compPreviewGate(input.env);
  if (!gate.open) {
    return { kind: "skip", result: { status: "skipped", reason: gate.reason, idempotency_key: key } };
  }
  return { kind: "prepare", url: gate.url, idempotency_key: key };
}

export function forbiddenPayloadKeys(payload: object): string[] {
  return Object.keys(payload).filter((key) => FORBIDDEN_KEY.test(key));
}

export function buildCompJobOfferPreview(source: OfertaCompSource):
  | { ok: true; payload: CompJobOfferPreviewPayload }
  | { ok: false; missing: Array<"name" | "email" | "cargo"> } {
  const name = clean(source.name);
  const email = clean(source.email);
  const cargo = clean(source.cargo);
  if (!name || !email || !cargo) {
    const missing: Array<"name" | "email" | "cargo"> = [];
    if (!name) missing.push("name");
    if (!email) missing.push("email");
    if (!cargo) missing.push("cargo");
    return { ok: false, missing };
  }

  const payload: CompJobOfferPreviewPayload = {
    stage: "oferta",
    preview: true,
    candidate_id: source.candidate_id,
    name,
    email,
    cargo,
    idioma: clean(source.preferred_language),
    country: clean(source.country),
    ubicacion: clean(source.location) ?? clean(source.ubicacion_perfil),
    region: clean(source.region),
    reporta_a: clean(source.reporta_a),
    hiring_lead_email: clean(source.hiring_lead_email),
    vacancy_id: source.vacancy_id,
    requisition_id: source.requisition_id,
  };

  const leaked = forbiddenPayloadKeys(payload);
  if (leaked.length > 0) {
    throw new Error(`payload de Comp incluye campos prohibidos: ${leaked.join(", ")}`);
  }
  return { ok: true, payload };
}

interface VacancyCompRow {
  id: string;
  title: string | null;
  country: string | null;
  hiring_lead_email: string | null;
  requisition_id: string | null;
}

interface RequisitionCompRow {
  id: string | null;
  lead_profile: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function sourceFromRows(
  candidate: {
    id: string;
    name: string | null;
    email: string | null;
    location: string | null;
    preferred_language: string | null;
    vacancy_id: string | null;
  },
  vacancy: {
    id?: string | null;
    title?: string | null;
    country?: string | null;
    hiring_lead_email?: string | null;
    requisition_id?: string | null;
  } | null,
  requisition: { id?: string | null; lead_profile?: unknown } | null,
): OfertaCompSource {
  const profile = asRecord(requisition?.lead_profile);
  return {
    candidate_id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    preferred_language: candidate.preferred_language,
    location: candidate.location,
    vacancy_id: candidate.vacancy_id,
    cargo: vacancy?.title ?? null,
    country: vacancy?.country ?? null,
    region: clean(profile.region),
    hiring_lead_email: vacancy?.hiring_lead_email ?? null,
    requisition_id: vacancy?.requisition_id ?? requisition?.id ?? null,
    reporta_a: clean(profile.reporta_a),
    ubicacion_perfil: clean(profile.ubicacion),
  };
}

/**
 * Lee candidato + vacante + requisición. No selecciona salario, ESC2 ni EC.
 * `requisition_id` en la vacante no tiene FK, así que la requisición va en
 * una consulta aparte (y, si falta el id, por vacancy_id).
 */
export async function loadOfertaCompSource(
  db: SupabaseClient,
  candidateId: string,
): Promise<OfertaCompSource | null> {
  const candRes = await db
    .from("ht_candidates")
    .select("id, name, email, location, preferred_language, vacancy_id")
    .eq("id", candidateId)
    .maybeSingle();
  if (candRes.error) throw new Error(candRes.error.message);
  const cand = candRes.data as {
    id: string;
    name: string | null;
    email: string | null;
    location: string | null;
    preferred_language: string | null;
    vacancy_id: string | null;
  } | null;
  if (!cand) return null;

  let vacancy: VacancyCompRow | null = null;

  if (cand.vacancy_id) {
    const vacRes = await db
      .from("ht_vacancies")
      .select("id, title, country, hiring_lead_email, requisition_id")
      .eq("id", cand.vacancy_id)
      .maybeSingle();
    if (vacRes.error) throw new Error(vacRes.error.message);
    vacancy = vacRes.data as VacancyCompRow | null;
  }

  let requisition: RequisitionCompRow | null = null;
  if (vacancy?.requisition_id) {
    const reqRes = await db
      .from("ht_requisitions")
      .select("id, lead_profile")
      .eq("id", vacancy.requisition_id)
      .maybeSingle();
    if (reqRes.error) throw new Error(reqRes.error.message);
    requisition = reqRes.data as RequisitionCompRow | null;
  } else if (vacancy?.id) {
    const reqRes = await db
      .from("ht_requisitions")
      .select("id, lead_profile")
      .eq("vacancy_id", vacancy.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reqRes.error) throw new Error(reqRes.error.message);
    requisition = reqRes.data as RequisitionCompRow | null;
  }

  return sourceFromRows(cand, vacancy, requisition);
}

export function logCompPreviewSkip(reason: string, idempotencyKey: string): void {
  console.info("[comp-job-offer-preview] skip", { reason, idempotency_key: idempotencyKey });
}

export async function deliverCompJobOfferPreview(
  payload: CompJobOfferPreviewPayload,
  opts: { url: string; idempotencyKey: string; fetchImpl?: typeof fetch },
): Promise<CompPreviewResult> {
  const leaked = forbiddenPayloadKeys(payload);
  if (leaked.length > 0 || payload.preview !== true || payload.stage !== "oferta") {
    console.error("[comp-job-offer-preview] refused", {
      idempotency_key: opts.idempotencyKey,
      leaked,
    });
    return {
      status: "skipped",
      reason: "forbidden_payload",
      idempotency_key: opts.idempotencyKey,
    };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(opts.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-comp-preview": "true",
      },
      body: JSON.stringify(payload),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status >= 300 && res.status < 400) {
      console.error("[comp-job-offer-preview] redirect refused", {
        idempotency_key: opts.idempotencyKey,
        http_status: res.status,
      });
      return {
        status: "error",
        http_status: res.status,
        detail: "Comp respondió con redirect. No se sigue: el preview no envía la oferta.",
        idempotency_key: opts.idempotencyKey,
      };
    }
    if (!res.ok) {
      console.error("[comp-job-offer-preview] http error", {
        idempotency_key: opts.idempotencyKey,
        http_status: res.status,
      });
      return {
        status: "error",
        http_status: res.status,
        detail: `Comp respondió HTTP ${res.status}`,
        idempotency_key: opts.idempotencyKey,
      };
    }
    console.info("[comp-job-offer-preview] sent", {
      idempotency_key: opts.idempotencyKey,
      http_status: res.status,
    });
    return { status: "sent", http_status: res.status, idempotency_key: opts.idempotencyKey };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "fetch failed";
    console.error("[comp-job-offer-preview] error", {
      idempotency_key: opts.idempotencyKey,
      detail,
    });
    return { status: "error", detail, idempotency_key: opts.idempotencyKey };
  }
}
