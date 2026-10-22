/**
 * GET /api/dashboard/today
 *
 * "Today's Focus" — qué requiere acción HOY:
 *   - aging_candidates: >5d sin moverse en stages activas
 *   - pending_decisions: candidatos en stages que esperan decisión humana
 *      (prefiltro_revision, recruiter_interview/cwo_interview con candidato sin avance,
 *       terna sin selección, oferta sin respuesta)
 *   - urgent_vacancies: vacantes rojas (días activos > target)
 *   - stale_vacancies: vacantes abiertas sin movimiento en >7d (velocity_7d = 0)
 *   - quick_wins: vacantes con candidato en oferta (cierre inminente)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

function daysSince(dt?: string | null): number {
  if (!dt) return 0;
  return Math.floor((Date.now() - new Date(dt).getTime()) / (1000 * 60 * 60 * 24));
}

const ACTIVE_STAGES = [
  'aplico','prefiltro_enviado','prefiltro_pasado','prefiltro_revision',
  'assessment_invitado','assessment_en_progreso','assessment_completado',
  'entrevista_ia','bateria_psicometrica','recruiter_interview',
  'cwo_interview','touring','terna','oferta'
];

const DECISION_STAGES = [
  'prefiltro_revision',     // requiere review humano
  'assessment_completado',  // ya hizo Elevare → decidir si pasa a entrevista
  'recruiter_interview',    // tras entrevista con recruiter, decidir avance
  'cwo_interview',          // tras CWO, decidir touring o terna
  'terna',                  // selección final
  'oferta',                 // esperando respuesta
];

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const vacancyFilter = url.searchParams.get('vacancy_id');

    // Vacancies + milestones + targets
    let vacQuery = supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, area, role_level, vacancy_type, status")
      .eq("client_id", TS_CLIENT_ID);
    if (vacancyFilter) vacQuery = vacQuery.eq('id', vacancyFilter);
    const { data: vacs } = await vacQuery;

    const { data: milestones } = await supabaseAdmin.from("ht_vacancy_milestones").select("*");
    const milestoneByVac: Record<string, any> = {};
    (milestones || []).forEach((m: any) => { milestoneByVac[m.vacancy_id] = m; });

    // Targets RYS-aligned · matriz (role_level + vacancy_type)
    const { data: targets } = await supabaseAdmin.from("ts_targets").select("*");
    const targetMap: Record<string, number> = {};
    (targets || []).forEach((t: any) => {
      targetMap[`${t.role_level}|${t.vacancy_type || 'incremental'}`] = t.target_days_to_fill;
    });
    const lookupTarget = (rl: string, vt: string): number => {
      const k = `${rl || 'entry'}|${vt || 'incremental'}`;
      return targetMap[k] ?? (
        rl === 'c_suite'
          ? (vt === 'reemplazo' ? 60 : 80)
          : (vt === 'reemplazo' ? 35 : 50)
      );
    };

    // Candidatos
    let candQuery = supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, vacancy_id, stage, status, updated_at, created_at")
      .not("email", "ilike", "%@tradingsolutions.com");
    if (vacancyFilter) candQuery = candQuery.eq('vacancy_id', vacancyFilter);
    const { data: cands } = await candQuery;

    const vacById: Record<string, any> = {};
    (vacs || []).forEach((v: any) => { vacById[v.id] = v; });

    // ─── Aging candidates (active stage, >5d sin moverse) ───
    const aging = (cands || [])
      .filter((c: any) => ACTIVE_STAGES.includes(c.stage || 'aplico'))
      .filter((c: any) => c.updated_at && daysSince(c.updated_at) > 5)
      .map((c: any) => {
        const v = vacById[c.vacancy_id];
        if (!v || milestoneByVac[v.id]?.hire_date) return null; // skip si vacante cerrada
        return {
          candidate_id: c.id,
          name: c.name,
          email: c.email,
          stage: c.stage,
          days_since_update: daysSince(c.updated_at),
          vacancy_id: c.vacancy_id,
          vacancy_title: v.title,
          severity: daysSince(c.updated_at) > 10 ? 'high' : 'medium',
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.days_since_update - a.days_since_update);

    // ─── Pending decisions (en stages que requieren acción) ───
    const pendingDecisions = (cands || [])
      .filter((c: any) => DECISION_STAGES.includes(c.stage || ''))
      .map((c: any) => {
        const v = vacById[c.vacancy_id];
        if (!v || milestoneByVac[v.id]?.hire_date) return null;
        return {
          candidate_id: c.id,
          name: c.name,
          stage: c.stage,
          days_in_stage: daysSince(c.updated_at),
          vacancy_id: c.vacancy_id,
          vacancy_title: v.title,
          action: actionForStage(c.stage),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.days_in_stage - a.days_in_stage);

    // ─── Urgent (red) vacancies — target RYS-híbrido ───
    const today = new Date();
    const urgentVacancies = (vacs || [])
      .filter((v: any) => {
        const m = milestoneByVac[v.id];
        if (!m || m.hire_date) return false;
        if (!m.hr_request_date) return false;
        const days = Math.floor((today.getTime() - new Date(m.hr_request_date).getTime()) / (1000 * 60 * 60 * 24));
        const target = lookupTarget(v.role_level, v.vacancy_type);
        return days > target;
      })
      .map((v: any) => {
        const m = milestoneByVac[v.id];
        const days = Math.floor((today.getTime() - new Date(m.hr_request_date).getTime()) / (1000 * 60 * 60 * 24));
        const target = lookupTarget(v.role_level, v.vacancy_type);
        return {
          vacancy_id: v.id,
          title: v.title,
          area: v.area,
          role_level: v.role_level,
          vacancy_type: v.vacancy_type || 'incremental',
          days_active: days,
          target_days: target,
          days_over: days - target,
        };
      })
      .sort((a: any, b: any) => b.days_over - a.days_over);

    // ─── Stale vacancies (sin movimiento en >7d) ───
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const staleVacancies = (vacs || [])
      .filter((v: any) => {
        const m = milestoneByVac[v.id];
        if (!m || m.hire_date) return false; // solo abiertas
        const candidatesInVac = (cands || []).filter((c: any) => c.vacancy_id === v.id);
        const recentMovement = candidatesInVac.some((c: any) =>
          c.updated_at && new Date(c.updated_at) >= lastWeek && ACTIVE_STAGES.includes(c.stage || '')
        );
        return !recentMovement && candidatesInVac.length > 0;
      })
      .map((v: any) => ({
        vacancy_id: v.id,
        title: v.title,
        area: v.area,
        candidates_count: (cands || []).filter((c: any) => c.vacancy_id === v.id && ACTIVE_STAGES.includes(c.stage || '')).length,
      }));

    // ─── Quick wins (oferta o terna pendiente — cierre cercano) ───
    const quickWins = (cands || [])
      .filter((c: any) => ['oferta', 'terna'].includes(c.stage || ''))
      .map((c: any) => {
        const v = vacById[c.vacancy_id];
        if (!v || milestoneByVac[v.id]?.hire_date) return null;
        return {
          candidate_id: c.id,
          name: c.name,
          stage: c.stage,
          days_in_stage: daysSince(c.updated_at),
          vacancy_id: c.vacancy_id,
          vacancy_title: v.title,
        };
      })
      .filter(Boolean);

    // ─── Recent movements (candidatos cuyo stage cambió en últimas 24h) ───
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const recentMovements = (cands || [])
      .filter((c: any) => {
        if (!c.updated_at) return false;
        const updated = new Date(c.updated_at);
        return updated >= yesterday;
      })
      .map((c: any) => {
        const v = vacById[c.vacancy_id];
        if (!v) return null;
        return {
          candidate_id: c.id,
          name: c.name,
          stage: c.stage,
          status: c.status,
          updated_at: c.updated_at,
          hours_ago: Math.floor((today.getTime() - new Date(c.updated_at).getTime()) / (1000 * 60 * 60)),
          vacancy_id: c.vacancy_id,
          vacancy_title: v.title,
          // Categorizar el movimiento para badge visual
          movement_type:
            c.stage === 'contratado' ? 'hired'
            : c.stage === 'rechazado' ? 'rejected'
            : ['oferta', 'terna', 'touring'].includes(c.stage) ? 'late_stage'
            : ['recruiter_interview', 'cwo_interview', 'entrevista_ia'].includes(c.stage) ? 'interview'
            : 'other',
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(b!.updated_at).getTime() - new Date(a!.updated_at).getTime())
      .slice(0, 15); // top 15 más recientes

    // ─── Today's interviews — entrevistas agendadas para hoy ───
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    let todaysInterviews: any[] = [];
    try {
      const { data: ints } = await supabaseAdmin
        .from("ts_interviews")
        .select("id, interview_type, scheduled_at, duration_min, meeting_url, location, status, candidate:ht_candidates(id, name), vacancy:ht_vacancies(id, title)")
        .gte("scheduled_at", todayStart.toISOString())
        .lte("scheduled_at", todayEnd.toISOString())
        .neq("status", "cancelled")
        .order("scheduled_at", { ascending: true });

      todaysInterviews = (ints || []).map((i: any) => ({
        id: i.id,
        candidate_id: i.candidate?.id,
        candidate_name: i.candidate?.name,
        vacancy_id: i.vacancy?.id,
        vacancy_title: i.vacancy?.title,
        interview_type: i.interview_type,
        scheduled_at: i.scheduled_at,
        duration_min: i.duration_min,
        meeting_url: i.meeting_url,
        location: i.location,
        status: i.status,
      }));
    } catch {
      // Si la tabla no existe aún, ignorar
      todaysInterviews = [];
    }

    // Conteo único de candidatos pendientes (deduplicado entre aging y pending_decisions
    // porque un mismo candidato puede estar en ambos arrays · ej: 22 días en
    // assessment_completado cuenta como aging Y como decisión pendiente)
    const uniqueCandidateIds = new Set<string>();
    aging.forEach((c: any) => uniqueCandidateIds.add(c.candidate_id));
    pendingDecisions.forEach((c: any) => uniqueCandidateIds.add(c.candidate_id));

    return NextResponse.json({
      generated_at: today.toISOString(),
      counts: {
        aging: aging.length,
        pending_decisions: pendingDecisions.length,
        urgent_vacancies: urgentVacancies.length,
        stale_vacancies: staleVacancies.length,
        quick_wins: quickWins.length,
        todays_interviews: todaysInterviews.length,
        recent_movements: recentMovements.length,
        // Conteo único · cuántos candidatos distintos requieren atención (sin doble-conteo)
        unique_pending_candidates: uniqueCandidateIds.size,
      },
      aging,
      pending_decisions: pendingDecisions,
      urgent_vacancies: urgentVacancies,
      stale_vacancies: staleVacancies,
      quick_wins: quickWins,
      todays_interviews: todaysInterviews,
      recent_movements: recentMovements,
    });
  } catch (err: any) {
    console.error("today route error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}

function actionForStage(stage: string): string {
  switch (stage) {
    case 'prefiltro_revision': return 'Revisar prefiltro y decidir avance';
    case 'assessment_completado': return 'Agendar Recruiter Interview (botón 📅 Agendar)';
    case 'recruiter_interview': return 'Completar scorecard + decidir avance a CWO';
    case 'cwo_interview': return 'Decidir avance a touring/terna';
    case 'terna': return 'Selección final del candidato';
    case 'oferta': return 'Seguimiento a respuesta del candidato';
    default: return 'Avanzar siguiente etapa';
  }
}
