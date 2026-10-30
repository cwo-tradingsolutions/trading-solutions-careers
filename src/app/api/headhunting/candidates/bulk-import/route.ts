/**
 * POST /api/headhunting/candidates/bulk-import
 *
 * Importa masivamente candidatos al ATS con cruce automático contra ht_candidates
 * existentes. Pensado para LinkedIn Recruiter exports + otros job boards.
 *
 * Body:
 * {
 *   candidates: [{
 *     name, email, phone?, location?, headline?,
 *     current_role?, current_company?, role_start?,
 *     education?, institution?, linkedin_url?,
 *     applied_at?, job_title (mapea a vacancy_id), salary_question?
 *   }],
 *   default_stage?: 'aplico' (default),
 *   dry_run?: boolean
 * }
 *
 * - Cruce por email (lowercase)
 * - Si email existe → reporta como 'existing' (no toca; preserva stage actual)
 * - Auto-mapea vacancy por job_title
 * - Stores LinkedIn URL + headline en notes/metadata para enriquecer
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin, supabaseFromIncludingDeleted } from "@/lib/supabase";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

// Mapeo job_title → vacancy_id (verificados en Supabase)
const VACANCY_MAP: Record<string, string> = {
  "inside sales support": "c25ce70b-9244-4393-aea6-75372a99a6ef",
  "pricing junior": "d354c55a-eb1c-4aee-bd02-b0a20162e1f1",
  "senior pricing analyst": "368006e7-98da-46a2-b871-6b741290821b",
  "customer documentation specialist": "6e4838dd-8aea-4426-bd26-ea588f0f493a",
  "lead accounting finance": "8c246bb3-8244-4755-bf92-58c0c627821c",
  "talent acquisition and development lead": "70c39cab-adaf-49a0-b137-29d0ff9b56b0",
  "especialista sig-sst": "52e41180-79ca-48c5-97d1-f385f4d44dde",
};

type ImportRow = {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  headline?: string;
  current_role?: string;
  current_company?: string;
  role_start?: string;
  education?: string;
  institution?: string;
  linkedin_url?: string;
  applied_at?: string;
  job_title?: string;
  salary_question?: string;
};

function vacancyIdFor(jobTitle?: string): string | null {
  if (!jobTitle) return null;
  return VACANCY_MAP[jobTitle.toLowerCase().trim()] || null;
}

function parseSalary(salaryQ?: string): number | null {
  if (!salaryQ) return null;
  const m = salaryQ.match(/(?:Aspiraci[oó]n|Expectativa)\s*Salarial[^:]*:\s*(\d{4,})/i);
  if (m) return Number(m[1]);
  const m2 = salaryQ.match(/Cuentanos\s+tu\s+aspiraci[oó]n\s+Salarial\s*:\s*(\d{4,})/i);
  if (m2) return Number(m2[1]);
  return null;
}

function parseEnglish(salaryQ?: string): string | null {
  if (!salaryQ) return null;
  const m = salaryQ.match(/nivel\s+de\s+Ingl[eé]s[^:]*:\s*([^,]+)/i);
  return m ? m[1].trim() : null;
}

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const cands: ImportRow[] = Array.isArray(body.candidates) ? body.candidates : [];
    const defaultStage = body.default_stage || 'aplico';
    const dryRun = body.dry_run === true;

    if (cands.length === 0) {
      return NextResponse.json({ error: "Lista 'candidates' vacía" }, { status: 400 });
    }
    if (cands.length > 500) {
      return NextResponse.json({ error: "Máximo 500 candidatos por batch" }, { status: 400 });
    }

    // Get all existing emails · case-insensitive · usa OR ilike por chunks
    // para evitar el problema de mixed-case en storage que causó duplicados.
    const emails = cands.map(c => (c.email || '').toLowerCase().trim()).filter(Boolean);
    let existing: any[] = [];
    if (emails.length > 0) {
      // PostgREST acepta `email.ilike.X,email.ilike.Y` con .or()
      // Pero con 100s de emails sería frágil · mejor traer todos y filtrar en JS
      // por (a) email exact match lowercase O (b) email ilike de uno por uno.
      const orFilter = emails.map(e => `email.ilike.${e}`).join(',');
      const { data } = await supabaseFromIncludingDeleted("ht_candidates")
        .select("id, email, name, vacancy_id, stage, status, deleted_at")
        .or(orFilter);
      existing = data || [];
    }

    const existingByEmail: Record<string, any> = {};
    existing.forEach((c: any) => {
      existingByEmail[(c.email || '').toLowerCase().trim()] = c;
    });

    // Get vacancy info for richer reporting
    const allVacIds = Object.values(VACANCY_MAP);
    const { data: vacInfo } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title")
      .in("id", allVacIds);
    const vacTitleById: Record<string, string> = {};
    (vacInfo || []).forEach((v: any) => { vacTitleById[v.id] = v.title; });

    // Build results + insert payloads
    const results: any[] = [];
    const toInsert: any[] = [];

    cands.forEach((c, i) => {
      const email = (c.email || '').toLowerCase().trim();
      if (!email || !c.name) {
        results.push({ index: i, name: c.name, email, action: 'error', reason: 'Falta name o email' });
        return;
      }

      const vacId = vacancyIdFor(c.job_title);
      if (!vacId) {
        results.push({
          index: i,
          name: c.name,
          email,
          action: 'error',
          reason: `Job title "${c.job_title || ''}" no mapea a ninguna vacante TS`,
        });
        return;
      }

      const existingC = existingByEmail[email];
      if (existingC) {
        results.push({
          index: i,
          name: c.name,
          email,
          action: 'existing',
          existing_stage: existingC.stage,
          existing_vacancy_title: vacTitleById[existingC.vacancy_id] || '?',
          new_vacancy_title: vacTitleById[vacId] || '?',
          same_vacancy: existingC.vacancy_id === vacId,
        });
        return;
      }

      // Build insert payload
      const salary = parseSalary(c.salary_question);
      const english = parseEnglish(c.salary_question);
      const notesArr: string[] = [];
      if (c.headline) notesArr.push(`Headline: ${c.headline}`);
      if (c.current_role && c.current_company) notesArr.push(`Actual: ${c.current_role} en ${c.current_company}`);
      if (c.education && c.institution) notesArr.push(`Educación: ${c.education} · ${c.institution}`);
      if (c.linkedin_url) notesArr.push(`LinkedIn: ${c.linkedin_url}`);
      if (salary) notesArr.push(`Aspiración salarial: COP ${salary.toLocaleString('es-CO')}`);
      if (english) notesArr.push(`Inglés: ${english}`);
      if (c.location) notesArr.push(`Ubicación: ${c.location}`);

      toInsert.push({
        client_id: TS_CLIENT_ID,
        name: c.name,
        email,
        phone: c.phone || null,
        vacancy_id: vacId,
        stage: defaultStage,
        status: 'pending',
        current_role: c.current_role || null,
        notes: notesArr.join(' · '),
        linkedin_url: c.linkedin_url || null,
        created_at: c.applied_at ? new Date(c.applied_at).toISOString() : new Date().toISOString(),
      });

      results.push({
        index: i,
        name: c.name,
        email,
        action: 'inserted',
        vacancy_title: vacTitleById[vacId] || '?',
      });
    });

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        total: cands.length,
        to_insert: toInsert.length,
        existing: results.filter(r => r.action === 'existing').length,
        errors: results.filter(r => r.action === 'error').length,
        results,
      });
    }

    // Execute inserts
    let insertedCount = 0;
    if (toInsert.length > 0) {
      // Insertar en chunks de 50 para no abusar del PostgREST
      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const { data: ins, error } = await supabaseAdmin.from("ht_candidates").insert(chunk).select('id, email');
        if (error) {
          // Probar sin linkedin_url/current_role (puede que esas columnas no existan en el schema actual)
          const fallbackChunk = chunk.map(c => {
            const { linkedin_url, current_role, ...rest } = c;
            return rest;
          });
          const retry = await supabaseAdmin.from("ht_candidates").insert(fallbackChunk).select('id, email');
          if (retry.error) {
            return NextResponse.json({
              error: `Insert failed: ${retry.error.message}`,
              partial_results: results,
              inserted_so_far: insertedCount,
            }, { status: 500 });
          }
          insertedCount += retry.data?.length || 0;
        } else {
          insertedCount += ins?.length || 0;
        }
      }
    }

    return NextResponse.json({
      success: true,
      total: cands.length,
      inserted: insertedCount,
      existing: results.filter(r => r.action === 'existing').length,
      errors: results.filter(r => r.action === 'error').length,
      results,
    });
  } catch (err: any) {
    console.error("candidates bulk-import error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
