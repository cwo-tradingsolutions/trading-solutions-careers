import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

/**
 * GET /api/headhunting/candidates/[candidateId]
 * Returns basic info for a single candidate.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId requerido' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('ht_candidates')
      .select('id, name, email, phone, status, vacancy_id, started_at, completed_at, created_at')
      .eq('id', candidateId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Candidato no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ candidate: data });
  } catch (err) {
    console.error('Candidate GET error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

/**
 * PATCH /api/headhunting/candidates/[candidateId]
 * Updates whitelisted fields on a candidate. Currently supports: vacancy_id, name, email, phone, stage, status.
 * Used for cases like switching a candidate to a different vacancy.
 */
const ALLOWED_PATCH_FIELDS = ["vacancy_id", "name", "email", "phone", "stage", "status", "preferred_language", "source"];

/**
 * Orígenes con los que se cataloga a un candidato. `cv_proceso_anterior` es
 * para las hojas de vida que Wellness carga de un banco o de un proceso previo:
 * sin esa marca quedan idénticas a quien aplicó por la web y no hay forma de
 * separar la búsqueda nueva de lo que ya se tenía.
 */
const ALLOWED_SOURCES = [
  "public_form",
  "public_form_internal",
  "cv_proceso_anterior",
  "linkedin",
  "referido",
  "email_manual",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidateId } = await params;
    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId requerido' }, { status: 400 });
    }
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    for (const k of ALLOWED_PATCH_FIELDS) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    if (updates.source !== undefined) {
      const src = String(updates.source || "").toLowerCase().trim();
      if (!ALLOWED_SOURCES.includes(src)) {
        return NextResponse.json(
          { error: `source inválido · valores permitidos: ${ALLOWED_SOURCES.join(", ")}` },
          { status: 400 },
        );
      }
      updates.source = src;
    }

    // La columna tiene CHECK (es|en) · sin esto un valor raro devuelve un 500 crudo.
    if (updates.preferred_language !== undefined) {
      const lang = String(updates.preferred_language || "").toLowerCase();
      if (lang !== "es" && lang !== "en") {
        return NextResponse.json({ error: "preferred_language debe ser 'es' o 'en'" }, { status: 400 });
      }
      updates.preferred_language = lang;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Sin campos válidos para actualizar' }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('ht_candidates')
      .update(updates)
      .eq('id', candidateId)
      .select('id, name, email, vacancy_id, stage, status, preferred_language, source')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, candidate: data });
  } catch (err: any) {
    console.error('Candidate PATCH error:', err);
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 });
  }
}

/**
 * DELETE /api/headhunting/candidates/[candidateId]
 * Elimina un candidato y registros relacionados (cascading via FK donde aplica).
 * Usado para limpiar tests, duplicados, etc.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidateId } = await params;
    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId requerido' }, { status: 400 });
    }

    // Borrar registros relacionados primero (no todas tienen FK cascade)
    await supabaseAdmin.from('ht_results').delete().eq('candidate_id', candidateId);
    await supabaseAdmin.from('ts_candidate_experience').delete().eq('candidate_id', candidateId);
    await supabaseAdmin.from('ts_reminders_sent').delete().eq('candidate_id', candidateId);
    await supabaseAdmin.from('ts_candidate_reminders_paused').delete().eq('candidate_id', candidateId);

    const { error } = await supabaseAdmin
      .from('ht_candidates')
      .delete()
      .eq('id', candidateId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, deleted: candidateId });
  } catch (err: any) {
    console.error('Candidate DELETE error:', err);
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 });
  }
}
