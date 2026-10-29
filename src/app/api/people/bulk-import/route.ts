/**
 * POST /api/people/bulk-import
 *
 * Inserta masivamente personas a ts_people. Pensado para cargar TPs (top performers)
 * existentes del directorio TS desde un CSV.
 *
 * Body:
 * {
 *   people: [
 *     { name, email, role, area?, role_level?, start_date?, manager_email?,
 *       buddy_email?, location?, is_top_performer?, psychometric_profile?, ... }
 *   ],
 *   default_is_tp?: boolean (default true — para imports masivos de TPs),
 *   dry_run?: boolean (default false — si true solo valida y reporta, no inserta)
 * }
 *
 * - Idempotente por email: si email ya existe, hace update (no duplica)
 * - Campos extra van automáticamente a psychometric_profile JSONB
 * - Default location: "Barranquilla"
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

const KNOWN_FIELDS = new Set([
  'name','email','role','area','role_level','start_date','status',
  'manager_email','buddy_email','location','is_top_performer',
  'linked_candidate_id','linked_vacancy_id','psychometric_profile','notes',
]);

const VALID_LEVELS = new Set(['entry','lead','c_suite']);
const VALID_STATUSES = new Set(['active','onboarding','offboarded']);

type ImportRow = Record<string, any>;
type ImportResult = {
  index: number;
  email: string | null;
  action: 'inserted' | 'updated' | 'skipped' | 'error';
  reason?: string;
  person_id?: string;
};

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const people: ImportRow[] = Array.isArray(body.people) ? body.people : [];
    const defaultIsTp = body.default_is_tp !== false;
    const dryRun = body.dry_run === true;

    if (people.length === 0) {
      return NextResponse.json({ error: "Lista 'people' vacía" }, { status: 400 });
    }
    if (people.length > 500) {
      return NextResponse.json({ error: "Máximo 500 personas por batch" }, { status: 400 });
    }

    // Get existing emails para detectar updates vs inserts
    const emails = people.map(p => (p.email || '').trim().toLowerCase()).filter(Boolean);
    const { data: existing } = emails.length > 0
      ? await supabaseAdmin.from("ts_people").select("id, email").in("email", emails)
      : { data: [] };
    const existingByEmail: Record<string, string> = {};
    (existing || []).forEach((p: any) => { existingByEmail[(p.email || '').toLowerCase()] = p.id; });

    const results: ImportResult[] = [];
    const toInsert: any[] = [];
    const toUpdate: { id: string; data: any }[] = [];

    people.forEach((row, i) => {
      const name = String(row.name || '').trim();
      const emailRaw = String(row.email || '').trim();
      const email = emailRaw.toLowerCase();

      if (!name) {
        results.push({ index: i, email: null, action: 'error', reason: 'Falta name' });
        return;
      }

      // Construir payload
      const payload: any = {
        name,
        email: emailRaw || null,
        role: String(row.role || '').trim() || 'Pendiente',
        area: row.area ? String(row.area).trim() : null,
        role_level: VALID_LEVELS.has(row.role_level) ? row.role_level : 'lead',
        start_date: row.start_date ? String(row.start_date).slice(0, 10) : null,
        status: VALID_STATUSES.has(row.status) ? row.status : 'active',
        manager_email: row.manager_email ? String(row.manager_email).trim() : null,
        buddy_email: row.buddy_email ? String(row.buddy_email).trim() : null,
        location: row.location ? String(row.location).trim() : 'Barranquilla',
        is_top_performer: row.is_top_performer === undefined
          ? defaultIsTp
          : (row.is_top_performer === true || String(row.is_top_performer).toLowerCase() === 'true'),
        notes: row.notes ? String(row.notes) : null,
      };

      // Recopilar columnas no estándar como psychometric_profile
      const extras: Record<string, any> = {};
      Object.keys(row).forEach(k => {
        if (!KNOWN_FIELDS.has(k) && row[k] !== null && row[k] !== '' && row[k] !== undefined) {
          extras[k] = row[k];
        }
      });
      if (Object.keys(extras).length > 0) {
        payload.psychometric_profile = { ...(row.psychometric_profile || {}), ...extras };
      } else if (row.psychometric_profile) {
        payload.psychometric_profile = row.psychometric_profile;
      }

      if (email && existingByEmail[email]) {
        toUpdate.push({ id: existingByEmail[email], data: payload });
        results.push({ index: i, email: emailRaw, action: 'updated', person_id: existingByEmail[email] });
      } else {
        toInsert.push(payload);
        results.push({ index: i, email: emailRaw || null, action: 'inserted' });
      }
    });

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        total: people.length,
        to_insert: toInsert.length,
        to_update: toUpdate.length,
        errors: results.filter(r => r.action === 'error').length,
        results,
      });
    }

    // Execute inserts
    let insertedCount = 0;
    if (toInsert.length > 0) {
      const { data: ins, error } = await supabaseAdmin.from("ts_people").insert(toInsert).select('id, email');
      if (error) {
        return NextResponse.json({ error: `Insert: ${error.message}`, results }, { status: 500 });
      }
      insertedCount = ins?.length || 0;
      // Asignar person_ids a results
      (ins || []).forEach((p: any) => {
        const r = results.find(r => r.email && r.email.toLowerCase() === (p.email || '').toLowerCase() && r.action === 'inserted');
        if (r) r.person_id = p.id;
      });
    }

    // Execute updates one by one (Supabase no tiene bulk update por id distintos)
    let updatedCount = 0;
    for (const { id, data } of toUpdate) {
      const { error } = await supabaseAdmin.from("ts_people").update(data).eq("id", id);
      if (!error) updatedCount++;
    }

    return NextResponse.json({
      success: true,
      total: people.length,
      inserted: insertedCount,
      updated: updatedCount,
      errors: results.filter(r => r.action === 'error').length,
      results,
    });
  } catch (err: any) {
    console.error("bulk-import error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
