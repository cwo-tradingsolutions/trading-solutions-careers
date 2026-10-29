import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { isAdminRequest } from '@/lib/bateria/auth';
import { BATTERY_VERSION } from '@/lib/bateria/items';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

export const dynamic = 'force-dynamic';

/**
 * Crea una sesion por candidato. Un enlace por persona, sin excepcion:
 * si el candidato ya tiene sesion se devuelve la suya, nunca la de otro.
 */
export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  if (!isAdminRequest(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const { candidatos, perfil } = await req.json();
    if (!Array.isArray(candidatos) || !candidatos.length) {
      return NextResponse.json({ error: 'Sin candidatos' }, { status: 400 });
    }

    const origin = req.nextUrl.origin;
    const resultado: any[] = [];

    for (const c of candidatos.slice(0, 100)) {
      const { data: ya } = await supabaseAdmin
        .from('ts_bat_sessions').select('token, status').eq('ht_candidate_id', c.id).limit(1);
      if (ya?.length) {
        resultado.push({ id: c.id, nombre: c.nombre, email: c.email, url: `${origin}/prueba/${ya[0].token}`, reusada: true });
        continue;
      }

      const token = crypto.randomBytes(24).toString('base64url');
      const { data, error } = await supabaseAdmin
        .from('ts_bat_sessions')
        .insert({
          token,
          battery_version: BATTERY_VERSION,
          purpose: 'candidato',
          candidate_name: c.nombre ?? null,
          candidate_email: c.email ?? null,
          ht_candidate_id: c.id,
          vacancy_title: c.vacante ?? 'Prueba de selección',
          perfil_cargo: perfil || null,
          status: 'created',
        })
        .select('token')
        .single();

      if (error || !data) {
        resultado.push({ id: c.id, nombre: c.nombre, email: c.email, error: error?.message ?? 'no se creó' });
        continue;
      }
      resultado.push({ id: c.id, nombre: c.nombre, email: c.email, url: `${origin}/prueba/${data.token}`, reusada: false });
    }

    return NextResponse.json({ resultado }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (err: any) {
    console.error('bateria/crear-lote', err);
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
