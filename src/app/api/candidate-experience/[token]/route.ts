/**
 * GET  /api/candidate-experience/[token] → fetch survey state (público)
 * POST /api/candidate-experience/[token] → submit responses (público)
 *
 * No requiere auth — el token es la credencial.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewTestMode, previewTestJson } from "@/lib/preview-mode";

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  const { data, error } = await supabaseAdmin
    .from("ts_candidate_experience")
    .select("id, token, outcome, submitted_at, expires_at, candidate_id, vacancy_id")
    .eq("token", token)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: "Esta encuesta expiró" }, { status: 410 });
  }

  // Get candidate name + vacancy title (no email)
  const { data: cand } = await supabaseAdmin
    .from("ht_candidates")
    .select("name")
    .eq("id", data.candidate_id)
    .maybeSingle();

  const { data: vac } = data.vacancy_id
    ? await supabaseAdmin.from("ht_vacancies").select("title").eq("id", data.vacancy_id).maybeSingle()
    : { data: null };

  return NextResponse.json({
    survey_id: data.id,
    outcome: data.outcome,
    already_submitted: !!data.submitted_at,
    candidate_first_name: cand?.name?.split(' ')[0] || null,
    vacancy_title: vac?.title || null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    const body = await req.json();

    // Validate token
    const { data: existing, error } = await supabaseAdmin
      .from("ts_candidate_experience")
      .select("id, submitted_at, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });
    if (existing.submitted_at) {
      return NextResponse.json({ error: "Esta encuesta ya fue respondida" }, { status: 409 });
    }
    if (existing.expires_at && new Date(existing.expires_at) < new Date()) {
      return NextResponse.json({ error: "Esta encuesta expiró" }, { status: 410 });
    }

    // Sanitize input
    const ratingFields = ['process_clarity', 'comm_quality', 'assessment_experience', 'recruiter_helpfulness', 'interview_quality'] as const;
    const updates: any = {
      submitted_at: new Date().toISOString(),
      nps_score: clampInt(body.nps_score, 0, 10),
      would_recommend_company: typeof body.would_recommend_company === 'boolean' ? body.would_recommend_company : null,
      comments: typeof body.comments === 'string' ? body.comments.slice(0, 2000) : null,
      improvement_suggestions: typeof body.improvement_suggestions === 'string' ? body.improvement_suggestions.slice(0, 2000) : null,
    };
    for (const f of ratingFields) {
      updates[f] = clampInt(body[f], 1, 5);
    }

    if (isPreviewTestMode()) {
      return previewTestJson("POST /api/candidate-experience/[token]");
    }

    const { error: upErr } = await supabaseAdmin
      .from("ts_candidate_experience")
      .update(updates)
      .eq("id", existing.id);

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("submit experience survey error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}

function clampInt(n: any, min: number, max: number): number | null {
  const i = Number(n);
  if (Number.isNaN(i)) return null;
  return Math.max(min, Math.min(max, Math.round(i)));
}
