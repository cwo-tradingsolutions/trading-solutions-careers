import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { CONSENT_TEXT_VERSION } from '@/lib/bateria/items';
import { consentVersionFor, batteryVersionFor, type BatLang } from '@/lib/bateria/i18n';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

export const dynamic = 'force-dynamic';

/**
 * Registra el consentimiento y VERIFICA que quedo escrito.
 *
 * No basta con que la base no devuelva error: una actualizacion que no toca
 * ninguna fila tampoco lo devuelve. Si el consentimiento no persiste, la
 * sesion queda sin evidencia de habeas data y el endpoint de capturas rechaza
 * todas las fotos. Antes eso pasaba en silencio; ahora la prueba no arranca.
 */
export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  try {
    const { token, camera, name, email, lang: langRaw } = await req.json();
    // El idioma lo manda la pantalla que el candidato acaba de leer.
    const lang: BatLang = String(langRaw || '').toLowerCase() === 'en' ? 'en' : 'es';
    if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 });

    const { data: session, error: eSes } = await supabaseAdmin
      .from('ts_bat_sessions').select('id, status').eq('token', token).single();
    if (eSes) return NextResponse.json({ error: `[buscar] ${eSes.message}` }, { status: 500 });
    if (!session) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 });

    const now = new Date().toISOString();
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') || null;

    const patch: Record<string, unknown> = {
      consent_data_at: now,
      consent_cam_at: camera ? now : null,
      // El candidato en inglés acepta el texto PIPL, no el de habeas data. Sin
      // esta distinción la auditoría no puede mostrar QUÉ aceptó cada persona.
      consent_text_ver: consentVersionFor(lang, CONSENT_TEXT_VERSION),
      consent_ip: ip,
      consent_ua: req.headers.get('user-agent'),
      modality: camera ? 'remoto' : 'presencial_pendiente',
      status: session.status === 'created' ? 'consented' : session.status,
      // La versión queda marcada con el idioma en que se presentó: un puntaje
      // en inglés no se lee contra el baremo en español.
      battery_version: batteryVersionFor(lang),
      updated_at: now,
    };
    if (name) patch.candidate_name = name;
    if (email) patch.candidate_email = email;

    const { data: filas, error } = await supabaseAdmin
      .from('ts_bat_sessions')
      .update(patch)
      .eq('id', session.id)
      .select('id, consent_data_at, consent_cam_at, status');

    if (error) return NextResponse.json({ error: `[guardar] ${error.message}` }, { status: 500 });
    if (!filas?.length) {
      return NextResponse.json(
        { error: 'no_persistio', detalle: 'No pudimos registrar su autorización. No inicie la prueba: escríbanos para enviarle un enlace nuevo.' },
        { status: 500 }
      );
    }
    if (!filas[0].consent_data_at) {
      return NextResponse.json(
        { error: 'no_persistio', detalle: 'La autorización no quedó registrada. No inicie la prueba: escríbanos para enviarle un enlace nuevo.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      version: CONSENT_TEXT_VERSION,
      camara: !!filas[0].consent_cam_at,
      status: filas[0].status,
    });
  } catch (err: any) {
    console.error('bateria/consent', err);
    return NextResponse.json({ error: `[ruta] ${err?.message ?? String(err)}` }, { status: 500 });
  }
}
