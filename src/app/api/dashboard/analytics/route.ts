/**
 * GET /api/dashboard/analytics
 *
 * Analytics profundo:
 *   - funnel_conversion: por stage, total candidatos que llegaron + que convirtieron al next
 *   - dropoff: top 3 stages con mayor drop-off
 *   - time_per_stage: tiempo promedio en cada stage (estimado desde updated_at deltas)
 *   - sources: split LinkedIn vs Orgánica usando linkedin_active_date como cutoff
 *   - vacancy_comparison: TTF + conversion rate por vacante (cerradas)
 *   - quality_scores: avg Elevare por vacante para cerradas
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { supabaseAdmin } from "@/lib/supabase";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

// Orden canónico del funnel
const STAGES = [
  'aplico',
  'prefiltro_enviado',
  'prefiltro_pasado',
  'assessment_invitado',
  'assessment_completado',
  'entrevista_ia',
  'bateria_psicometrica',
  'recruiter_interview',
  'cwo_interview',
  'touring',
  'terna',
  'oferta',
  'contratado',
];

const STAGE_LABEL: Record<string, string> = {
  aplico: 'Aplicó',
  prefiltro_enviado: 'Prefiltro enviado',
  prefiltro_pasado: 'Prefiltro ✓',
  prefiltro_revision: 'Prefiltro en revisión',
  assessment_invitado: 'Elevare invitado',
  assessment_en_progreso: 'Elevare en progreso',
  assessment_completado: 'Elevare ✓',
  entrevista_ia: 'Entrevista IA',
  bateria_psicometrica: 'Batería psicométrica',
  recruiter_interview: 'Recruiter interview',
  cwo_interview: 'CWO interview',
  touring: 'Touring',
  terna: 'Terna',
  oferta: 'Oferta',
  contratado: 'Contratado',
  rechazado: 'Rechazado',
};

// Stage rank — un candidato que está en stage X "pasó por" todos los anteriores
function stageRank(s: string | null): number {
  if (!s || s === 'rechazado') return -1;
  const i = STAGES.indexOf(s);
  return i === -1 ? -1 : i;
}

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const vacancyFilter = url.searchParams.get('vacancy_id');

    const today = new Date();

    // Vacancies + milestones
    let vacQuery = supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, area, role_level, status")
      .eq("client_id", TS_CLIENT_ID);
    if (vacancyFilter) vacQuery = vacQuery.eq('id', vacancyFilter);
    const { data: vacs } = await vacQuery;

    const { data: milestones } = await supabaseAdmin.from("ht_vacancy_milestones").select("*");
    const milestoneByVac: Record<string, any> = {};
    (milestones || []).forEach((m: any) => { milestoneByVac[m.vacancy_id] = m; });

    // Candidates (excluding internos)
    const cands = await fetchAllRows(() => {
      let candQuery = supabaseAdmin
        .from("ht_candidates")
        .select("id, vacancy_id, stage, status, updated_at, created_at")
        .not("email", "ilike", "%@tradingsolutions.com");
      if (vacancyFilter) candQuery = candQuery.eq('vacancy_id', vacancyFilter);
      return candQuery;
    });

    // ─── Funnel conversion: cuántos llegaron a cada stage ───
    // Un candidato "llegó al stage X" si su rank actual >= rank(X) o si fue rechazado en/después
    const stageReached: Record<string, number> = {};
    STAGES.forEach(s => { stageReached[s] = 0; });
    (cands || []).forEach((c: any) => {
      const r = stageRank(c.stage);
      // Si está rechazado, asumimos que llegó hasta donde alcanzó (no podemos saber sin event log)
      // Por ahora contamos rechazados como si hubiesen llegado al stage 0 mínimo
      if (c.stage === 'rechazado') {
        stageReached.aplico = (stageReached.aplico || 0) + 1;
      } else if (r >= 0) {
        for (let i = 0; i <= r; i++) {
          stageReached[STAGES[i]] = (stageReached[STAGES[i]] || 0) + 1;
        }
      }
    });

    const funnelConversion = STAGES.map((s, i) => {
      const reached = stageReached[s] || 0;
      const prev = i === 0 ? reached : stageReached[STAGES[i - 1]] || 0;
      const conv = prev > 0 ? Math.round((reached / prev) * 100) : null;
      return {
        stage: s,
        label: STAGE_LABEL[s],
        reached,
        conv_from_prev: i === 0 ? null : conv,
      };
    });

    // ─── Drop-off: top 3 transiciones con mayor pérdida % ───
    const dropoffs = funnelConversion
      .map((f, i) => {
        if (i === 0 || f.conv_from_prev === null) return null;
        const prev = funnelConversion[i - 1];
        const lost = prev.reached - f.reached;
        const lostPct = prev.reached > 0 ? Math.round((lost / prev.reached) * 100) : 0;
        return {
          from: prev.label,
          to: f.label,
          lost,
          lost_pct: lostPct,
          conv_pct: f.conv_from_prev,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.lost_pct - a.lost_pct)
      .slice(0, 3);

    // ─── Sources: LinkedIn vs Orgánica ───
    // Para cada candidato, determinar fuente comparando created_at vs vacancy.linkedin_active_date
    let fromLinkedin = 0;
    let fromOrganic = 0;
    let unknown = 0;
    (cands || []).forEach((c: any) => {
      const m = milestoneByVac[c.vacancy_id];
      if (!m || !m.linkedin_active_date) {
        // Vacante sin LinkedIn → todo orgánico
        fromOrganic++;
        return;
      }
      if (!c.created_at) { unknown++; return; }
      if (new Date(c.created_at) >= new Date(m.linkedin_active_date)) {
        fromLinkedin++;
      } else {
        fromOrganic++;
      }
    });
    const totalSources = fromLinkedin + fromOrganic + unknown;
    const sources = {
      linkedin: { count: fromLinkedin, pct: totalSources > 0 ? Math.round((fromLinkedin / totalSources) * 100) : 0 },
      organic: { count: fromOrganic, pct: totalSources > 0 ? Math.round((fromOrganic / totalSources) * 100) : 0 },
      unknown: { count: unknown, pct: totalSources > 0 ? Math.round((unknown / totalSources) * 100) : 0 },
    };

    // Conversion por source: cuántos hires vinieron de cada
    let hiresLinkedin = 0, hiresOrganic = 0;
    (cands || []).forEach((c: any) => {
      if (c.stage !== 'contratado') return;
      const m = milestoneByVac[c.vacancy_id];
      if (!m || !m.linkedin_active_date) { hiresOrganic++; return; }
      if (c.created_at && new Date(c.created_at) >= new Date(m.linkedin_active_date)) {
        hiresLinkedin++;
      } else {
        hiresOrganic++;
      }
    });
    const sourcesQuality = {
      linkedin_hire_rate: fromLinkedin > 0 ? Math.round((hiresLinkedin / fromLinkedin) * 1000) / 10 : 0,
      organic_hire_rate: fromOrganic > 0 ? Math.round((hiresOrganic / fromOrganic) * 1000) / 10 : 0,
      linkedin_hires: hiresLinkedin,
      organic_hires: hiresOrganic,
    };

    // ─── Vacancy comparison (cerradas) ───
    const closedVacancies = (vacs || []).filter((v: any) => milestoneByVac[v.id]?.hire_date);
    const vacancyComparison = closedVacancies.map((v: any) => {
      const m = milestoneByVac[v.id];
      const ttf = m.hr_request_date && m.hire_date
        ? Math.floor((new Date(m.hire_date).getTime() - new Date(m.hr_request_date).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const ttfLinkedin = m.linkedin_active_date && m.hire_date
        ? Math.floor((new Date(m.hire_date).getTime() - new Date(m.linkedin_active_date).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const cands_for_vac = (cands || []).filter((c: any) => c.vacancy_id === v.id);
      const total = cands_for_vac.length;
      const hired = cands_for_vac.filter((c: any) => c.stage === 'contratado').length;
      return {
        vacancy_id: v.id,
        title: v.title,
        role_level: v.role_level,
        ttf,
        ttf_linkedin: ttfLinkedin,
        candidates_total: total,
        hire_rate: total > 0 ? Math.round((hired / total) * 1000) / 10 : 0,
      };
    }).sort((a: any, b: any) => (a.ttf || 9999) - (b.ttf || 9999));

    // ─── Time per stage (estimado) ───
    // Tomamos updated_at como aprox. del momento en que el candidato salió de su stage actual o se quedó.
    // Group by stage, average updated_at - created_at split — limitado pero útil como signal.
    const stageTime: Record<string, { count: number; avg_days: number }> = {};
    (cands || []).forEach((c: any) => {
      if (!c.created_at || !c.updated_at) return;
      const days = Math.floor((new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const s = c.stage || 'aplico';
      if (!stageTime[s]) stageTime[s] = { count: 0, avg_days: 0 };
      stageTime[s].avg_days = (stageTime[s].avg_days * stageTime[s].count + days) / (stageTime[s].count + 1);
      stageTime[s].count++;
    });
    const timePerStage = Object.entries(stageTime).map(([stage, d]) => ({
      stage,
      label: STAGE_LABEL[stage] || stage,
      count: d.count,
      avg_days: Math.round(d.avg_days),
    })).sort((a, b) => b.avg_days - a.avg_days);

    // ─── Quality score (Elevare avg por vacante cerrada) ───
    // Esto requiere join a tabla de scores — best-effort, retornamos placeholder si no aplica
    let avgElevare: number | null = null;
    try {
      const scores = await fetchAllRows(() =>
        supabaseAdmin
          .from("ht_candidates")
          .select("overall_score")
          .not("overall_score", "is", null),
      );
      if (scores.length > 0) {
        avgElevare = Math.round(scores.reduce((s: number, c: any) => s + (c.overall_score || 0), 0) / scores.length);
      }
    } catch {}

    return NextResponse.json({
      generated_at: today.toISOString(),
      funnel_conversion: funnelConversion,
      top_dropoffs: dropoffs,
      sources,
      sources_quality: sourcesQuality,
      vacancy_comparison: vacancyComparison,
      time_per_stage: timePerStage,
      avg_elevare_score: avgElevare,
    });
  } catch (err: any) {
    console.error("analytics endpoint error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
