/**
 * POST /api/admin/seed-linkedin-apps
 *
 * Importa los 113 candidatos del bulk LinkedIn Recruiter (2026-05-03).
 * Idempotente — chequea por email antes de insertar.
 *
 * Para correr una sola vez después del deploy:
 *   curl -X POST https://trading-solutions-careers.vercel.app/api/admin/seed-linkedin-apps \
 *        -H "Authorization: Bearer $ADMIN_SECRET"
 *
 * O simplemente desde el browser estando logueada (sin headers — usa cookie de sesión):
 *   abrí la URL en una nueva tab y hacé fetch desde la consola:
 *   fetch('/api/admin/seed-linkedin-apps', { method: 'POST' }).then(r => r.json()).then(console.log)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin, supabaseFromIncludingDeleted } from "@/lib/supabase";
import seedData from "@/data/linkedin_apps_2026_05_03.json";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

type SeedRow = {
  name: string;
  email: string;
  phone: string | null;
  vacancy_id: string;
  notes: string;
  applied: string; // YYYY-MM-DD
};

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const cands = seedData as SeedRow[];

    if (!Array.isArray(cands) || cands.length === 0) {
      return NextResponse.json({ error: "Seed data vacío" }, { status: 500 });
    }

    // 1. Get existing emails para dedup · case-insensitive
    // Antes usaba .in() exact-match · si email guardado tenía mayúsculas
    // mezcladas, no detectaba dupe y creaba registro nuevo (caso Carlos).
    const emails = cands.map(c => c.email.toLowerCase().trim()).filter(Boolean);
    let existing: any[] = [];
    if (emails.length > 0) {
      const orFilter = emails.map(e => `email.ilike.${e}`).join(',');
      const { data } = await supabaseFromIncludingDeleted("ht_candidates")
        .select("email, deleted_at")
        .or(orFilter);
      existing = data || [];
    }

    const existingSet = new Set(existing.map((c: any) => (c.email || '').toLowerCase().trim()));

    // 2. Probe schema: chequear qué columnas opcionales existen
    // Nota: current_role es palabra reservada en Postgres, usamos current_job_role
    const { error: probeErr } = await supabaseAdmin
      .from("ht_candidates")
      .select("notes, headline, current_job_role, linkedin_url, source, salary_aspiration_cop, english_level, location")
      .limit(1);
    const hasMetadataCols = !probeErr;

    // Helpers para extraer data de notes
    const ex = (notes: string, key: string): string | null => {
      const re = new RegExp(`${key}:\\s*([^·]+?)(?:\\s*·|$)`);
      const m = notes.match(re);
      return m ? m[1].trim() : null;
    };
    const exSal = (notes: string): number | null => {
      const m = notes.match(/Aspiración salarial:\s*COP\s+([\d.]+)/);
      if (!m) return null;
      const n = Number(m[1].replace(/\./g, ''));
      return n >= 500_000 && n <= 100_000_000 ? n : null;
    };
    const exHeadline = (notes: string): string | null => {
      const m = notes.match(/Headline:\s*([^·]+?)(?:\s*·\s*Actual:|\s*·\s*Educación:|\s*·\s*LinkedIn:|$)/);
      return m ? m[1].trim() : null;
    };
    const exCurrent = (notes: string): { role: string | null; company: string | null } => {
      const m = notes.match(/Actual:\s*([^·]+?)\s+en\s+([^·]+?)(?:\s*·|$)/);
      return m ? { role: m[1].trim(), company: m[2].trim() } : { role: null, company: null };
    };

    // 3. Build payloads — incluir client_id (NOT NULL) + columnas opcionales solo si existen
    const toInsert = cands
      .filter(c => !existingSet.has(c.email.toLowerCase()))
      .map(c => {
        const linkedin = ex(c.notes, 'LinkedIn');
        const cur = exCurrent(c.notes);
        const base: any = {
          client_id: TS_CLIENT_ID,
          name: c.name,
          email: c.email,
          phone: c.phone,
          vacancy_id: c.vacancy_id,
          stage: 'aplico',
          // status check: pending|invited|in_progress|completed|expired|rejected
          status: 'pending',
          created_at: c.applied ? `${c.applied}T12:00:00Z` : new Date().toISOString(),
        };
        if (hasMetadataCols) {
          base.notes = c.notes;
          base.headline = exHeadline(c.notes);
          base.current_job_role = cur.role;
          base.current_company = cur.company;
          base.linkedin_url = linkedin;
          base.source = 'linkedin';
          base.salary_aspiration_cop = exSal(c.notes);
          base.english_level = ex(c.notes, 'Inglés');
          base.location = ex(c.notes, 'Ubicación');
        } else {
          // Sin columnas de metadata, al menos guardamos LinkedIn URL en cv_url
          base.cv_url = linkedin;
        }
        return base;
      });

    if (toInsert.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Todos los 113 candidatos ya estaban en el ATS — nada que insertar.",
        already_existing: cands.length,
        inserted: 0,
      });
    }

    // 3. Insert en chunks de 25 — si chunk falla, intentamos uno por uno y reportamos
    let insertedCount = 0;
    const errors: { row?: number; email?: string; message: string }[] = [];
    const insertedEmails: string[] = [];

    for (let i = 0; i < toInsert.length; i += 25) {
      const chunk = toInsert.slice(i, i + 25);
      const { data: ins, error } = await supabaseAdmin
        .from("ht_candidates")
        .insert(chunk)
        .select('id, email');
      if (error) {
        // Fallback: insertar uno por uno para identificar cuál(es) falla(n)
        for (let j = 0; j < chunk.length; j++) {
          const single = chunk[j];
          const { data: oneIns, error: oneErr } = await supabaseAdmin
            .from("ht_candidates")
            .insert(single)
            .select('id, email');
          if (oneErr) {
            errors.push({ row: i + j, email: single.email, message: oneErr.message });
          } else if (oneIns && oneIns[0]) {
            insertedCount++;
            insertedEmails.push(oneIns[0].email);
          }
        }
      } else {
        insertedCount += ins?.length || 0;
        (ins || []).forEach((r: any) => insertedEmails.push(r.email));
      }
    }

    // 4. Conteo por vacante para verificación
    const vacIds = Array.from(new Set(cands.map(c => c.vacancy_id)));
    const { data: vacInfo } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title")
      .in("id", vacIds);

    const breakdown: Array<{ vacancy: string; new: number; existed: number }> = [];
    for (const v of vacInfo || []) {
      const forVac = cands.filter(c => c.vacancy_id === v.id);
      const newForVac = toInsert.filter(c => c.vacancy_id === v.id);
      breakdown.push({
        vacancy: v.title,
        new: newForVac.length,
        existed: forVac.length - newForVac.length,
      });
    }

    return NextResponse.json({
      success: errors.length === 0,
      total_processed: cands.length,
      inserted: insertedCount,
      already_existing: cands.length - toInsert.length,
      attempted: toInsert.length,
      error_count: errors.length,
      first_errors: errors.slice(0, 5),
      breakdown,
    });
  } catch (err: any) {
    console.error("seed-linkedin-apps error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}

// GET para preview sin insertar (dry run)
export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const cands = seedData as SeedRow[];
  const emails = cands.map(c => c.email.toLowerCase());
  const { data: existing } = await supabaseFromIncludingDeleted("ht_candidates")
    .select("email, vacancy_id, stage, deleted_at")
    .in("email", emails);

  const existingByEmail: Record<string, any> = {};
  (existing || []).forEach((c: any) => { existingByEmail[(c.email || '').toLowerCase()] = c; });

  const vacIds = Array.from(new Set(cands.map(c => c.vacancy_id)));
  const { data: vacInfo } = await supabaseAdmin.from("ht_vacancies").select("id, title").in("id", vacIds);

  const breakdown = (vacInfo || []).map((v: any) => {
    const forVac = cands.filter(c => c.vacancy_id === v.id);
    const newForVac = forVac.filter(c => !existingByEmail[c.email.toLowerCase()]);
    return { vacancy: v.title, total: forVac.length, new: newForVac.length, existed: forVac.length - newForVac.length };
  });

  return NextResponse.json({
    dry_run: true,
    total: cands.length,
    will_insert: cands.filter(c => !existingByEmail[c.email.toLowerCase()]).length,
    already_existing: cands.filter(c => existingByEmail[c.email.toLowerCase()]).length,
    breakdown,
  });
}
