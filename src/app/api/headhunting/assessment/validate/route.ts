import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { TS_SCENARIOS } from '@/lib/headhunting/scenarios-ts';
import { recordStageEvent } from '@/lib/stage-events';
import { isPreviewTestMode } from '@/lib/preview-mode';

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    // Look up candidate by assessment token
    const { data: candidate, error } = await supabaseAdmin
      .from('ht_candidates')
      .select('*')
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
      .select('*')
      .eq('id', candidate.vacancy_id)
      .single();

    // Get client branding
    const { data: client } = await supabaseAdmin
      .from('ht_clients')
      .select('name, logo_url, primary_color')
      .eq('id', candidate.client_id)
      .single();

    // Get scenarios for this competency model
    const modelId = vacancy?.model_id;
    const { data: scenarios } = await supabaseAdmin
      .from('ht_scenarios')
      .select('*')
      .eq('model_id', modelId)
      .order('order_index');

    // Get any existing responses (for session resume)
    const { data: existingResponses } = await supabaseAdmin
      .from('ht_responses')
      .select('scenario_id, response_text, response_data, time_spent_seconds, is_final')
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

    // Enrich scenarios with options and correct scenario_type from TS source
    // (Supabase table doesn't have 'options' column yet)
    const enrichedScenarios = (scenarios || []).map((s: any) => {
      const tsMatch = TS_SCENARIOS.find(
        (ts) => ts.competency_key === s.competency_key && ts.order_index === s.order_index
      );
      if (tsMatch && tsMatch.options?.length) {
        return {
          ...s,
          scenario_type: tsMatch.scenario_type, // 'role_play_mc'
          options: tsMatch.options,
          scenario_text: tsMatch.scenario_text, // Use latest text from TS
        };
      }
      return s;
    });

    return NextResponse.json({
      candidate: {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
      },
      vacancy: vacancy
        ? { id: vacancy.id, title: vacancy.title, area: vacancy.area, description: vacancy.description }
        : null,
      client: client || { name: 'Trading Solutions', logo_url: null, primary_color: '#2C64ED' },
      scenarios: enrichedScenarios,
      existing_responses: existingResponses || [],
    });
  } catch (err) {
    console.error('Assessment validate error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
