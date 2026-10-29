import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { isAdminRequest } from '@/lib/bateria/auth';
import { BATTERY_VERSION } from '@/lib/bateria/items';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

export const dynamic = 'force-dynamic';

/** Crea una sesión de la batería y devuelve el enlace del candidato. */
export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const token = crypto.randomBytes(24).toString('base64url');

    const { data, error } = await supabaseAdmin
      .from('ts_bat_sessions')
      .insert({
        token,
        battery_version: BATTERY_VERSION,
        purpose: body.purpose === 'candidato' ? 'candidato' : 'piloto',
        candidate_name: body.name ?? null,
        candidate_email: body.email ?? null,
        vacancy_title: body.vacancy_title ?? 'Especialista SIG-SST',
        ht_candidate_id: body.ht_candidate_id ?? null,
        status: 'created',
      })
      .select('id, token')
      .single();

    if (error) {
      console.error('bateria/create', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const origin = req.nextUrl.origin;
    return NextResponse.json({ id: data.id, token: data.token, url: `${origin}/prueba/${data.token}` });
  } catch (err) {
    console.error('bateria/create', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
