/**
 * Work that must happen after a queued message actually leaves Gmail.
 * Immediate sends and the pending replay both call this. Each kind is
 * idempotent so a second pass does not double-count.
 */
import type { MailSideEffect } from "@/lib/ats-mail";

const REJECTION_MAIL_NOTE = "Correo de rechazo enviado";

export async function applyMailSideEffect(effect: MailSideEffect | null | undefined): Promise<boolean> {
  if (!effect) return false;
  try {
    if (effect.kind === "battery") return applyBattery(effect);
    if (effect.kind === "rejection_sent") return applyRejection(effect);
    if (effect.kind === "survey_sent") return applySurvey(effect);
  } catch (e) {
    console.error("[ats-mail] side effect failed", e instanceof Error ? e.message : e);
    return false;
  }
  return false;
}

async function applyBattery(effect: Extract<MailSideEffect, { kind: "battery" }>): Promise<boolean> {
  const { supabaseAdmin } = await import("@/lib/supabase");
  const { limpiarBateriaPendiente, moverABateria } = await import("@/lib/bateria/invitar");
  const { data, error } = await supabaseAdmin
    .from("ts_bat_sessions")
    .select("invite_count, invited_at")
    .eq("id", effect.sessionId)
    .maybeSingle();
  if (error || !data) return false;
  if (!data.invited_at) {
    const { data: updated, error: writeError } = await supabaseAdmin
      .from("ts_bat_sessions")
      .update({
        invited_at: new Date().toISOString(),
        invite_channel: effect.channel,
        invite_count: (data.invite_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", effect.sessionId)
      .is("invited_at", null)
      .select("id");
    if (writeError || !updated?.length) return false;
  }
  await limpiarBateriaPendiente(effect.candidateId);
  await moverABateria(effect.candidateId, `Batería enviada (${effect.channel})`);
  return true;
}

async function applyRejection(effect: Extract<MailSideEffect, { kind: "rejection_sent" }>): Promise<boolean> {
  const { supabaseAdmin } = await import("@/lib/supabase");
  const { rejectionSentAt } = await import("@/lib/rejection-email");
  const { data: row, error } = await supabaseAdmin
    .from("ht_candidates")
    .select("id, stage, vacancy_id, rejection_sent_at")
    .eq("id", effect.candidateId)
    .maybeSingle();
  if (error || !row) return false;
  const sentAt = row.rejection_sent_at || rejectionSentAt(true);
  if (!row.rejection_sent_at) {
    const { data: updated, error: writeError } = await supabaseAdmin
      .from("ht_candidates")
      .update({ rejection_sent_at: sentAt, updated_at: sentAt })
      .eq("id", effect.candidateId)
      .is("rejection_sent_at", null)
      .select("id");
    if (writeError || !updated?.length) return false;
  }
  const { data: noted } = await supabaseAdmin
    .from("ht_candidate_stage_events")
    .select("id")
    .eq("candidate_id", effect.candidateId)
    .eq("note", REJECTION_MAIL_NOTE)
    .limit(1);
  if (noted?.length) return true;
  const { error: eventError } = await supabaseAdmin.from("ht_candidate_stage_events").insert({
    candidate_id: effect.candidateId,
    vacancy_id: row.vacancy_id ?? null,
    from_stage: row.stage ?? null,
    to_stage: row.stage ?? "rechazado",
    changed_at: sentAt,
    changed_by: "jointheteam@tradingsolutions.com",
    source: "system",
    note: REJECTION_MAIL_NOTE,
  });
  return !eventError;
}

async function applySurvey(effect: Extract<MailSideEffect, { kind: "survey_sent" }>): Promise<boolean> {
  const { supabaseAdmin } = await import("@/lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("ts_candidate_experience")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", effect.surveyId)
    .is("sent_at", null)
    .select("id");
  if (error) return false;
  if (data?.length) return true;
  const { data: existing } = await supabaseAdmin
    .from("ts_candidate_experience")
    .select("sent_at")
    .eq("id", effect.surveyId)
    .maybeSingle();
  return Boolean(existing?.sent_at);
}
