/**
 * POST /api/seed/attraction-tracking
 *
 * Importa el pipeline real de Trading Solutions desde el JSON construido
 * a partir de los XLSX de Kelly (52 candidatos · 4 assessments completados ·
 * 5 invitados/expirados · 8 leads de LinkedIn headhunting).
 *
 * Idempotente: usa upsert por email. Llamar varias veces no duplica.
 *
 * Pobla:
 *   - talent_pool          → todos los candidatos (con tags, notes, scores)
 *   - assessment_tokens    → todos los que tienen Eval Online o Match% real
 *
 * Llamar UNA VEZ después del deploy:
 *   curl -X POST https://trading-solutions-careers.vercel.app/api/seed/attraction-tracking
 */
import { neon } from "@neondatabase/serverless";
import { requireAdmin } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import seedData from "@/data/seed/attraction_tracking.json";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

type PipelineRow = {
  name: string;
  email: string | null;
  phone: string | null;
  source: string;
  best_fit: string;
  vacancy_slug: string | null;
  vacancy_id: number | null;
  vacancy_applied: string;
  match_level: string;
  score_cv: number | null;
  pre_screening: string;
  eval_online: string;
  english: string;
  salary_cop: string;
  estado_actual: string;
  status: string;
  strengths: string;
  opportunities: string;
  justification: string;
  next_step: string;
  observations: string;
};

type ScoreRow = {
  match_pct: number;
  recommendation: string;
  iq: number | null;
  disc_d: number | null;
  disc_i: number | null;
  red_flags: string;
  completed_on: string;
  status: string;
};

type TokenStatusRow = {
  status: string;
  expires: string;
  source: string;
  notes: string;
};

function generateToken(): string {
  return `ats-${randomBytes(8).toString("hex")}-${Date.now().toString(36)}`;
}

