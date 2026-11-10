/**
 * GET  /api/candidate-experience/[token] → fetch survey state (público)
 * POST /api/candidate-experience/[token] → submit responses (público)
 *
 * No requiere auth — el token es la credencial.
 * vacancy_id puede no existir en Supabase. El select lo omite en ese caso
 * y el título sale de ht_candidates. El candidato no ve el texto de la base.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewTestMode, previewTestJson } from "@/lib/preview-mode";
import {
  shouldDropVacancyId,
  surveyLoadBody,
  surveySendBody,
} from "@/lib/candidate-public-error";

const SURVEY_COLUMNS = "id, token, outcome, submitted_at, expires_at, candidate_id";

type SurveyRow = {
  id: string;
  token: string;
  outcome: string | null;
  submitted_at: string | null;
  expires_at: string | null;
  candidate_id: string;
  vacancy_id?: string | null;
};

async function loadSurvey(token: string): Promise<{ row: SurveyRow | null; missing: boolean; failed: boolean }> {
  const withVacancy = await supabaseAdmin
    .from("ts_candidate_experience")
    .select(`${SURVEY_COLUMNS}, vacancy_id`)
    .eq("token", token)
    .maybeSingle();

  if (!withVacancy.error) {
    return { row: (withVacancy.data as SurveyRow | null) ?? null, missing: false, failed: false };
  }
  if (!shouldDropVacancyId(withVacancy.error)) {
    console.error("candidate-experience load", withVacancy.error);
    return { row: null, missing: false, failed: true };
  }

  const fallback = await supabaseAdmin
    .from("ts_candidate_experience")
    .select(SURVEY_COLUMNS)
    .eq("token", token)
    .maybeSingle();
  if (fallback.error) {
    console.error("candidate-experience load fallback", fallback.error);
    return { row: null, missing: false, failed: true };
  }
  return {
    row: fallback.data ? { ...(fallback.data as SurveyRow), vacancy_id: null } : null,
    missing: false,
    failed: false,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const loaded = await loadSurvey(params.token);
    if (loaded.failed) return NextResponse.json(surveyLoadBody(), { status: 500 });
    const data = loaded.row;
    if (!data) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ error: "Esta encuesta expiró" }, { status: 410 });
    }

    const { data: cand } = await supabaseAdmin
      .from("ht_candidates")
      .select("name, vacancy_id")
      .eq("id", data.candidate_id)
      .maybeSingle();

    const vacancyId = data.vacancy_id || cand?.vacancy_id || null;
    const { data: vac } = vacancyId
      ? await supabaseAdmin.from("ht_vacancies").select("title").eq("id", vacancyId).maybeSingle()
      : { data: null };

    return NextResponse.json({
      survey_id: data.id,
      outcome: data.outcome,
      already_submitted: !!data.submitted_at,
      candidate_first_name: cand?.name?.split(" ")[0] || null,
      vacancy_title: vac?.title || null,
    });
  } catch (err) {
    console.error("candidate-experience GET", err);
    return NextResponse.json(surveyLoadBody(), { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    const body = await req.json();

    const { data: existing, error } = await supabaseAdmin
      .from("ts_candidate_experience")
      .select("id, submitted_at, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("candidate-experience POST lookup", error);
      return NextResponse.json(surveySendBody(), { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });
    if (existing.submitted_at) {
      return NextResponse.json({ error: "Esta encuesta ya fue respondida" }, { status: 409 });
    }
    if (existing.expires_at && new Date(existing.expires_at) < new Date()) {
      return NextResponse.json({ error: "Esta encuesta expiró" }, { status: 410 });
    }

    const ratingFields = ["process_clarity", "comm_quality", "assessment_experience", "recruiter_helpfulness", "interview_quality"] as const;
    const updates: Record<string, unknown> = {
      submitted_at: new Date().toISOString(),
      nps_score: clampInt(body.nps_score, 0, 10),
      would_recommend_company: typeof body.would_recommend_company === "boolean" ? body.would_recommend_company : null,
      comments: typeof body.comments === "string" ? body.comments.slice(0, 2000) : null,
      improvement_suggestions: typeof body.improvement_suggestions === "string" ? body.improvement_suggestions.slice(0, 2000) : null,
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

    if (upErr) {
      console.error("candidate-experience POST update", upErr);
      return NextResponse.json(surveySendBody(), { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("submit experience survey error:", err);
    return NextResponse.json(surveySendBody(), { status: 500 });
  }
}

function clampInt(n: unknown, min: number, max: number): number | null {
  const i = Number(n);
  if (Number.isNaN(i)) return null;
  return Math.max(min, Math.min(max, Math.round(i)));
}
