/**
 * POST /api/headhunting/candidates/[candidateId]/restore
 * Quita deleted_at. Los hijos no se tocaron al ocultar, así que vuelven con él.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseFromIncludingDeleted } from '@/lib/supabase';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const authError = requireAdmin(_req);
  if (authError) return authError;

  try {
    const { candidateId } = await params;
    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId requerido' }, { status: 400 });
    }

    const { data, error } = await supabaseFromIncludingDeleted('ht_candidates')
      .update({
        deleted_at: null,
        deleted_by: null,
        delete_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidateId)
      .not('deleted_at', 'is', null)
      .select('id, name, email, stage, status, deleted_at')
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json({ error: 'No hay un candidato oculto con ese id' }, { status: 404 });
    }
    return NextResponse.json({ success: true, restored: true, candidate: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno';
    console.error('Candidate restore error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
