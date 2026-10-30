import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { findItem, ITEMS } from '@/lib/bateria/items';
import { cerrarSesion } from '@/lib/bateria/cerrar';
import { isPreviewTestMode, previewTestJson } from '@/lib/preview-mode';

export const dynamic = 'force-dynamic';

/** Guardado incremental: cada respuesta se persiste al momento. */
export async function POST(req: NextRequest) {
  try {
    const { token, item_code, answer, latency_ms } = await req.json();
    if (!token || !item_code) return NextResponse.json({ error: 'Parámetros faltantes' }, { status: 400 });

    const item = findItem(item_code);
    if (!item) return NextResponse.json({ error: 'Ítem desconocido' }, { status: 400 });

    const { data: session } = await supabaseAdmin
      .from('ts_bat_sessions')
      .select('id, status, started_at')
      .eq('token', token)
      .single();
    if (!session) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 });
    // Un enlace ya presentado no vuelve a aceptar respuestas. Se responde 409 y
    // el cliente DEBE frenar: antes seguia adelante y el candidato contestaba la
    // prueba completa contra el vacio, viendo 'Listo, recibimos su prueba'.
    if (session.status === 'completed') {
      return NextResponse.json(
        { error: 'enlace_ya_presentado', detalle: 'Este enlace ya fue presentado por otra persona. Sus respuestas no se están guardando.' },
        { status: 409 }
      );
    }

    if (isPreviewTestMode()) {
      return previewTestJson('POST /api/bateria/answer', { saved: true });
    }

    // Marcar el inicio no puede fallar en silencio: si esta escritura no llega,
    // la sesion se queda en 'created' para siempre y nada mas se guarda en la fila.
    if (!session.started_at || session.status !== 'in_progress') {
      const patch: Record<string, unknown> = { status: 'in_progress', updated_at: new Date().toISOString() };
      if (!session.started_at) patch.started_at = new Date().toISOString();
      const { data: filas, error: eMark } = await supabaseAdmin
        .from('ts_bat_sessions').update(patch).eq('id', session.id).select('id');
      if (eMark || !filas?.length) {
        console.error('bateria/answer · no se pudo marcar inicio', session.id, eMark?.message ?? 'cero filas');
      }
    }

    const { error } = await supabaseAdmin.from('ts_bat_answers').upsert(
      {
        session_id: session.id,
        item_code,
        block: item.block,
        subdomain: item.subdomain,
        item_type: item.type,
        answer,
        latency_ms: latency_ms ?? null,
        answered_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,item_code' }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Cierre automatico al responder el ultimo item.
    // Si el candidato cierra el navegador justo ahi —que es lo que pasa— el
    // informe queda calculado igual. Pulsar "terminar" deja de ser obligatorio.
    const { count } = await supabaseAdmin
      .from('ts_bat_answers')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id);

    if ((count ?? 0) >= ITEMS.length) {
      const res = await cerrarSesion(session.id);
      if (!res.ok) console.error('cierre automático', res.error);
      return NextResponse.json({ saved: true, autoCompletada: res.ok });
    }

    return NextResponse.json({ saved: true, faltan: ITEMS.length - (count ?? 0) });
  } catch (err) {
    console.error('bateria/answer', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
