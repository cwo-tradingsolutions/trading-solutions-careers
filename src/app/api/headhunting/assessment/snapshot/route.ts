import { NextRequest, NextResponse } from 'next/server';
import { almacen } from "@/lib/almacen";
import { isPreviewTestMode, previewTestJson } from '@/lib/preview-mode';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Uploads a single proctoring snapshot (base64 JPEG) to Supabase Storage.
 * Path: {candidate_id}/{scenario_index}_{timestamp}.jpg
 * Also inserts a row in ht_proctoring_snapshots for quick indexing.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, scenario_id, snapshot_base64, captured_at, scenario_index } = body;

    if (!token || !snapshot_base64) {
      return NextResponse.json({ error: 'Parámetros faltantes' }, { status: 400 });
    }

    // Validate token
    const { data: candidate } = await supabaseAdmin
      .from('ht_candidates')
      .select('id, status')
      .eq('assessment_token', token)
      .single();

    if (!candidate || candidate.status !== 'in_progress') {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 403 });
    }

    // Decode base64 data URL → binary
    const match = snapshot_base64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: 'Formato base64 inválido' }, { status: 400 });
    }
    const mime = match[1];
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const binary = Buffer.from(match[2], 'base64');

    if (isPreviewTestMode()) {
      return previewTestJson('POST /api/headhunting/assessment/snapshot', { saved: true });
    }

    const ts = Date.now();
    const filename = `${candidate.id}/${scenario_index ?? 0}_${ts}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await almacen('proctoring-snapshots')
      .upload(filename, binary, {
        contentType: mime,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Snapshot upload error:', uploadError);
      return NextResponse.json({ error: 'Error al subir captura' }, { status: 500 });
    }

    // Metadata lives in the filename itself: {scenario_index}_{timestamp}.{ext}
    // This avoids needing a dedicated table.
    // scenario_id is recorded via scenario_index order in the frontend loop.

    return NextResponse.json({ uploaded: true, path: filename });
  } catch (err) {
    console.error('Snapshot endpoint error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
