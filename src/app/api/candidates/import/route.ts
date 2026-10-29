/**
 * POST /api/candidates/import
 *
 * Importa candidatos desde un CSV exportado de LinkedIn Recruiter / Talent Hub.
 *
 * El CSV típico de LinkedIn tiene las columnas:
 *   First Name, Last Name, Email, Phone, Current Company, Current Title,
 *   LinkedIn URL, Location, Connection Degree, Notes
 *
 * Aceptamos también un JSON array si viene desde un upload de pegado.
 *
 * Body (JSON):
 *   {
 *     candidates: [{ first_name, last_name, email, phone?, company?, title?, linkedin_url?, location?, notes? }],
 *     vacancy_id?: number,
 *     source?: string  // "linkedin_recruiter", "linkedin_easy_apply", "manual", etc.
 *   }
 */
import { neon } from "@neondatabase/serverless";
import { requireAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { prefilter, toPrefilterData, VACANCY_CONFIG } from "@/lib/agent/prefilter";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

type Candidate = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email: string;
  phone?: string;
  company?: string;
  title?: string;
  linkedin_url?: string;
  location?: string;
  notes?: string;
};

type Body = {
  candidates: Candidate[];
  vacancy_id?: number;
  source?: string;
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
    if (!body.candidates || !Array.isArray(body.candidates) || body.candidates.length === 0) {
      return NextResponse.json(
        { error: "missing_candidates" },
        { status: 400, headers: corsHeaders }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);
    const source = body.source ?? "linkedin_recruiter";
    const inserted: Array<{ id: number; email: string }> = [];
    const skipped: Array<{ email: string; reason: string }> = [];

    for (const c of body.candidates) {
      if (!c.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) {
        skipped.push({ email: c.email ?? "(empty)", reason: "invalid_email" });
        continue;
      }
      const email = c.email.toLowerCase().trim();
      const fullName =
        c.full_name ?? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
      if (!fullName) {
        skipped.push({ email, reason: "missing_name" });
        continue;
      }

      // Upsert en talent_pool (única por email)
      const existing = await sql`SELECT id FROM talent_pool WHERE email = ${email} LIMIT 1`;
      if (existing.length > 0) {
        const id = existing[0].id as number;
        await sql`
          UPDATE talent_pool SET
            full_name       = ${fullName},
            phone           = COALESCE(${c.phone ?? null}, phone),
            "current_role"  = COALESCE(${c.title ?? null}, "current_role"),
            linkedin_url    = COALESCE(${c.linkedin_url ?? null}, linkedin_url),
            location        = COALESCE(${c.location ?? null}, location),
            notes           = COALESCE(${c.notes ?? null}, notes),
            source          = ${source},
            updated_at      = NOW()
           WHERE id = ${id}`;
        inserted.push({ id, email });
      } else {
        const rows = await sql`
          INSERT INTO talent_pool (
            full_name, email, phone, "current_role", linkedin_url, location,
            notes, source, status
          ) VALUES (
            ${fullName}, ${email}, ${c.phone ?? null}, ${c.title ?? null},
            ${c.linkedin_url ?? null}, ${c.location ?? null},
            ${c.notes ?? null}, ${source}, 'active'
          )
          RETURNING id, email`;
        inserted.push({ id: rows[0].id as number, email: rows[0].email as string });
      }

      // ─── Si vino vacancy_id, crear ALSO una application + prefilter ───
      if (body.vacancy_id) {
        const vacancyId = body.vacancy_id;
        const vacancy = VACANCY_CONFIG[vacancyId];
        const jobTitle = vacancy?.job_title ?? `Vacancy ${vacancyId}`;

        // Evitar duplicados: solo insertar si no existe app con ese email para esa vacante
        const existingApp = await sql`
          SELECT id FROM applications
          WHERE email = ${email} AND job_id = ${vacancyId}
          LIMIT 1
        `;

        if (existingApp.length === 0) {
          const pf = prefilter({
            full_name: fullName,
            email,
            phone: c.phone ?? null,
            linkedin: c.linkedin_url ?? null,
            why_ts: c.notes ?? null,
            cv_data: null,
            job_id: vacancyId,
          });
          await sql`
            INSERT INTO applications (
              job_id, job_title, full_name, email, phone, linkedin, why_ts,
              status, score, prefilter_data
            ) VALUES (
              ${vacancyId}, ${jobTitle}, ${fullName}, ${email},
              ${c.phone ?? null}, ${c.linkedin_url ?? null}, ${c.notes ?? null},
              ${pf.decision}, ${pf.score}, ${JSON.stringify(toPrefilterData(pf))}::jsonb
            )
          `;
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        imported: inserted.length,
        skipped: skipped.length,
        candidates: inserted,
        errors: skipped,
        vacancy_linked: body.vacancy_id ?? null,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { error: "import_failed", detail: msg },
      { status: 500, headers: corsHeaders }
    );
  }
}
