/**
 * /api/assessments/[token]
 *   GET   → datos del token (para la pantalla del candidato y para resultados)
 *   PATCH → actualizar status / score / results
 */
import { neon } from "@/lib/sql";
import { NextRequest, NextResponse } from "next/server";
import { isPreviewTestMode, previewTestJson } from "@/lib/preview-mode";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT a.*, v.title_es AS vacancy_title_es, v.title_en AS vacancy_title_en, v.slug AS vacancy_slug
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
    if (t.expires_at && new Date(t.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "expired", expired_at: t.expires_at },
        { status: 410, headers: corsHeaders }
      );
    }
    return NextResponse.json({ data: t }, { headers: corsHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { error: "fetch_failed", detail: msg },
      { status: 500, headers: corsHeaders }
    );
  }
}

type PatchBody = {
  status?: "sent" | "in_progress" | "completed" | "expired";
  score?: number;
  results?: unknown;
  started_at?: string;
  completed_at?: string;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const body = (await req.json()) as PatchBody;
    if (isPreviewTestMode()) {
      return previewTestJson("PATCH /api/assessments/[token]");
    }
    const sql = neon(process.env.DATABASE_URL!);

    // Update auto-timestamps cuando cambia el status
    const status = body.status;
    const startedAt =
      body.started_at ?? (status === "in_progress" ? new Date().toISOString() : null);
    const completedAt =
      body.completed_at ?? (status === "completed" ? new Date().toISOString() : null);

    const rows = await sql`
      UPDATE assessment_tokens SET
        status        = COALESCE(${status ?? null}, status),
        score         = COALESCE(${body.score ?? null}, score),
        results       = COALESCE(${body.results ? JSON.stringify(body.results) : null}::jsonb, results),
        started_at    = COALESCE(${startedAt}::timestamp, started_at),
        completed_at  = COALESCE(${completedAt}::timestamp, completed_at)
       WHERE token = ${params.token}
       RETURNING *`;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: corsHeaders }
      );
    }
    return NextResponse.json({ data: rows[0] }, { headers: corsHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { error: "update_failed", detail: msg },
      { status: 500, headers: corsHeaders }
    );
  }
}
