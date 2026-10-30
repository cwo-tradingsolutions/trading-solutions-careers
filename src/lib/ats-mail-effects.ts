/**
 * Work that must happen after a queued message actually leaves Gmail.
 * Immediate sends and the pending replay both call this. Each kind is
 * idempotent so a second pass does not double-count.
 */
import type { MailSideEffect } from "@/lib/ats-mail";

export async function applyMailSideEffect(effect: MailSideEffect | null | undefined): Promise<void> {
  if (!effect) return;
  if (effect.kind === "battery") {
    const { supabaseAdmin } = await import("@/lib/supabase");
    const { limpiarBateriaPendiente, moverABateria } = await import("@/lib/bateria/invitar");
    const { data } = await supabaseAdmin
      .from("ts_bat_sessions")
      .select("invite_count, invited_at")
      .eq("id", effect.sessionId)
      .maybeSingle();
    if (data && !data.invited_at) {
      await supabaseAdmin
        .from("ts_bat_sessions")
        .update({
          invited_at: new Date().toISOString(),
          invite_channel: effect.channel,
          invite_count: (data.invite_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", effect.sessionId);
    }
    await limpiarBateriaPendiente(effect.candidateId);
    await moverABateria(effect.candidateId, `Batería enviada (${effect.channel})`);
    return;
  }
  if (effect.kind === "rejection_sent") {
    const { supabaseAdmin } = await import("@/lib/supabase");
    const { rejectionSentAt } = await import("@/lib/rejection-email");
    const sentAt = rejectionSentAt(true);
    await supabaseAdmin
      .from("ht_candidates")
      .update({ rejection_sent_at: sentAt, updated_at: sentAt })
      .eq("id", effect.candidateId);
    return;
  }
  if (effect.kind === "survey_sent") {
    const { supabaseAdmin } = await import("@/lib/supabase");
    await supabaseAdmin
      .from("ts_candidate_experience")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", effect.surveyId)
      .is("sent_at", null);
  }
}