export async function POST() {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const data = seedData as {
    pipeline: PipelineRow[];
    assessment_scores: Record<string, ScoreRow>;
    assessment_tokens: Record<string, TokenStatusRow>;
  };

  const result = {
    candidates_imported: 0,
    candidates_updated: 0,
    candidates_skipped_no_email: 0,
    tokens_created: 0,
    tokens_updated: 0,
    by_vacancy: {} as Record<string, number>,
    errors: [] as Array<{ name: string; reason: string }>,
  };

  for (const c of data.pipeline) {
    if (!c.email) {
      result.candidates_skipped_no_email++;
      continue;
    }
    try {
      // Tags = best_fit + match_level + english (info útil para search/filtro)
      const tags = [
        c.best_fit,
        c.match_level && `Match: ${c.match_level}`,
        c.english && `EN: ${c.english}`,
        c.vacancy_slug,
      ]
        .filter(Boolean)
        .join(", ");

      // Notes = observaciones + justificación (resumen para el reclutador)
      const notes = [
        c.observations,
        c.estado_actual && `[Estado] ${c.estado_actual}`,
        c.next_step && `[Siguiente] ${c.next_step}`,
        c.justification && `[Justificación] ${c.justification}`,
        c.strengths && `[Fortalezas] ${c.strengths}`,
        c.opportunities && `[Oportunidades] ${c.opportunities}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const summary = c.justification || c.observations || "";

      // Upsert por email
      const exists = await sql`SELECT id FROM talent_pool WHERE email = ${c.email} LIMIT 1`;
      if (exists.length > 0) {
        const id = exists[0].id as number;
        await sql`
          UPDATE talent_pool SET
            full_name      = ${c.name},
            phone          = COALESCE(${c.phone}, phone),
            languages      = ${c.english || null},
            location       = COALESCE(${"Barranquilla"}, location),
            summary        = ${summary},
            tags           = ${tags},
            notes          = ${notes},
            source         = ${c.source.toLowerCase().includes("linkedin") ? "linkedin" : "email"},
            status         = 'active',
            updated_at     = NOW()
           WHERE id = ${id}`;
        result.candidates_updated++;
      } else {
        await sql`
          INSERT INTO talent_pool (
            full_name, email, phone, languages, location,
            summary, tags, notes, source, status
          ) VALUES (
            ${c.name},
            ${c.email},
            ${c.phone},
            ${c.english || null},
            ${"Barranquilla"},
            ${summary},
            ${tags},
            ${notes},
            ${c.source.toLowerCase().includes("linkedin") ? "linkedin" : "email"},
            'active'
          )`;
        result.candidates_imported++;
      }

      // contar por vacante
      const k = c.vacancy_slug ?? "sin_vacante";
      result.by_vacancy[k] = (result.by_vacancy[k] ?? 0) + 1;

      // ¿Crear assessment_token?
      // Tres casos:
      //   A) tiene Eval Online "Completada" o "En progreso" o "Enviada"
      //   B) está en assessment_scores (caso real con Match%)
      //   C) está en assessment_tokens (Invitado/Expirado)
      const hasEval = ["Completada", "En progreso", "Enviada", "Pendiente"].includes(c.eval_online);
      const score = data.assessment_scores[c.email];
      const tokenStatus = data.assessment_tokens[c.email];

      if (hasEval || score || tokenStatus) {
        const candidateRow = await sql`SELECT id FROM talent_pool WHERE email = ${c.email} LIMIT 1`;
        const candidateId = candidateRow[0]?.id as number;

        // ¿Ya existe un token para este email + vacancy_id?
        const existingToken = await sql`
          SELECT id, token FROM assessment_tokens
           WHERE candidate_email = ${c.email}
             AND (vacancy_id = ${c.vacancy_id ?? null} OR vacancy_id IS NULL)
           ORDER BY sent_at DESC LIMIT 1`;

        let finalStatus = "sent";
        if (score) finalStatus = "completed";
        else if (tokenStatus?.status === "expired") finalStatus = "expired";
        else if (tokenStatus?.status === "in_progress") finalStatus = "in_progress";
        else if (c.eval_online === "Completada") finalStatus = "completed";
        else if (c.eval_online === "En progreso") finalStatus = "in_progress";

        const finalScore = score?.match_pct
          ? Math.round(score.match_pct)
          : c.score_cv && Number.isFinite(c.score_cv)
          ? c.score_cv
          : null;

        const resultsBlob = score
          ? {
              match_pct: score.match_pct,
              recommendation: score.recommendation,
              iq: score.iq,
              disc_d: score.disc_d,
              disc_i: score.disc_i,
              red_flags: score.red_flags,
            }
          : null;

        if (existingToken.length > 0) {
          await sql`
            UPDATE assessment_tokens SET
              candidate_id = ${candidateId},
              status       = ${finalStatus},
              score        = COALESCE(${finalScore}, score),
              results      = COALESCE(${resultsBlob ? JSON.stringify(resultsBlob) : null}::jsonb, results),
              completed_at = ${finalStatus === "completed" ? new Date().toISOString() : null}::timestamp
             WHERE id = ${existingToken[0].id as number}`;
          result.tokens_updated++;
        } else {
          const token = generateToken();
          await sql`
            INSERT INTO assessment_tokens (
              token, candidate_id, candidate_name, candidate_email,
              vacancy_id, vacancy_slug, assessment_ids, language, status, score,
              results, source, completed_at
            ) VALUES (
              ${token},
              ${candidateId},
              ${c.name},
              ${c.email},
              ${c.vacancy_id ?? null},
              ${c.vacancy_slug},
              ${"factor_x_ts"},
              'es',
              ${finalStatus},
              ${finalScore},
              ${resultsBlob ? JSON.stringify(resultsBlob) : null}::jsonb,
              ${c.source.toLowerCase().includes("linkedin") ? "linkedin" : "email"},
              ${finalStatus === "completed" ? new Date().toISOString() : null}::timestamp
            )`;
          result.tokens_created++;
        }
      }
    } catch (e: unknown) {
      result.errors.push({
        name: c.name,
        reason: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  return NextResponse.json(result, { headers: corsHeaders });
}
