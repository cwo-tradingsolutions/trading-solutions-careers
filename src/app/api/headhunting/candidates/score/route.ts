import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { scoreCandidate } from '@/lib/headhunting/scoring-agent';
import { calculateMatchPercentage, compareToBenchmark, detectRedFlags } from '@/lib/headhunting/match-calculator';
import type { HtScenario, HtResponse, IdealProfile } from '@/lib/headhunting/types';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidate_id } = await req.json();

    if (!candidate_id) {
      return NextResponse.json({ error: 'candidate_id requerido' }, { status: 400 });
    }

    // Get candidate with vacancy info
    const { data: candidate } = await supabaseAdmin
      .from('ht_candidates')
      .select('*, ht_vacancies(*)')
      .eq('id', candidate_id)
      .single();

    if (!candidate) {
      return NextResponse.json({ error: 'Candidato no encontrado' }, { status: 404 });
    }

    if (candidate.status !== 'completed') {
      return NextResponse.json(
        { error: `Candidato debe estar en status "completed", tiene: ${candidate.status}` },
        { status: 400 }
      );
    }

    const vacancy = candidate.ht_vacancies;
    if (!vacancy) {
      return NextResponse.json({ error: 'Vacante no encontrada' }, { status: 404 });
    }

    // Get all scenarios for this model
    const { data: scenarios } = await supabaseAdmin
      .from('ht_scenarios')
      .select('*')
      .eq('model_id', vacancy.model_id)
      .order('order_index');

    // Get all responses
    const { data: responses } = await supabaseAdmin
      .from('ht_responses')
      .select('*')
      .eq('candidate_id', candidate_id)
      .eq('is_final', true);

    if (!scenarios?.length || !responses?.length) {
      return NextResponse.json(
        { error: 'No hay escenarios o respuestas para calificar' },
        { status: 400 }
      );
    }

    // Run AI scoring pipeline
    const idealProfile: IdealProfile = vacancy.ideal_profile || {};
    const competencyWeights: Record<string, number> = vacancy.competency_weights || {};

    const { profile, dimensionScores, matchResult } = await scoreCandidate(
      scenarios as HtScenario[],
      responses as HtResponse[],
      idealProfile,
      competencyWeights
    );

    // Also calculate deterministic match for comparison
    const deterministicMatch = calculateMatchPercentage(profile, idealProfile);
    const benchmarkComparison = compareToBenchmark(profile);
    const redFlags = detectRedFlags(profile);

    // Merge AI and deterministic results
    const finalMatchPercentage = matchResult.match_percentage || deterministicMatch.overall;
    const finalRedFlags = [...new Set([...redFlags, ...(matchResult.red_flags || [])])];

    // Determine recommendation
    let recommendation: 'AVANZA' | 'EN ESPERA' | 'NO AVANZA' = 'NO AVANZA';
    if (finalMatchPercentage >= 70) recommendation = 'AVANZA';
    else if (finalMatchPercentage >= 50) recommendation = 'EN ESPERA';

    // Check if result already exists — IMPORTANTE: preservar proctoring data
    // que /assessment/complete guardó dentro de benchmark_comparison.proctoring,
    // si lo borráramos aquí el auditor anti-cheat creería que la cámara estaba
    // apagada y los snapshots eran 0, marcando a todos como NO CONFIABLE.
    const { data: existingResult } = await supabaseAdmin
      .from('ht_results')
      .select('id, benchmark_comparison')
      .eq('candidate_id', candidate_id)
      .single();

    const existingProctoring = (existingResult?.benchmark_comparison as { proctoring?: unknown })?.proctoring;
    const mergedBenchmark = existingProctoring
      ? { ...benchmarkComparison, proctoring: existingProctoring }
      : benchmarkComparison;

    // Save/update result
    const resultData = {
      candidate_id,
      vacancy_id: vacancy.id,
      profile_scores: profile,
      dimension_scores: dimensionScores,
      match_percentage: finalMatchPercentage,
      match_breakdown: matchResult.match_breakdown || deterministicMatch.breakdown,
      benchmark_comparison: mergedBenchmark,
      red_flags: finalRedFlags,
      recommendation: matchResult.recommendation || recommendation,
      recommendation_reason: matchResult.recommendation_reason || `Match: ${finalMatchPercentage}%`,
      total_time_seconds: 0, // Will be filled from candidate data
    };

    if (existingResult) {
      await supabaseAdmin
        .from('ht_results')
        .update(resultData)
        .eq('id', existingResult.id);
    } else {
      await supabaseAdmin
        .from('ht_results')
        .insert(resultData);
    }

    // Update individual response records with AI scores
    for (const response of responses) {
      const scenario = scenarios.find((s: HtScenario) => s.id === response.scenario_id);
      if (!scenario) continue;

      // Find the scoring data for this scenario from the pipeline
      // (the scoring agent already scored each response individually)
    }

    return NextResponse.json({
      success: true,
      candidate_id,
      match_percentage: finalMatchPercentage,
      recommendation: matchResult.recommendation || recommendation,
      recommendation_reason: matchResult.recommendation_reason,
      profile_scores: profile,
      dimension_scores: dimensionScores,
      red_flags: finalRedFlags,
    });
  } catch (err) {
    console.error('Score candidate error:', err);
    return NextResponse.json({ error: 'Error al calificar candidato', details: String(err) }, { status: 500 });
  }
}
