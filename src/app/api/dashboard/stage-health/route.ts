/**
 * GET /api/dashboard/stage-health[?vacancy_id=]
 *
 * Devuelve por cada stage activo:
 *   - count: candidatos en ese stage actualmente
 *   - avg_days: promedio de días que llevan en ese stage (basado en updated_at)
 *   - max_days: máximo de días (peor candidato)
 *   - sla_target: target en días (de stage-labels.ts)
 *   - status: 'green' (bajo SLA), 'yellow' (90-100% SLA), 'red' (>SLA)
 *   - over_sla_count: cuántos candidatos pasaron del SLA
 *   - bottleneck_score: 0-100, ranking de severidad (count × (avg_days/sla))
 *
 * Pensado para mostrar el "Stage Health Card" del Dashboard — tabla operativa
 * para que el reclutador detecte cuellos de botella en segundos.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { STAGE_SLA_DAYS, STAGE_LABEL_SHORT, STAGE_CATEGORY } from "@/lib/stage-labels";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

const ACTIVE_STAGES = [
  'aplico', 'prefiltro_enviado', 'prefiltro_revision', 'prefiltro_pasado',
  'assessment_invitado', 'assessment_en_progreso', 'assessment_completado',
  'entrevista_ia', 'bateria_psicometrica',
  'recruiter_interview', 'cwo_interview', 'touring', 'terna', 'oferta',
];

function daysSince(dt?: string | null): number {
  if (!dt) return 0;
  return Math.floor((Date.now() - new Date(dt).getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const vacancyFilter = url.searchParams.get('vacancy_id');

    let candQuery = supabaseAdmin
      .from("ht_candidates")
      .select("id, vacancy_id, stage, status, updated_at, created_at, name")
      .not("email", "ilike", "%@tradingsolutions.com");
    if (vacancyFilter && vacancyFilter !== 'all') candQuery = candQuery.eq('vacancy_id', vacancyFilter);
    const { data: cands } = await candQuery;

    // Filtrar a candidatos en vacantes abiertas (excluir cerradas/rechazados)
    let vacQuery = supabaseAdmin
      .from("ht_vacancies")
      .select("id")
      .eq("client_id", TS_CLIENT_ID);
    if (vacancyFilter && vacancyFilter !== 'all') vacQuery = vacQuery.eq('id', vacancyFilter);
    const { data: vacs } = await vacQuery;
    const validVacIds = new Set((vacs || []).map((v: any) => v.id));

    const { data: milestones } = await supabaseAdmin
      .from("ht_vacancy_milestones")
      .select("vacancy_id, hire_date");
    const closedVacIds = new Set((milestones || []).filter((m: any) => m.hire_date).map((m: any) => m.vacancy_id));

    const activeCands = (cands || []).filter((c: any) =>
      validVacIds.has(c.vacancy_id) &&
      !closedVacIds.has(c.vacancy_id) &&
      ACTIVE_STAGES.includes(c.stage || '')
    );

    // Agrupar por stage
    const byStage: Record<string, any[]> = {};
    activeCands.forEach((c: any) => {
      const s = c.stage || 'aplico';
      if (!byStage[s]) byStage[s] = [];
      byStage[s].push(c);
    });

    // Computar health por stage
    const stages = ACTIVE_STAGES.map(stageCode => {
      const list = byStage[stageCode] || [];
      const count = list.length;
      if (count === 0) {
        return {
          stage: stageCode,
          label: STAGE_LABEL_SHORT[stageCode] || stageCode,
          category: STAGE_CATEGORY[stageCode] || 'screening',
          count: 0,
          avg_days: 0,
          max_days: 0,
          sla_target: STAGE_SLA_DAYS[stageCode] ?? null,
          status: 'green',
          over_sla_count: 0,
          bottleneck_score: 0,
          worst_candidate: null,
        };
      }

      const days = list.map((c: any) => daysSince(c.updated_at));
      const avgDays = Math.round(days.reduce((a: number, b: number) => a + b, 0) / count);
      const maxDays = Math.max(...days);
      const sla = STAGE_SLA_DAYS[stageCode] ?? null;
      const overSlaCount = sla ? days.filter(d => d > sla).length : 0;

      let status: 'green' | 'yellow' | 'red' = 'green';
      if (sla) {
        if (avgDays > sla) status = 'red';
        else if (avgDays >= sla * 0.9) status = 'yellow';
      }

      // Score: cuánto cuello de botella es este stage
      // count × ratio_sla — mayor count Y mayor sobre-SLA = mayor score
      const bottleneckScore = sla ? Math.round(count * (avgDays / sla) * 10) : count * 5;

      // Peor candidato (el de más días)
      const worstIdx = days.indexOf(maxDays);
      const worst = list[worstIdx];

      return {
        stage: stageCode,
        label: STAGE_LABEL_SHORT[stageCode] || stageCode,
        category: STAGE_CATEGORY[stageCode] || 'screening',
        count,
        avg_days: avgDays,
        max_days: maxDays,
        sla_target: sla,
        status,
        over_sla_count: overSlaCount,
        bottleneck_score: bottleneckScore,
        worst_candidate: worst ? {
          id: worst.id,
          name: worst.name,
          days: maxDays,
          vacancy_id: worst.vacancy_id,
        } : null,
      };
    });

    // Detectar el cuello de botella principal (mayor bottleneck_score con status != green)
    const problemStages = stages.filter(s => s.status !== 'green' && s.count > 0);
    problemStages.sort((a, b) => b.bottleneck_score - a.bottleneck_score);
    const topBottleneck = problemStages[0] || null;

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      stages,
      top_bottleneck: topBottleneck,
      summary: {
        total_active_candidates: activeCands.length,
        stages_red: stages.filter(s => s.status === 'red').length,
        stages_yellow: stages.filter(s => s.status === 'yellow').length,
        stages_green: stages.filter(s => s.status === 'green' && s.count > 0).length,
      },
    });
  } catch (err: any) {
    console.error('stage-health error:', err);
    return NextResponse.json({ error: err?.message || 'Error' }, { status: 500 });
  }
}
