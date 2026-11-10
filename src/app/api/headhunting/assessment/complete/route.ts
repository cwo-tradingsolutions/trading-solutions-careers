import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { recordStageEvent } from '@/lib/stage-events';
import { isPreviewTestMode, previewTestJson } from '@/lib/preview-mode';

function calculateIntegrityScore(proctoring: {
  camera_enabled?: boolean;
  total_tab_switches?: number;
  total_camera_snapshots?: number;
}): number {
  let score = 100;
  // Camera not enabled: -30 points
  if (!proctoring.camera_enabled) score -= 30;
  // Tab switches: -5 per switch, max penalty -40
  const switches = proctoring.total_tab_switches ?? 0;
  score -= Math.min(40, switches * 5);
  // No camera snapshots when camera was enabled: -10
  if (proctoring.camera_enabled && (proctoring.total_camera_snapshots ?? 0) === 0) score -= 10;
  return Math.max(0, score);
}

export async function POST(req: NextRequest) {
  try {
    const { token, total_time_seconds, proctoring } = await req.json();

    if (!token) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    // Validate token
    const { data: candidate } = await supabaseAdmin
      .from('ht_candidates')
      .select('id, status, stage, vacancy_id')
      .eq('assessment_token', token)
      .single();

    if (!candidate || candidate.status !== 'in_progress') {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 403 });
    }

    if (isPreviewTestMode()) {
      return previewTestJson('POST /api/headhunting/assessment/complete');
    }

    // Mark all non-final responses as final
    await supabaseAdmin
      .from('ht_responses')
      .update({ is_final: true })
      .eq('candidate_id', candidate.id)
      .eq('is_final', false);

    // Update candidate status to completed
    const { error: updateErr } = await supabaseAdmin
      .from('ht_candidates')
      .update({
        status: 'completed',
        stage: 'assessment_completado',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidate.id);

    // Cerrar el assessment mueve la etapa. Sin el evento no queda rastro del
    // salto y los días en etapa se calculan sobre updated_at recién pisado.
    if (!updateErr) {
      await recordStageEvent({
        candidateId: candidate.id,
        fromStage: candidate.stage ?? null,
        toStage: 'assessment_completado',
        vacancyId: candidate.vacancy_id ?? null,
        source: 'system',
      });
    }

    // Create a pending result record
    await supabaseAdmin.from('ht_results').insert({
      candidate_id: candidate.id,
      vacancy_id: candidate.vacancy_id,
      profile_scores: {},
      dimension_scores: {},
      match_percentage: 0,
      match_breakdown: {},
      benchmark_comparison: {
        vs_mean: {},
        percentile_rank: 50,
        proctoring: proctoring ? {
          camera_enabled: proctoring.camera_enabled ?? false,
          total_tab_switches: proctoring.total_tab_switches ?? 0,
          total_camera_snapshots: proctoring.total_camera_snapshots ?? 0,
          tab_switch_events: proctoring.tab_switch_events ?? [],
          integrity_score: calculateIntegrityScore(proctoring),
        } : { camera_enabled: false, total_tab_switches: 0, total_camera_snapshots: 0, tab_switch_events: [], integrity_score: 0 },
      },
      red_flags: [],
      recommendation: 'PENDIENTE',
      recommendation_reason: 'Evaluación completada. Pendiente de calificación por el agente IA.',
      total_time_seconds: total_time_seconds || 0,
    });

    return NextResponse.json({ completed: true });
  } catch (err) {
    console.error('Assessment complete error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
