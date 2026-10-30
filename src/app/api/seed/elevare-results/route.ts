/**
 * POST /api/seed/elevare-results
 *
 * Importa los resultados de las evaluaciones que YA hicieron los candidatos
 * en Elevare (file Resultados_Evaluaciones_TS_22Abr.xlsx).
 *
 * - 22 completed con scores completos (DISC, IQ, Big Five, BETESA, McClelland, cognitivo)
 * - 3 expired (token expiró sin completar)
 * - 8 in_progress (token enviado, no terminado)
 *
 * Idempotente: usa upsert por candidato+vacante. NO duplica tokens.
 * Crea el candidato en talent_pool si no existe.
 *
 * Llamar UNA VEZ:
 *   curl -X POST https://trading-solutions-careers.vercel.app/api/seed/elevare-results
 */
import { neon } from "@/lib/sql";
import { requireAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { isPreviewTestMode, previewTestJson } from "@/lib/preview-mode";
import { randomBytes } from "crypto";
import seedData from "@/data/seed/elevare_results.json";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

type ElevareRow = {
  candidate_name: string;
  candidate_email: string;
  phone: string | null;
  vacancy_slug: string;
  vacancy_id: number;
  status: "completed" | "expired" | "in_progress" | "sent";
  completed_at: string | null;
  match_pct: number | null;
  recommendation: string | null;
  results_blob?: unknown;
};

function generateToken(): string {
  return `ats-${randomBytes(8).toString("hex")}-${Date.now().toString(36)}`;
}

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  if (isPreviewTestMode()) return previewTestJson("POST /api/seed/elevare-results");

  const sql = neon(process.env.DATABASE_URL!);
  const data = seedData as { results: ElevareRow[] };

  const result = {
    candidates_created: 0,
    candidates_existed: 0,
    tokens_created: 0,
    tokens_updated: 0,
    by_status: {} as Record<string, number>,
    errors: [] as Array<{ name: string; reason: string }>,
  };

  for (const r of data.results) {
    try {
      // 1) Upsert candidato en talent_pool
      const exists = await sql`
        SELECT id FROM talent_pool WHERE email = ${r.candidate_email} LIMIT 1`;
      let candidateId: number;
      if (exists.length > 0) {
        candidateId = exists[0].id as number;
        result.candidates_existed++;
      } else {
        const ins = await sql`
          INSERT INTO talent_pool (
            full_name, email, phone, location, source, status, summary
          ) VALUES (
            ${r.candidate_name},
            ${r.candidate_email},
            ${r.phone},
            'Barranquilla',
            'elevare_assessment',
            'active',
            ${`Match ${r.match_pct ?? "—"}% · Recomendación: ${r.recommendation ?? "—"}`}
          )
          RETURNING id`;
        candidateId = ins[0].id as number;
        result.candidates_created++;
      }

      // 2) Upsert assessment_token
      const existingTok = await sql`
        SELECT id FROM assessment_tokens
         WHERE candidate_email = ${r.candidate_email}
           AND vacancy_id = ${r.vacancy_id}
         ORDER BY sent_at DESC LIMIT 1`;

      const completedAt =
        r.status === "completed" && r.completed_at ? r.completed_at : null;
      const score = r.match_pct ? Math.round(r.match_pct) : null;
      const resultsJson = r.results_blob ? JSON.stringify(r.results_blob) : null;

      if (existingTok.length > 0) {
        await sql`
          UPDATE assessment_tokens SET
            candidate_id  = ${candidateId},
            status        = ${r.status},
            score         = COALESCE(${score}, score),
            results       = COALESCE(${resultsJson}::jsonb, results),
            completed_at  = COALESCE(${completedAt}::timestamp, completed_at),
            source        = 'elevare'
           WHERE id = ${existingTok[0].id as number}`;
        result.tokens_updated++;
      } else {
        const token = generateToken();
        await sql`
          INSERT INTO assessment_tokens (
            token, candidate_id, candidate_name, candidate_email,
            vacancy_id, vacancy_slug, assessment_ids, language,
            status, score, results, source,
            sent_at, completed_at
          ) VALUES (
            ${token},
            ${candidateId},
            ${r.candidate_name},
            ${r.candidate_email},
            ${r.vacancy_id},
            ${r.vacancy_slug},
            'factor_x_ts',
            'es',
            ${r.status},
            ${score},
            ${resultsJson}::jsonb,
            'elevare',
            ${completedAt ?? new Date().toISOString()}::timestamp,
            ${completedAt}::timestamp
          )`;
        result.tokens_created++;
      }

      result.by_status[r.status] = (result.by_status[r.status] ?? 0) + 1;
    } catch (e: unknown) {
      result.errors.push({
        name: r.candidate_name,
        reason: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  return NextResponse.json(result, { headers: corsHeaders });
}
