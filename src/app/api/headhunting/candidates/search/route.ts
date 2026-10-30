/**
 * GET /api/headhunting/candidates/search
 *
 * Buscador de candidatos por:
 *   - q: nombre, email, current_job_role
 *   - vacancy_id: filtra por vacante
 *   - stage: filtra por stage
 *   - status: invited / completed / rejected / in_progress / etc.
 *   - days: candidatos creados en los últimos N días
 *
 * min_score / max_score se aceptan y se ignoran: overall_score no es columna
 * de ht_candidates (vive en entrevistas / assessments / diagnostics).
 *
 * Excluye candidatos internos (@tradingsolutions.com).
 * Devuelve hasta 50 resultados ordenados por updated_at.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const vacancyId = url.searchParams.get("vacancy_id") || null;
    const stage = url.searchParams.get("stage") || null;
    const status = url.searchParams.get("status") || null;
    // min_score / max_score stay on the query string and are ignored:
    // overall_score is not a column on ht_candidates.
    const days = url.searchParams.get("days");
    const limit = Math.min(50, Number(url.searchParams.get("limit") || 25));

    let query = supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, phone, current_job_role, vacancy_id, stage, status, created_at, updated_at, ht_vacancies(title, area)")
      .not("email", "ilike", "%@tradingsolutions.com")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (q) {
      // Strip wildcard and PostgREST .or() delimiters so the filter stays one clause.
      const safe = q.replace(/[%_,()]/g, '');
      query = query.or(
        `name.ilike.%${safe}%,email.ilike.%${safe}%,current_job_role.ilike.%${safe}%`
      );
    }
    if (vacancyId) query = query.eq("vacancy_id", vacancyId);
    if (stage) query = query.eq("stage", stage);
    if (status) query = query.eq("status", status);
    if (days) {
      const since = new Date();
      since.setDate(since.getDate() - Number(days));
      query = query.gte("created_at", since.toISOString());
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      current_role: c.current_job_role ?? null,
      vacancy_id: c.vacancy_id,
      vacancy_title: c.ht_vacancies?.title || null,
      vacancy_area: c.ht_vacancies?.area || null,
      stage: c.stage,
      status: c.status,
      overall_score: null,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    return NextResponse.json({ results, count: results.length, query: q });
  } catch (err: any) {
    console.error("candidate search error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
