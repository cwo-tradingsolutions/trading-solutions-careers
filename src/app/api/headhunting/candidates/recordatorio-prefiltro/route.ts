/**
 * POST /api/headhunting/candidates/recordatorio-prefiltro
 *
 * Recordatorio masivo a quienes tienen el prefiltro enviado y no lo han
 * llenado. Deja un borrador por persona en Gmail; no manda nada solo.
 *
 * A diferencia de send-prefilter, aqui NO se genera un token nuevo si el que
 * tiene todavia sirve: si alguien dejo el formulario a medias, cambiarle el
 * enlace le borra el avance. Solo se genera token cuando no hay o ya vencio,
 * y en ese caso se corre el vencimiento otros 7 dias.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createDraftViaGmail, isGmailConnected } from '@/lib/gmail';
import { asuntoRecordatorio, htmlRecordatorio, textoRecordatorio, FIRMA_RECORDATORIO,
  asuntoRecordatorioEn, htmlRecordatorioEn, EN_REMINDER_SIGNATURE } from '@/lib/recordatorio-prefiltro';
import { resolveCandidateLang } from '@/lib/candidate-lang';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Modo = 'previsualizar' | 'borrador';

const DIAS_VIGENCIA = 7;

function formatoFecha(iso: string, lang: 'es' | 'en' = 'es'): string {
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CO', {
    day: 'numeric',
    month: 'long',
  });
}

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const modo: Modo = body?.modo ?? 'previsualizar';
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

    if (modo === 'previsualizar') {
      const vence = new Date();
      vence.setDate(vence.getDate() + DIAS_VIGENCIA);
      const datos = {
        nombre: body?.nombre ?? 'María Fernanda Gómez',
        vacante: body?.vacante ?? 'Especialista SIG-SST',
        url: `${baseUrl}/prefiltro/ASI-SE-VE-EL-ENLACE`,
        vence: formatoFecha(vence.toISOString()),
      };
      return NextResponse.json(
        {
          modo,
          asunto: asuntoRecordatorio(datos.vacante),
          html: htmlRecordatorio(datos),
          texto: textoRecordatorio(datos),
          para: body?.email ?? 'candidato@ejemplo.com',
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!ids.length) return NextResponse.json({ error: 'Sin candidatos' }, { status: 400 });

    const gmail = await isGmailConnected();
    if (!gmail.connected) {
      return NextResponse.json(
        { error: 'Gmail no está conectado, así que no puedo dejar los borradores en su bandeja. Conéctelo en Ajustes.' },
        { status: 409 }
      );
    }

    const { data: cands, error } = await supabaseAdmin
      .from('ht_candidates')
      .select('id, name, email, preferred_language, prefilter_token, prefilter_token_expires_at, prefilter_completed_at, ht_vacancies(title, form_template_key, country)')
      .in('id', ids.slice(0, 100));

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const resultado: any[] = [];

    for (const c of cands ?? []) {
      const nombre = c.name ?? null;

      if (c.prefilter_completed_at) {
        resultado.push({ id: c.id, nombre, error: 'ya llenó el prefiltro' });
        continue;
      }
      if (!c.email) {
        resultado.push({ id: c.id, nombre, error: 'sin correo en la ficha' });
        continue;
      }

      // Reusar el enlace vigente. Solo se cambia si no hay o ya vencio.
      let token = c.prefilter_token as string | null;
      let vence = c.prefilter_token_expires_at as string | null;
      const vencido = !vence || new Date(vence).getTime() < Date.now();

      if (!token || vencido) {
        token = crypto.randomUUID();
        const nuevaFecha = new Date();
        nuevaFecha.setDate(nuevaFecha.getDate() + DIAS_VIGENCIA);
        vence = nuevaFecha.toISOString();
        const { error: eUpd } = await supabaseAdmin
          .from('ht_candidates')
          .update({ prefilter_token: token, prefilter_token_expires_at: vence, updated_at: new Date().toISOString() })
          .eq('id', c.id);
        if (eUpd) {
          resultado.push({ id: c.id, nombre, error: `no se pudo renovar el enlace: ${eUpd.message}` });
          continue;
        }
      }

      const vacante = (c as any).ht_vacancies?.title ?? null;
      // China corre en inglés · el recordatorio sigue el idioma del proceso.
      const lang = resolveCandidateLang({
        formTemplateKey: (c as any).ht_vacancies?.form_template_key,
        preferredLanguage: (c as any).preferred_language,
        jobTitle: vacante,
        country: (c as any).ht_vacancies?.country,
      });
      const datos = { nombre, vacante, url: `${baseUrl}/prefiltro/${token}`, vence: vence ? formatoFecha(vence, lang) : null };

      const r = await createDraftViaGmail({
        to: c.email,
        subject: lang === 'en' ? asuntoRecordatorioEn(vacante) : asuntoRecordatorio(vacante),
        html: lang === 'en' ? htmlRecordatorioEn(datos) : htmlRecordatorio(datos),
        fromName: lang === 'en'
          ? `${EN_REMINDER_SIGNATURE} · Trading Solutions`
          : `${FIRMA_RECORDATORIO} · Trading Solutions`,
      });

      resultado.push({
        id: c.id, nombre, email: c.email, url: datos.url,
        renovado: !!(!c.prefilter_token || vencido),
        error: r.ok ? null : (r.error ?? 'Gmail rechazó el borrador'),
      });
    }

    const ok = resultado.filter((r) => !r.error).length;
    const renovados = resultado.filter((r) => r.renovado && !r.error).length;

    return NextResponse.json(
      {
        ok,
        fallaron: resultado.filter((r) => r.error).length,
        resultado,
        nota:
          `Quedaron ${ok} borradores en la bandeja de ${gmail.email ?? 'Gmail'}.` +
          (renovados ? ` A ${renovados} se les tuvo que renovar el enlace porque ya había vencido.` : ''),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('recordatorio-prefiltro', err);
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
