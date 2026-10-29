/**
 * POST /api/cv-parse
 *
 * Parsea el CV/perfil de UN candidato con Claude y guarda el resultado
 * estructurado en talent_pool.cv_parsed_data.
 *
 * Body: { candidate_id: number } | { email: string } | { force?: boolean }
 *
 * Response: { data: { ...row, cv_parsed_data }, cost_estimate_usd }
 *
 * Si force=false (default) y cv_parsed_at existe, devuelve el cache.
 * Si force=true, re-parsea.
 */
import { neon } from "@neondatabase/serverless";
import { requireAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { parseCV, buildCandidateText } from "@/lib/cv-parser";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

type Body = {
  candidate_id?: number;
  email?: string;
  force?: boolean;
};

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = (await req.json()) as Body;
    if (!body.candidate_id && !body.email) {
      return NextResponse.json(
        { error: "missing_fields", required: ["candidate_id or email"] },
        { status: 400, headers: corsHeaders }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);
    const rows = body.candidate_id
      ? await sql`SELECT * FROM talent_pool WHERE id = ${body.candidate_id} LIMIT 1`
      : await sql`SELECT * FROM talent_pool WHERE email = ${body.email!.toLowerCase()} LIMIT 1`;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "candidate_not_found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const row = rows[0] as Record<string, unknown>;
    const candidateId = row.id as number;
    const candidateName = (row.full_name as string) || "Candidato";

    // Cache hit: ya está parseado y no se pidió force
    if (row.cv_parsed_at && !body.force) {
      return NextResponse.json(
        {
          data: row,
          cached: true,
          parsed_at: row.cv_parsed_at,
        },
        { headers: corsHeaders }
      );
    }

    // Build input + llamar Claude
    const candidateText = buildCandidateText(row as Parameters<typeof buildCandidateText>[0]);
    const parsed = await parseCV(candidateName, candidateText);

    // Guardar
    const updated = await sql`
      UPDATE talent_pool
         SET cv_parsed_data = ${JSON.stringify(parsed)}::jsonb,
             cv_parsed_at = NOW(),
             current_role = COALESCE(NULLIF(current_role, ''), ${parsed.current_title ?? null}),
             years_experience = COALESCE(years_experience, ${parsed.years_experience ?? null}),
             education = COALESCE(NULLIF(education, ''), ${parsed.education_field ?? null}),
             updated_at = NOW()
       WHERE id = ${candidateId}
       RETURNING *`;

    return NextResponse.json(
      {
        data: updated[0],
        cached: false,
        parsed,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    console.error("cv-parse error:", msg);
    return NextResponse.json(
      { error: "parse_failed", detail: msg },
      { status: 500, headers: corsHeaders }
    );
  }
}
