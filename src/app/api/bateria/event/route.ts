import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isPreviewTestMode, previewTestJson } from '@/lib/preview-mode';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set([
  'tab_blur', 'tab_focus', 'paste', 'copy', 'contextmenu', 'shortcut',
  'cam_lost', 'cam_ok', 'cam_denied', 'resume', 'block_start', 'block_end',
]);

export async function POST(req: NextRequest) {
  try {
    const { token, kind, detail, item_code } = await req.json();
    if (!token || !ALLOWED.has(kind)) return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });

    const { data: session } = await supabaseAdmin
      .from('ts_bat_sessions')
      .select('id')
      .eq('token', token)
      .single();
    if (!session) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 });

    if (isPreviewTestMode()) {
      return previewTestJson('POST /api/bateria/event');
    }

    await supabaseAdmin.from('ts_bat_events').insert({
      session_id: session.id,
      kind,
      detail: detail ? String(detail).slice(0, 300) : null,
      item_code: item_code ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
