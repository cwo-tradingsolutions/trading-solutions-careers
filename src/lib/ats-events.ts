/**
 * Eventos del funnel para los agentes · `candidate.stage_changed`.
 *
 * POR QUÉ EXISTE
 * Samuel (Informes HM) y los demás agentes necesitan enterarse de que un
 * candidato cambió de gate sin leer la BD a cada rato. Careers es dueño del
 * evento; quien lo consume (Slack, informes) no vive acá.
 *
 * CONTRATO (no cambiar nombres sin avisar a quien consume)
 *   event               'candidate.stage_changed'
 *   vacancy_id          uuid | null
 *   candidate_id        uuid
 *   gate                KellyGateId | null   (null = rechazado)
 *   gate_n / gate_label 1..12 y su nombre
 *   stage_code          code canónico v4 escrito
 *   from_stage_code     code v4 anterior | null
 *   hiring_lead_email   líder del área (ht_vacancies.hiring_lead_email)
 *   owner_recruiter_id  dueño del proceso en Talent (agenda/firma)
 *   owner_recruiter_email
 *   occurred_at         ISO
 *   source              'ui' | 'system' | 'backfill'
 *
 * ENTREGA
 * Best-effort, nunca tumba el movimiento:
 *  - Siempre: una línea JSON en el log (Cloud Logging la indexa).
 *  - Si ATS_EVENTS_WEBHOOK_URL está definida: POST con timeout de 3 s, firmado
 *    con HMAC-SHA256 en `X-ATS-Signature` si hay ATS_EVENTS_WEBHOOK_SECRET.
 *  - Para quien prefiera leer: GET /api/headhunting/stage-events?since=…
 *    reconstruye los mismos eventos desde ht_candidate_stage_events.
 */
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { kellyGateFromStage, normalizeStage, type KellyGateId } from "@/lib/stage-labels";
import { runGateAutomations } from "@/lib/ats-automations";

export type StageChangedEvent = {
  event: "candidate.stage_changed";
  vacancy_id: string | null;
  candidate_id: string;
  gate: KellyGateId | null;
  gate_n: number | null;
  gate_label: string | null;
  stage_code: string;
  from_stage_code: string | null;
  hiring_lead_email: string | null;
  owner_recruiter_id: string | null;
  owner_recruiter_email: string | null;
  occurred_at: string;
  source: string;
  note?: string | null;
};

type VacancyOwners = {
  hiring_lead_email: string | null;
  owner_recruiter_id: string | null;
  owner_recruiter_email: string | null;
};

/**
 * Dueño y Hiring Lead de una vacante. `select("*")` a propósito: si la
 * migración de hiring_lead_email no corrió en algún ambiente, el evento sale
 * con null en vez de fallar la consulta entera.
 */
export async function ownersDeVacante(vacancyId: string | null | undefined): Promise<VacancyOwners> {
  const vacios: VacancyOwners = { hiring_lead_email: null, owner_recruiter_id: null, owner_recruiter_email: null };
  if (!vacancyId) return vacios;
  try {
    const { data: v } = await supabaseAdmin.from("ht_vacancies").select("*").eq("id", vacancyId).maybeSingle();
    if (!v) return vacios;
    const ownerId = ((v as any).owner_recruiter_id as string | null) ?? null;
    let ownerEmail: string | null = null;
    if (ownerId) {
      const { data: r } = await supabaseAdmin.from("ts_recruiters").select("email").eq("id", ownerId).maybeSingle();
      ownerEmail = ((r as any)?.email as string | null) ?? null;
    }
    return {
      hiring_lead_email: ((v as any).hiring_lead_email as string | null) ?? null,
      owner_recruiter_id: ownerId,
      owner_recruiter_email: ownerEmail,
    };
  } catch {
    return vacios;
  }
}

export function buildStageChangedEvent(opts: {
  candidateId: string;
  vacancyId: string | null;
  toStage: string;
  fromStage: string | null;
  occurredAt: string;
  source: string;
  note?: string | null;
  owners: VacancyOwners;
}): StageChangedEvent {
  const gate = kellyGateFromStage(opts.toStage);
  return {
    event: "candidate.stage_changed",
    vacancy_id: opts.vacancyId,
    candidate_id: opts.candidateId,
    gate: gate?.id ?? null,
    gate_n: gate?.n ?? null,
    gate_label: gate?.label ?? null,
    stage_code: normalizeStage(opts.toStage),
    from_stage_code: opts.fromStage ? normalizeStage(opts.fromStage) : null,
    ...opts.owners,
    occurred_at: opts.occurredAt,
    source: opts.source,
    note: opts.note ?? null,
  };
}

async function entregarWebhook(evt: StageChangedEvent): Promise<void> {
  const url = process.env.ATS_EVENTS_WEBHOOK_URL;
  if (!url) return;
  const body = JSON.stringify(evt);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-ATS-Event": evt.event,
  };
  const secret = process.env.ATS_EVENTS_WEBHOOK_SECRET;
  if (secret) headers["X-ATS-Signature"] = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  try {
    const r = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(3000) });
    if (!r.ok) console.error(`[ats-events] webhook respondió ${r.status} para ${evt.candidate_id}`);
  } catch (e: any) {
    console.error(`[ats-events] webhook falló para ${evt.candidate_id}:`, e?.message || e);
  }
}

/**
 * Emite `candidate.stage_changed`. Lo llama recordStageEvent, así que todo
 * camino que registre el historial también avisa: no hay un segundo lugar
 * que acordarse de llamar.
 */
export async function emitStageChanged(opts: {
  candidateId: string;
  toStage: string;
  fromStage?: string | null;
  vacancyId?: string | null;
  source?: string;
  note?: string | null;
  occurredAt?: string;
}): Promise<void> {
  try {
    let vacancyId = opts.vacancyId ?? null;
    if (!vacancyId) {
      const { data: c } = await supabaseAdmin.from("ht_candidates").select("vacancy_id").eq("id", opts.candidateId).maybeSingle();
      vacancyId = ((c as any)?.vacancy_id as string | null) ?? null;
    }
    const evt = buildStageChangedEvent({
      candidateId: opts.candidateId,
      vacancyId,
      toStage: opts.toStage,
      fromStage: opts.fromStage ?? null,
      occurredAt: opts.occurredAt ?? new Date().toISOString(),
      source: opts.source ?? "system",
      note: opts.note,
      owners: await ownersDeVacante(vacancyId),
    });
    console.log(JSON.stringify({ severity: "INFO", message: "ats_event", ats_event: evt }));
    await entregarWebhook(evt);
    await runGateAutomations(evt);
  } catch (e: any) {
    console.error(`[ats-events] no se emitió ${opts.candidateId} → ${opts.toStage}:`, e?.message || e);
  }
}
