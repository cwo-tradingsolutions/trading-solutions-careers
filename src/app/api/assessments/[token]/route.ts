/**
 * /api/assessments/[token]
 *   GET   → campos que pinta la pantalla del candidato
 *   PATCH → el servidor marca in_progress al abrir un token "sent".
 *           score, results y status que mande el cliente se ignoran.
 */
import { neon } from "@/lib/sql";
import { NextRequest, NextResponse } from "next/server";
import { isPreviewTestMode, previewTestJson } from "@/lib/preview-mode";
import { publicStepBody } from "@/lib/candidate-public-error";
import {
  assessmentCandidateWrite,
  publicAssessmentView,
  type PublicAssessment,
} from "@/lib/assessment-token-public";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

function expired(row: { expires_at?: string | null }) {
  return Boolean(row.expires_at && new Date(row.expires_at) < new Date());
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT a.token, a.candidate_name, a.vacancy_slug, a.assessment_ids, a.language, a.status, a.expires_at,
             v.title_es AS vacancy_title_es, v.title_en AS vacancy_title_en
        FROM assessment_tokens a
        LEFT JOIN vacancies v ON v.id = a.vacancy_id
       WHERE a.token = ${params.token}
       LIMIT 1`;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: corsHeaders }
      );
    }
    const t = rows[0];
    if (expired(t)) {
      return NextResponse.json(
        { error: "expired" },
        { status: 410, headers: corsHeaders }
      );
    }
    return NextResponse.json({ data: publicAssessmentView(t) }, { headers: corsHeaders });
  } catch (e: unknown) {
    console.error("assessments token GET", e);
    return NextResponse.json(publicStepBody(), { status: 500, headers: corsHeaders });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const body = await req.json().catch(() => ({}));
    if (isPreviewTestMode()) {
      return previewTestJson("PATCH /api/assessments/[token]");
    }
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT a.token, a.candidate_name, a.vacancy_slug, a.assessment_ids, a.language, a.status, a.expires_at,
             v.title_es AS vacancy_title_es, v.title_en AS vacancy_title_en
        FROM assessment_tokens a
        LEFT JOIN vacancies v ON v.id = a.vacancy_id
       WHERE a.token = ${params.token}
       LIMIT 1`;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: corsHeaders }
      );
    }
    const current = rows[0];
    if (expired(current)) {
      return NextResponse.json(
        { error: "expired" },
        { status: 410, headers: corsHeaders }
      );
    }

    const write = assessmentCandidateWrite(current, body);
    let view: PublicAssessment = publicAssessmentView(current);
    if (write) {
      const updated = await sql`
        UPDATE assessment_tokens SET
          status = ${write.status},
          started_at = COALESCE(started_at, ${write.startedAt}::timestamp)
         WHERE token = ${params.token}
           AND status = 'sent'
         RETURNING token, status`;
      if (updated.length > 0) {
        view = publicAssessmentView({ ...current, status: write.status });
      }
    }
    return NextResponse.json({ data: view }, { headers: corsHeaders });
  } catch (e: unknown) {
    console.error("assessments token PATCH", e);
    return NextResponse.json(publicStepBody(), { status: 500, headers: corsHeaders });
  }
}
