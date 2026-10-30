/**
 * GET /api/dashboard/funnel-by-vacancy
 *
 * Para cada vacante (abierta + cerradas con candidatos), devuelve:
 *   - Funnel completo: cuántos candidatos pasaron por cada stage
 *   - Conversión vs stage anterior
 *   - Top 3 drop-offs (dónde la vacante está sangrando)
 *   - Time-to-stage avg (cuánto tardan en llegar a cada fase desde aplicar)
 *
 * Usado por el Dashboard sección "Funnel por vacante" para ver dónde se
 * estancan los candidatos en CADA vacante específica.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { supabaseAdmin } from "@/lib/supabase";
// El orden y las etiquetas del funnel salen de la fuente única de verdad.
// Antes había una copia acá que se quedó en los codes pre-v4: el funnel de
// cada vacante mostraba etapas que ya no existen y perdía las nuevas.
import { STAGE_ORDER, normalizeStage, stageLabel } from "@/lib/stage-labels";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

/**
 * Posición del candidato en el funnel. Normaliza primero porque en BD siguen
 * vivos los codes históricos y sin traducir caerían todos en -1.
 */
function stageRank(s: string | null): number {
  const code = normalizeStage(s);
  if (!code || code === 'rechazado') return -1;
  return STAGE_ORDER.indexOf(code as any);
}

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const vacancyId = url.searchParams.get('vacancy_id');
    const filterByVacancy = vacancyId && vacancyId !== 'all';

    let vacQuery = supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, area, role_level, status")
      .eq("client_id", TS_CLIENT_ID);
    if (filterByVacancy) vacQuery = vacQuery.eq("id", vacancyId);
    const { data: vacs } = await vacQuery;

    let milQuery = supabaseAdmin.from("ht_vacancy_milestones").select("vacancy_id, hire_date, hr_request_date");
    if (filterByVacancy) milQuery = milQuery.eq("vacancy_id", vacancyId);
    const { data: milestones } = await milQuery;
    const milestoneByVac: Record<string, any> = {};
    (milestones || []).forEach((m: any) => { milestoneByVac[m.vacancy_id] = m; });

    const cands = await fetchAllRows(() => {
      let candQuery = supabaseAdmin
        .from("ht_candidates")
        .select("id, vacancy_id, stage, status, created_at, updated_at")
        .not("email", "ilike", "%@tradingsolutions.com");
      if (filterByVacancy) candQuery = candQuery.eq("vacancy_id", vacancyId);
      return candQuery;
    });

    const candsByVac: Record<string, any[]> = {};
    (cands || []).forEach((c: any) => {
      if (!candsByVac[c.vacancy_id]) candsByVac[c.vacancy_id] = [];
      candsByVac[c.vacancy_id].push(c);
    });

    // Para cada vacante, computar funnel
    const results = (vacs || [])
      .filter((v: any) => (candsByVac[v.id] || []).length > 0)
      .map((v: any) => {
        const candsForVac = candsByVac[v.id] || [];
        const total = candsForVac.length;
        const rejected = candsForVac.filter((c: any) => normalizeStage(c.stage) === 'rechazado').length;
        const hired = candsForVac.filter((c: any) => normalizeStage(c.stage) === 'contratado').length;
        const active = total - rejected - hired;

        // Cuántos llegaron a cada stage
        const reached: Record<string, number> = {};
        STAGE_ORDER.forEach(s => { reached[s] = 0; });
        candsForVac.forEach((c: any) => {
          const r = stageRank(c.stage);
          if (normalizeStage(c.stage) === 'rechazado') {
            reached.aplico++;
          } else if (r >= 0) {
            for (let i = 0; i <= r; i++) reached[STAGE_ORDER[i]]++;
          }
        });

        // Conversiones por stage transition
        const stages = STAGE_ORDER.map((s, i) => {
          const r = reached[s] || 0;
          const prev = i === 0 ? r : reached[STAGE_ORDER[i - 1]] || 0;
          const conv = prev > 0 ? Math.round((r / prev) * 100) : null;
          const lostFromPrev = i === 0 ? 0 : prev - r;
          return {
            stage: s,
            label: stageLabel(s),
            count: r,
            conv_pct: conv,
            lost_from_prev: lostFromPrev,
          };
        }).filter(s => s.count > 0 || (STAGE_ORDER.indexOf(s.stage) <= 2)); // siempre mostrar al menos los primeros 3

        // Top 3 drop-offs (transiciones donde más se perdió en %)
        const dropoffs = stages
          .map((s, i) => {
            if (i === 0 || s.conv_pct === null) return null;
            const prev = stages[i - 1];
            const lostPct = prev.count > 0 ? Math.round((s.lost_from_prev / prev.count) * 100) : 0;
            return { from: prev.label, to: s.label, lost: s.lost_from_prev, lost_pct: lostPct, conv_pct: s.conv_pct };
          })
          .filter(Boolean)
          .filter((d: any) => d.lost > 0)
          .sort((a: any, b: any) => b.lost_pct - a.lost_pct)
          .slice(0, 3);

        const m = milestoneByVac[v.id];
        const isClosed = !!m?.hire_date;

        return {
          vacancy_id: v.id,
          title: v.title,
          area: v.area,
          role_level: v.role_level,
          status: isClosed ? 'cerrada' : 'abierta',
          totals: {
            total,
            active,
            rejected,
            hired,
          },
          funnel: stages,
          top_dropoffs: dropoffs,
        };
      })
      .sort((a: any, b: any) => {
        // Abiertas primero (por más activos), después cerradas (por más hires)
        if (a.status !== b.status) return a.status === 'abierta' ? -1 : 1;
        return b.totals.active - a.totals.active;
      });

    return NextResponse.json({ vacancies: results, total: results.length });
  } catch (err: any) {
    console.error("funnel-by-vacancy error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
