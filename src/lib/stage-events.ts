/**
 * Registro del historial de etapas.
 *
 * POR QUÉ EXISTE
 * El dashboard calcula "días en etapa" desde el último evento de esta tabla.
 * Si un camino del código mueve a un candidato SIN registrar el evento, el
 * último evento sigue nombrando su etapa anterior, el cálculo se cae a
 * `updated_at` — que ese mismo write acaba de pisar — y el contador arranca
 * de cero. El candidato aparece recién movido llevando semanas parado.
 *
 * REGLA: todo lugar que escriba `ht_candidates.stage` llama a esto.
 *
 * Es best-effort a propósito: si el insert falla, el movimiento del candidato
 * ya quedó guardado y no tiene sentido tumbar la operación por el historial.
 * El error se loguea para que no desaparezca en silencio.
 */
import { supabaseAdmin } from "@/lib/supabase";
import { emitStageChanged } from "@/lib/ats-events";

export type StageEventSource = "ui" | "system" | "backfill";

export async function recordStageEvent(opts: {
  candidateId: string;
  toStage: string;
  fromStage?: string | null;
  vacancyId?: string | null;
  /** 'ui' = lo movió una persona · 'system' = lo movió un automatismo */
  source?: StageEventSource;
  changedBy?: string | null;
  note?: string | null;
}): Promise<void> {
  const { candidateId, toStage, fromStage, vacancyId, source = "system", changedBy, note } = opts;

  // Mover a la misma etapa no es un evento — registrarlo reiniciaría el
  // contador de días sin que el candidato se haya movido.
  if (!candidateId || !toStage || fromStage === toStage) return;

  try {
    const { error } = await supabaseAdmin.from("ht_candidate_stage_events").insert({
      candidate_id: candidateId,
      vacancy_id: vacancyId ?? null,
      from_stage: fromStage ?? null,
      to_stage: toStage,
      changed_at: new Date().toISOString(),
      changed_by: changedBy ?? null,
      source,
      note: note ?? null,
    });
    if (error) {
      console.error(`[stage-events] no se registró ${candidateId} → ${toStage}:`, error.message);
    }
  } catch (e: any) {
    console.error(`[stage-events] excepción registrando ${candidateId} → ${toStage}:`, e?.message || e);
  }

  // El evento para los agentes sale aunque el historial haya fallado: el
  // candidato sí se movió, que es lo que el consumidor necesita saber.
  await emitStageChanged({ candidateId, toStage, fromStage, vacancyId, source, note });
}

/**
 * Versión para varios candidatos a la vez (batches, sync, crons).
 */
export async function recordStageEvents(
  events: Array<{
    candidateId: string;
    toStage: string;
    fromStage?: string | null;
    vacancyId?: string | null;
    source?: StageEventSource;
    note?: string | null;
  }>,
): Promise<void> {
  const rows = events
    .filter((e) => e.candidateId && e.toStage && e.fromStage !== e.toStage)
    .map((e) => ({
      candidate_id: e.candidateId,
      vacancy_id: e.vacancyId ?? null,
      from_stage: e.fromStage ?? null,
      to_stage: e.toStage,
      changed_at: new Date().toISOString(),
      source: e.source ?? "system",
      note: e.note ?? null,
    }));
  if (rows.length === 0) return;

  try {
    const { error } = await supabaseAdmin.from("ht_candidate_stage_events").insert(rows);
    if (error) console.error(`[stage-events] batch de ${rows.length} falló:`, error.message);
  } catch (e: any) {
    console.error("[stage-events] excepción en batch:", e?.message || e);
  }

  await Promise.all(rows.map((r) => emitStageChanged({
    candidateId: r.candidate_id,
    toStage: r.to_stage,
    fromStage: r.from_stage,
    vacancyId: r.vacancy_id,
    source: r.source,
    note: r.note,
    occurredAt: r.changed_at,
  })));
}
