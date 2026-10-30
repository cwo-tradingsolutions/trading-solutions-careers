import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { TS_SCENARIOS } from '@/lib/headhunting/scenarios-ts';
import { recordStageEvent } from '@/lib/stage-events';
import { isPreviewTestMode } from '@/lib/preview-mode';
import {
  VALIDATE_CANDIDATE_COLUMNS,
  VALIDATE_CLIENT_COLUMNS,
  VALIDATE_RESPONSE_COLUMNS,
  VALIDATE_SCENARIO_COLUMNS,
  VALIDATE_VACANCY_COLUMNS,
  assessmentValidateBody,
} from '@/lib/assessment-validate-payload';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    // Look up candidate by assessment token
    const { data: candidate, error } = await supabaseAdmin
      .from('ht_candidates')
      .select(VALIDATE_CANDIDATE_COLUMNS)
      .eq('assessment_token', token)
      .single();

    if (error || !candidate) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 404 });
    }

    // Token evergreen · si el candidato hace click, extendemos 7 días más.
    // Razón: drafts de Gmail pueden sentarse días antes de enviar · si el link
    // expira en el camino, candidato recibe link muerto sin culpa. Cada click
    // del candidato vivo re-activa el reloj.
    if (!isPreviewTestMode() && candidate.token_expires_at) {
      const expires = new Date(candidate.token_expires_at);
      const now = new Date();
      if (expires < now || (expires.getTime() - now.getTime()) < 3 * 24 * 60 * 60 * 1000) {
        const fresh = new Date();
        fresh.setDate(fresh.getDate() + 7);
        await supabaseAdmin
          .from('ht_candidates')
          .update({ token_expires_at: fresh.toISOString() })
          .eq('id', candidate.id);
      }
    }

    // Check candidate status — pero permitir reactivar si status quedó 'expired'
    // por un check antiguo · ya no expiramos, así que volvemos a 'invited'.
    if (candidate.status === 'expired') {
      if (!isPreviewTestMode()) {
        await supabaseAdmin
          .from('ht_candidates')
          .update({ status: 'invited' })
          .eq('id', candidate.id);
      }
      candidate.status = 'invited';
    }
    if (!['invited', 'in_progress'].includes(candidate.status)) {
      return NextResponse.json(
        { error: 'Evaluación no disponible', status: candidate.status },
        { status: 403 }
      );
    }

    // Get vacancy info
    const { data: vacancy } = await supabaseAdmin
      .from('ht_vacancies')
      .select(VALIDATE_VACANCY_COLUMNS)
      .eq('id', candidate.vacancy_id)
      .single();

    const { data: client } = await supabaseAdmin
      .from('ht_clients')
      .select(VALIDATE_CLIENT_COLUMNS)
      .eq('id', candidate.client_id)
      .single();

    const modelId = vacancy?.model_id;
    const { data: scenarios } = await supabaseAdmin
      .from('ht_scenarios')
      .select(VALIDATE_SCENARIO_COLUMNS)
      .eq('model_id', modelId)
      .order('order_index');

    const { data: existingResponses } = await supabaseAdmin
      .from('ht_responses')
      .select(VALIDATE_RESPONSE_COLUMNS)
      .eq('candidate_id', candidate.id);

    // If status is 'invited', transition to 'in_progress'
    if (candidate.status === 'invited' && !isPreviewTestMode()) {
      const { error: updateErr } = await supabaseAdmin
        .from('ht_candidates')
        .update({
          status: 'in_progress',
          stage: 'assessment_en_progreso',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidate.id);

      // Arrancar el assessment mueve la etapa. Sin el evento el dashboard
      // pierde el momento real y vuelve a contar días desde updated_at.
      if (!updateErr) {
        await recordStageEvent({
          candidateId: candidate.id,
          fromStage: candidate.stage ?? null,
          toStage: 'assessment_en_progreso',
          vacancyId: candidate.vacancy_id ?? null,
          source: 'system',
        });
      }
    }

    const enrichedScenarios = (scenarios || []).map((s) => {
      const tsMatch = TS_SCENARIOS.find(
        (ts) => ts.competency_key === s.competency_key && ts.order_index === s.order_index
      );
      return {
        id: s.id,
        block: s.block,
        scenario_type: tsMatch?.scenario_type || s.scenario_type,
        scenario_text: tsMatch?.scenario_text || s.scenario_text,
        options: tsMatch?.options ?? [],
        time_limit_seconds: tsMatch?.time_limit_seconds ?? s.time_limit_seconds ?? null,
      };
    });

    return NextResponse.json(assessmentValidateBody({
      candidateName: candidate.name,
      vacancyTitle: vacancy?.title ?? null,
      clientName: client?.name ?? null,
      clientLogoUrl: client?.logo_url ?? null,
      scenarios: enrichedScenarios,
      existingResponses: existingResponses || [],
    }));
  } catch (err) {
    console.error('Assessment validate error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
