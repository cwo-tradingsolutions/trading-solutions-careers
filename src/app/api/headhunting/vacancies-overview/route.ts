/**
 * GET /api/headhunting/vacancies-overview
 *
 * Devuelve overview de todas las vacantes con:
 *   - milestones (fechas: solicitud, orgánica, linkedin, vacancy_started, hire)
 *   - estado (abierta/cerrada)
 *   - métricas (days_active, time_to_fill, days_since_linkedin, candidates_total, by_stage)
 *   - hired candidate info si cerrada
 *
 * Usado por el Dashboard para la sección "Vacantes".
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { fechaIso } from "@/lib/vacancy-dates";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const vacancyId = url.searchParams.get('vacancy_id');
    const filterByVacancy = vacancyId && vacancyId !== 'all';

    // 1. Vacancies + their milestones
    let vacQuery = supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, area, status, role_level, vacancy_type, country")
      .eq("client_id", TS_CLIENT_ID);
    if (filterByVacancy) vacQuery = vacQuery.eq("id", vacancyId);
    const { data: vacs, error: vErr } = await vacQuery;
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

    // Targets RYS-aligned: matriz (role_level, vacancy_type)
    const { data: targets } = await supabaseAdmin.from("ts_targets").select("*");
    const targetMap: Record<string, number> = {};
    (targets || []).forEach((t: any) => {
      const key = `${t.role_level}|${t.vacancy_type || 'incremental'}`;
      targetMap[key] = t.target_days_to_fill;
    });
    const lookupTarget = (roleLevel: string, vacancyType: string): number => {
      const k = `${roleLevel || 'entry'}|${vacancyType || 'incremental'}`;
      // Fallback hardcoded híbrido si la tabla está vacía
      return targetMap[k] ?? (
        roleLevel === 'c_suite'
          ? (vacancyType === 'reemplazo' ? 60 : 80)
          : (vacancyType === 'reemplazo' ? 35 : 50)
      );
    };

    let milQuery = supabaseAdmin
      .from("ht_vacancy_milestones")
      .select("*");
    if (filterByVacancy) milQuery = milQuery.eq("vacancy_id", vacancyId);
    const { data: milestones } = await milQuery;

    const milestoneByVacancy: Record<string, any> = {};
    (milestones || []).forEach((m: any) => { milestoneByVacancy[m.vacancy_id] = m; });

    // 2. Candidates per vacancy by stage (incluye updated_at para aging)
    let candQuery = supabaseAdmin
      .from("ht_candidates")
      .select("id, name, vacancy_id, stage, status, email, updated_at, created_at")
      .not("email", "ilike", "%@tradingsolutions.com");
    if (filterByVacancy) candQuery = candQuery.eq("vacancy_id", vacancyId);
    const { data: cands } = await candQuery;

    function daysSince(dt?: string | null) {
      if (!dt) return 0;
      return Math.floor((today.getTime() - new Date(dt).getTime()) / (1000 * 60 * 60 * 24));
    }

    const candsByVacancy: Record<string, any[]> = {};
    (cands || []).forEach((c: any) => {
      if (!candsByVacancy[c.vacancy_id]) candsByVacancy[c.vacancy_id] = [];
      candsByVacancy[c.vacancy_id].push(c);
    });

    // 3. Hired candidate names
    const hiredIds = (milestones || []).map((m: any) => m.hired_candidate_id).filter(Boolean);
    const { data: hiredCands } = hiredIds.length > 0
      ? await supabaseAdmin.from("ht_candidates").select("id, name, email").in("id", hiredIds)
      : { data: [] };
    const hiredById: Record<string, any> = {};
    (hiredCands || []).forEach((c: any) => { hiredById[c.id] = c; });

    // 4. Build overview
    const today = new Date();
    const result = (vacs || []).map((v: any) => {
      const m = milestoneByVacancy[v.id] || {};
      const candidates = candsByVacancy[v.id] || [];

      const byStage: Record<string, number> = {};
      let activos = 0, rechazados = 0, contratados = 0;
      candidates.forEach((c: any) => {
        const s = c.stage || "aplico";
        byStage[s] = (byStage[s] || 0) + 1;
        if (s === "rechazado") rechazados++;
        else if (s === "contratado") contratados++;
        else activos++;
      });

      const hired = m.hired_candidate_id ? hiredById[m.hired_candidate_id] : null;

      // Compute days
      function daysBetween(from?: string | null, to?: string | null | Date): number | null {
        if (!from) return null;
        const f = new Date(from);
        const t = to ? new Date(to as any) : today;
        return Math.floor((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
      }

      // La autoridad es ht_vacancies.status. Antes esto se decidía SOLO por
      // hire_date en los milestones, así que una vacante cerrada sin fecha de
      // contratación registrada (se canceló, se congeló, se cubrió por
      // interno) seguía apareciendo como abierta para siempre — y no había
      // forma de cerrarla desde ningún lado.
      const isClosed = v.status === "closed" || v.status === "cancelled" || !!m.hire_date;
      const daysActive = m.hr_request_date ? daysBetween(m.hr_request_date, isClosed ? m.hire_date : null) : null;
      const timeToFill = isClosed && m.hr_request_date ? daysBetween(m.hr_request_date, m.hire_date) : null;
      const daysSinceLinkedin = m.linkedin_active_date ? daysBetween(m.linkedin_active_date, isClosed ? m.hire_date : null) : null;
      const daysVacant = m.vacancy_started_date && isClosed ? daysBetween(m.vacancy_started_date, m.hire_date) : null;

      // ─── Health Score (solo abiertas) — RYS-aligned target by (role_level, vacancy_type) ───
      const target = lookupTarget(v.role_level, v.vacancy_type);
      let healthScore: 'green' | 'yellow' | 'red' | 'closed' = 'closed';
      let healthReason = '';
      if (!isClosed) {
        const days = daysActive || 0;
        if (days <= target * 0.5) {
          healthScore = 'green';
          healthReason = `${days}d activa · dentro de ritmo (target ${target}d)`;
        } else if (days <= target) {
          healthScore = 'yellow';
          healthReason = `${days}/${target}d · acercándose al target, atención`;
        } else {
          healthScore = 'red';
          healthReason = `${days}d activa · pasó target ${target}d (${days - target}d sobre)`;
        }
      }

      // ─── Aging candidates (>5d en mismo stage en stages activos) ───
      const activeStages = ['aplico','prefiltro_enviado','prefiltro_pasado','prefiltro_revision','assessment_invitado','assessment_en_progreso','assessment_completado','entrevista_ia','bateria_psicometrica','recruiter_interview','cwo_interview','touring','terna','oferta'];
      const agingCandidates = candidates.filter((c: any) =>
        activeStages.includes(c.stage || 'aplico') && c.updated_at && daysSince(c.updated_at) > 5
      ).map((c: any) => ({
        id: c.id, name: c.name, stage: c.stage, days_since_update: daysSince(c.updated_at),
      }));

      // ─── Velocity (candidatos que avanzaron en últimos 7 días) ───
      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const velocity = candidates.filter((c: any) =>
        c.updated_at && new Date(c.updated_at) >= lastWeek && activeStages.includes(c.stage || '')
      ).length;

      // ─── Forecast simple: si tiene candidatos en etapas finales, predice cierre ───
      const lateStages = ['cwo_interview','touring','terna','oferta'];
      const inLate = candidates.filter((c: any) => lateStages.includes(c.stage || '')).length;
      let forecastCloseInDays: number | null = null;
      if (!isClosed && inLate > 0) {
        // Conservative: avg de tiempo en late stages es ~10 días
        forecastCloseInDays = Math.max(7, 14 - velocity);
      }

      return {
        vacancy_id: v.id,
        title: v.title,
        area: v.area,
        role_level: v.role_level,
        vacancy_type: v.vacancy_type || 'incremental',
        status: isClosed ? "cerrada" : "abierta",
        milestones: {
          hr_request_date: m.hr_request_date,
          organic_traction_date: m.organic_traction_date,
          linkedin_active_date: m.linkedin_active_date,
          vacancy_started_date: m.vacancy_started_date,
          hire_date: m.hire_date,
          target_fill_date: m.target_fill_date ?? null,
          notes: m.notes,
        },
        fechas_faltantes: !fechaIso(m.hr_request_date) || !fechaIso(m.target_fill_date),
        metrics: {
          days_active: daysActive,
          target_days: target,
          time_to_fill: timeToFill,
          days_since_linkedin: daysSinceLinkedin,
          days_vacant: daysVacant,
          candidates_total: candidates.length,
          activos, rechazados, contratados,
          by_stage: byStage,
          velocity_7d: velocity,
          in_late_stages: inLate,
          forecast_close_in_days: forecastCloseInDays,
        },
        health: { score: healthScore, reason: healthReason },
        aging_candidates: agingCandidates,
        hired: hired ? { id: hired.id, name: hired.name, email: hired.email } : null,
      };
    });

    // Sort: abiertas primero (por días activos desc), después cerradas (por hire_date desc)
    result.sort((a, b) => {
      if (a.status !== b.status) return a.status === "abierta" ? -1 : 1;
      if (a.status === "abierta") {
        return (b.metrics.days_active || 0) - (a.metrics.days_active || 0);
      }
      const ad = a.milestones.hire_date || "";
      const bd = b.milestones.hire_date || "";
      return bd.localeCompare(ad);
    });

    return NextResponse.json({ vacancies: result, total: result.length });
  } catch (err: any) {
    console.error("vacancies-overview error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
