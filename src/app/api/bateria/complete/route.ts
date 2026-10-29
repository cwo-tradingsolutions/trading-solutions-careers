import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cerrarSesion } from '@/lib/bateria/cerrar';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 });

    const { data: session } = await supabaseAdmin
      .from('ts_bat_sessions').select('id').eq('token', token).single();
    if (!session) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 });

    const res = await cerrarSesion(session.id);
    if (!res.ok) console.error('bateria/complete', res.error);

    // El candidato NO recibe resultados. Solo la confirmacion de envio.
    // Y si el calculo fallo, igual confirmamos: las respuestas ya estan guardadas
    // y el informe se puede recalcular desde el panel.
    return NextResponse.json({ completed: true });
  } catch (err) {
    console.error('bateria/complete', err);
    return NextResponse.json({ completed: true });
  }
}
