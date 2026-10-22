/**
 * GET /api/headhunting/dashboard-stats
 *
 * Devuelve métricas agregadas del pipeline real (ht_candidates en Supabase).
 * Esto es lo que el Dashboard debería estar mostrando en lugar (o además)
 * de la data de Neon legacy.
 *
 * Query params opcionales:
 *   - vacancy_id: filtrar por una vacante específica
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
// Las etapas salen de la fuente única de verdad. Este archivo tenía sus
// propias listas con codes pre-v4: contaba candidatos en etapas muertas y
// dejaba fuera las nuevas (pruebas, prueba_tecnica, terna, contratación).
import {
  ACTIVE_STAGES,
  STAGE_ORDER,
  STAGE_RANK,
  normalizeStage,
  stageLabel,
} from "@/lib/stage-labels";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const vacancyFilter = url.searchParams.get("vacancy_id");

    // Lista mínima de columnas que sabemos existen. Si alguna columna opcional
    // (e.g. `source`) no existe en este schema, hacemos un retry sin ella.
    const baseCols = "id, name, email, vacancy_id, stage, status, prefilter_decision, prefilter_invited_at, prefilter_completed_at, created_at, updated_at, ht_vacancies(title)";
    const withSource = `id, name, email, vacancy_id, stage, status, prefilter_decision, prefilter_invited_at, prefilter_completed_at, source, created_at, updated_at, ht_vacancies(title)`;

    async function runQuery(cols: string) {
      let q = supabaseAdmin.from("ht_candidates").select(cols);
      if (vacancyFilter) q = q.eq("vacancy_id", vacancyFilter);
      return q;
    }

    let resp: any = await runQuery(withSource);
    if (resp.error && /column .*source.* does not exist/i.test(resp.error.message)) {
      // Retry sin source
      resp = await runQuery(baseCols);
    }
    if (resp.error) {
      return NextResponse.json({ error: resp.error.message }, { status: 500 });
    }

    const all: any[] = resp.data || [];

    // Conteo por stage del Funnel v4 · 13 etapas + terminal
    const COUNTED_STAGES = [...STAGE_ORDER, "rechazado"];
    const byStage: Record<string, number> = {};
    for (const s of COUNTED_STAGES) byStage[s] = 0;
    for (const c of all) {
      // Normalizar antes de contar · en BD siguen vivos los codes históricos y
      // sin traducir cada uno abriría su propio bucket fuera del funnel.
      const stg = normalizeStage(c.stage as string) || "aplico";
      byStage[stg] = (byStage[stg] ?? 0) + 1;
    }

    // Decision breakdown del prefiltro
    const prefilterDecision: Record<string, number> = { pass: 0, review: 0, reject: 0, pending: 0 };
    for (const c of all) {
      if (c.prefilter_completed_at) {
        const d = (c.prefilter_decision as string) || "pending";
        prefilterDecision[d] = (prefilterDecision[d] ?? 0) + 1;
      }
    }

    // Conteo por vacante
    const byVacancy: Record<string, { count: number; title: string }> = {};
    for (const c of all) {
      const vid = (c.vacancy_id as string) || "unknown";
      const title = c.ht_vacancies?.title || "—";
      if (!byVacancy[vid]) byVacancy[vid] = { count: 0, title };
      byVacancy[vid].count++;
    }

    // Source distribution
    const bySource: Record<string, number> = {};
    for (const c of all) {
      const s = ((c.source as string) || "otros").toLowerCase();
      const label = s.includes("linkedin")
        ? "LinkedIn TS"
        : s.includes("email") || s.includes("direct")
        ? "Email / directo"
        : s.includes("refer")
        ? "Referidos"
        : s.includes("organic") || s.includes("careers")
        ? "Careers (orgánico)"
        : "Otros";
      bySource[label] = (bySource[label] ?? 0) + 1;
    }

    // Funnel conversion rates (stage → next stage)
    const funnelOrder = STAGE_ORDER.map((key) => ({ key, label: stageLabel(key) }));
    // Acumulado: cuántos están en stage X o más adelante
    const cumulative = funnelOrder.map((f) => {
      const rankF = STAGE_RANK[f.key];
      const reached = all.filter((c) => {
        const stg = normalizeStage(c.stage as string) || "aplico";
        // 'rechazado' no cuenta como progreso a stages futuras
        if (stg === "rechazado") {
          // pero si fue rechazado AFTER passing this stage, debería contarse
          // approximation: si tiene prefilter_completed_at, ya pasó por aplico/prefiltro
          if (f.key === "aplico" || f.key === "prefiltro_enviado") return true;
          if (f.key === "prefiltro_pasado" && c.prefilter_decision === "pass") return true;
          return false;
        }
        return (STAGE_RANK[stg] ?? 0) >= rankF;
      }).length;
      return { ...f, count: reached };
    });

    // ─── Top candidates · activos en pipeline con Elevare score ───
    // ACTIVE_STAGES ya excluye contratado y rechazado.
    const activeCands = all.filter((c) =>
      (ACTIVE_STAGES as string[]).includes(normalizeStage(c.stage as string))
    );

    // Cargar Elevare scores en una query separada
    const candIds = activeCands.map((c) => c.id);
    let aiScoresByCandId: Record<string, { score: number | null; recommendation: string | null }> = {};
    if (candIds.length > 0) {
      const { data: aiInts } = await supabaseAdmin
        .from("ht_ai_interviews")
        .select("candidate_id, ai_score, overall_score, ai_recommendation, completed_at")
        .in("candidate_id", candIds)
        .order("completed_at", { ascending: false });
      // Guardar el más reciente por candidato
      (aiInts || []).forEach((ai: any) => {
        if (!aiScoresByCandId[ai.candidate_id]) {
          aiScoresByCandId[ai.candidate_id] = {
            score: ai.ai_score ?? ai.overall_score ?? null,
            recommendation: ai.ai_recommendation ?? null,
          };
        }
      });
    }

    const now = Date.now();
    const enrichedTop = activeCands
      .map((c) => {
        const ai = aiScoresByCandId[c.id] || {};
        const score = ai.score ?? null;
        const updated = c.updated_at ? new Date(c.updated_at).getTime() : null;
        const daysInStage = updated ? Math.floor((now - updated) / (1000 * 60 * 60 * 24)) : null;
        return {
          candidate_id: c.id,
          name: c.name,
          email: c.email,
          stage: normalizeStage(c.stage as string),
          vacancy_id: c.vacancy_id,
          vacancy_title: c.ht_vacancies?.title || "—",
          elevare_score: score,
          elevare_recommendation: ai.recommendation || null,
          days_in_stage: daysInStage,
        };
      })
      .filter((c) => c.elevare_score !== null && c.elevare_score >= 50) // solo con score reasonable
      .sort((a, b) => (b.elevare_score || 0) - (a.elevare_score || 0))
      .slice(0, 6);

    return NextResponse.json({
      total: all.length,
      byStage,
      prefilterDecision,
      byVacancy,
      bySource,
      cumulative,
      hires: byStage["contratado"] ?? 0,
      rejected: byStage["rechazado"] ?? 0,
      // Las tres etapas de assessment se consolidaron en "pruebas" (batería) y
      // "prueba_tecnica" (assessment del cargo).
      inElevareProcess: byStage["pruebas"] ?? 0,
      completedElevare: byStage["prueba_tecnica"] ?? 0,
      prefilterCompleted: all.filter((c) => c.prefilter_completed_at).length,
      prefilterInvited: all.filter((c) => c.prefilter_invited_at).length,
      top_candidates_enriched: enrichedTop,
    });
  } catch (err: any) {
    console.error("dashboard-stats error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
