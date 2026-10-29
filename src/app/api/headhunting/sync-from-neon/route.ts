/**
 * POST /api/headhunting/sync-from-neon
 *
 * Bridge: copia los candidatos del talent_pool de Neon (donde importamos
 * los 52 reales del Excel de Kelly) hacia ht_candidates de Supabase
 * (donde vive el sistema de assessment headhunting de Elevare).
 *
 * Idempotente: usa upsert por email. Asigna el client_id de Trading
 * Solutions y mapea cada candidato a su vacante correspondiente vía
 * el campo `tags` o `notes` del talent_pool.
 *
 * Llamar UNA VEZ después de configurar SUPABASE_SERVICE_ROLE_KEY:
 *   curl -X POST https://trading-solutions-careers.vercel.app/api/headhunting/sync-from-neon \
 *        -H "Authorization: Bearer $ADMIN_SECRET"
 */
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { supabaseAdmin, supabaseFromIncludingDeleted } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";

// IDs de Supabase verificados via /api/headhunting/vacancies el 2026-04-30
// Si Supabase cambia, re-correr ese endpoint para revalidar.
const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";
const TS_VACANCIES: Record<string, string> = {
  "inside-sales-support": "c25ce70b-9244-4393-aea6-75372a99a6ef",
  "senior-pricing-analyst": "368006e7-98da-46a2-b871-6b741290821b",
  "pricing-junior": "d354c55a-eb1c-4aee-bd02-b0a20162e1f1",
  "customer-documentation-specialist": "6e4838dd-8aea-4426-bd26-ea588f0f493a",
  "lead-accounting-finance": "8c246bb3-8244-4755-bf92-58c0c627821c",
  "talent-acquisition-lead": "70c39cab-adaf-49a0-b137-29d0ff9b56b0",
};

type NeonCandidate = {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  current_role: string | null;
  linkedin_url: string | null;
  location: string | null;
  languages: string | null;
  notes: string | null;
  tags: string | null;
  source: string | null;
  summary: string | null;
};

function detectVacancySlug(c: NeonCandidate): string | null {
  const haystack = `${c.tags ?? ""} ${c.notes ?? ""}`.toLowerCase();
  if (haystack.includes("inside sales") || haystack.includes("inside-sales-support")) {
    return "inside-sales-support";
  }
  if (haystack.includes("pricing senior") || haystack.includes("pricing sr") || haystack.includes("senior-pricing-analyst")) {
    return "senior-pricing-analyst";
  }
  if (haystack.includes("pricing junior") || haystack.includes("pricing jr") || haystack.includes("pricing-junior")) {
    return "pricing-junior";
  }
  if (haystack.includes("customer doc") || haystack.includes("documentation") || haystack.includes("customer-documentation")) {
    return "customer-documentation-specialist";
  }
  if (haystack.includes("lead accounting") || haystack.includes("finance officer") || haystack.includes("accounting finance")) {
    return "lead-accounting-finance";
  }
  if (haystack.includes("talent acquisition") || haystack.includes("development lead")) {
    return "talent-acquisition-lead";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const sql = neon(process.env.DATABASE_URL!);
  const result = {
    candidates_synced: 0,
    candidates_updated: 0,
    skipped_no_email: 0,
    unmapped: [] as string[],
    errors: [] as Array<{ email: string; reason: string }>,
  };

  try {
    const candidates = (await sql`
      SELECT id, full_name, email, phone, "current_role", linkedin_url, location,
             languages, notes, tags, source, summary
        FROM talent_pool
       WHERE status = 'active' AND email IS NOT NULL AND email != ''
       ORDER BY id`) as unknown as NeonCandidate[];

    for (const c of candidates) {
      try {
        if (!c.email) {
          result.skipped_no_email++;
          continue;
        }

        const slug = detectVacancySlug(c);
        const vacancyId = slug ? TS_VACANCIES[slug] : null;
        if (!vacancyId) {
          result.unmapped.push(`${c.full_name} (${c.email}) — slug=${slug ?? "?"}`);
          continue;
        }

        // ¿Ya existe en Supabase ht_candidates?
        const { data: existing } = await supabaseFromIncludingDeleted("ht_candidates")
          .select("id, status, deleted_at")
          .eq("client_id", TS_CLIENT_ID)
          .eq("vacancy_id", vacancyId)
          .eq("email", c.email)
          .limit(1)
          .maybeSingle();

        if (existing?.deleted_at) {
          // Oculto a propósito. No se duplica ni se restaura desde este sync.
          result.candidates_updated++;
          continue;
        }
        if (existing) {
          // No sobreescribir si ya completó la prueba o está en progreso
          if (existing.status === "completed" || existing.status === "in_progress") {
            result.candidates_updated++;
            continue;
          }
          // Actualizar datos básicos
          await supabaseAdmin
            .from("ht_candidates")
            .update({
              name: c.full_name,
              phone: c.phone,
              cv_url: c.linkedin_url,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          result.candidates_updated++;
        } else {
          // Insert nuevo en pending para que después se pueda invitar
          const { error: insErr } = await supabaseAdmin
            .from("ht_candidates")
            .insert({
              client_id: TS_CLIENT_ID,
              vacancy_id: vacancyId,
              name: c.full_name,
              email: c.email,
              phone: c.phone,
              cv_url: c.linkedin_url,
              status: "pending",
            });
          if (insErr) {
            result.errors.push({ email: c.email, reason: insErr.message });
          } else {
            result.candidates_synced++;
          }
        }
      } catch (e: unknown) {
        result.errors.push({
          email: c.email,
          reason: e instanceof Error ? e.message : "unknown",
        });
      }
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: "sync_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
