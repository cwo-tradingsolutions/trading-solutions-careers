import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isAdminRequest } from '@/lib/bateria/auth';
import { cerrarSesion } from '@/lib/bateria/cerrar';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

export const dynamic = 'force-dynamic';

/** Recalcula los puntajes de una sesion desde sus respuestas guardadas. */
export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  if (!isAdminRequest(req)) return NextResponse.json({ error: 'No autorizado · vuelva a entrar a hr-admin' }, { status: 401 });
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 });

    const { data: session, error } = await supabaseAdmin
      .from('ts_bat_sessions').select('id, battery_version').eq('token', token).single();
    if (error) return NextResponse.json({ error: `[buscar_sesion] ${error.message}` }, { status: 400 });
    if (!session) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

    const res = await cerrarSesion(session.id);
    if (!res.ok) {
      console.error('bateria/recalcular', res.error);
      return NextResponse.json({ error: res.error, etapa: res.etapa }, { status: 400 });
    }
    return NextResponse.json(res);
  } catch (err: any) {
    console.error('bateria/recalcular', err);
    return NextResponse.json({ error: `[ruta] ${err?.message ?? String(err)}` }, { status: 500 });
  }
}
