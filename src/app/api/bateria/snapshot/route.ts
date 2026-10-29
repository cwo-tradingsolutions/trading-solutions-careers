import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isPreviewTestMode, previewTestJson } from '@/lib/preview-mode';

export const dynamic = 'force-dynamic';

const BUCKET = 'proctoring-snapshots';
const MAX_BYTES = 400 * 1024;

/**
 * Guarda una captura de cámara en Supabase Storage e indexa la fila.
 * Ruta: bateria/{session_id}/{block}_{timestamp}.jpg
 * El bucket es privado: las imágenes solo se ven con URL firmada desde el informe.
 */
export async function POST(req: NextRequest) {
  try {
    const { token, image, block, item_code } = await req.json();
    if (!token || !image) return NextResponse.json({ error: 'Parámetros faltantes' }, { status: 400 });

    const { data: session } = await supabaseAdmin
      .from('ts_bat_sessions')
      .select('id, status, consent_cam_at')
      .eq('token', token)
      .single();
    if (!session) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 });

    // Sin consentimiento de cámara no se guarda ninguna imagen. Punto.
    if (!session.consent_cam_at) {
      return NextResponse.json({ error: 'Sin autorización de captura de imagen' }, { status: 403 });
    }
    if (session.status === 'completed') return NextResponse.json({ error: 'Prueba cerrada' }, { status: 403 });

    const match = String(image).match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
    if (!match) return NextResponse.json({ error: 'Formato de imagen inválido' }, { status: 400 });

    const mime = match[1];
    const binary = Buffer.from(match[2], 'base64');
    if (binary.length > MAX_BYTES) {
      return NextResponse.json({ error: 'Captura demasiado grande' }, { status: 413 });
    }

    if (isPreviewTestMode()) {
      return previewTestJson('POST /api/bateria/snapshot', { saved: true });
    }

    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const path = `bateria/${session.id}/${block ?? 'X'}_${Date.now()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, binary, {
      contentType: mime,
      cacheControl: '3600',
      upsert: false,
    });
    if (upErr) {
      console.error('bateria/snapshot upload', upErr);
      return NextResponse.json({ error: 'No se pudo guardar la captura' }, { status: 500 });
    }

    await supabaseAdmin.from('ts_bat_snapshots').insert({
      session_id: session.id,
      storage_path: path,
      block: block ?? null,
      item_code: item_code ?? null,
      bytes: binary.length,
    });

    return NextResponse.json({ saved: true, path });
  } catch (err) {
    console.error('bateria/snapshot', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
