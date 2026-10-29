/**
 * POST /api/cv-parse/batch
 *
 * Parsea en lote todos los candidatos del talent_pool que todavía no tienen
 * cv_parsed_data (o todos si force=true).
 *
 * Body opcional:
 *   { limit?: number = 50, force?: boolean = false, concurrency?: number = 3 }
 *
 * Diseñado para correrse manualmente desde HR Admin con un botón
 * "Re-parsear todos". Corre con concurrencia limitada para no saturar
 * la API de Anthropic ni exceder el timeout de Vercel (60s por request).
 *
 * Response: resumen con contadores + errores por candidato.
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

export const maxDuration = 60;   // Vercel: hasta 60s en plan Pro
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

type Body = {
  limit?: number;
  force?: boolean;
  concurrency?: number;
};

/**
 * Itera con concurrencia controlada. No uso Promise.all directo porque
 * con 100 candidatos × Claude call → rate limit + timeout.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const myIdx = cursor++;
      results[myIdx] = await worker(items[myIdx], myIdx);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(req);
  if (authError) return authError;

  const body = (await req.json().catch(() => ({}))) as Body;
  const limit = Math.min(body.limit ?? 50, 200);
  const concurrency = Math.min(Math.max(body.concurrency ?? 3, 1), 8);
  const force = body.force === true;

  const sql = neon(process.env.DATABASE_URL!);

  const candidates = force
    ? await sql`SELECT * FROM talent_pool WHERE status = 'active' ORDER BY id DESC LIMIT ${limit}`
    : await sql`SELECT * FROM talent_pool
                 WHERE status = 'active' AND cv_parsed_data IS NULL
                 ORDER BY id DESC LIMIT ${limit}`;

  const summary = {
    total_candidates: candidates.length,
    parsed_ok: 0,
    parsed_failed: 0,
    cached_skipped: 0,
    errors: [] as Array<{ id: number; name: string; reason: string }>,
    started_at: new Date().toISOString(),
  };

  await mapWithConcurrency(
    candidates as Array<Record<string, unknown>>,
    concurrency,
    async (row) => {
      const id = row.id as number;
      const name = (row.full_name as string) || "Candidato";
      try {
        const text = buildCandidateText(row as Parameters<typeof buildCandidateText>[0]);
        const parsed = await parseCV(name, text);
        await sql`
          UPDATE talent_pool
             SET cv_parsed_data = ${JSON.stringify(parsed)}::jsonb,
                 cv_parsed_at = NOW(),
                 current_role = COALESCE(NULLIF(current_role, ''), ${parsed.current_title ?? null}),
                 years_experience = COALESCE(years_experience, ${parsed.years_experience ?? null}),
                 education = COALESCE(NULLIF(education, ''), ${parsed.education_field ?? null}),
                 updated_at = NOW()
           WHERE id = ${id}`;
        summary.parsed_ok++;
      } catch (e: unknown) {
        summary.parsed_failed++;
        summary.errors.push({
          id,
          name,
          reason: e instanceof Error ? e.message.slice(0, 300) : "unknown",
        });
      }
    }
  );

  return NextResponse.json(
    { ...summary, finished_at: new Date().toISOString() },
    { headers: corsHeaders }
  );
}
