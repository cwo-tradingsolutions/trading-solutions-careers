import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { BLOCK_ORDER, ITEMS, sanitizeForCandidate, BATTERY_VERSION } from '@/lib/bateria/items';
import { blocksFor, localizeItem, batteryVersionFor, type BatLang } from '@/lib/bateria/i18n';
import { resolveCandidateLang, requiresPiplConsent } from '@/lib/candidate-lang';
import { consentVersionForVariant, type ConsentVariant } from '@/lib/bateria/consent';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { data: session, error } = await supabaseAdmin
    .from('ts_bat_sessions')
    .select('*')
    .eq('token', params.token)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 });
  }
  // El idioma sale del candidato al que está amarrada la sesión. Si la sesión
  // no tiene candidato (pilotos internos), se mira el título de la vacante.
  let lang: BatLang = 'es';
  // Consentimiento: PIPL solo para vacantes de China; neutro para el resto
  // (ver src/lib/bateria/consent.ts).
  let consentVariant: ConsentVariant = 'neutral';
  if (session.ht_candidate_id) {
    const { data: cand } = await supabaseAdmin
      .from('ht_candidates')
      .select('preferred_language, ht_vacancies(title, form_template_key, country)')
      .eq('id', session.ht_candidate_id)
      .maybeSingle();
    if (cand) {
      lang = resolveCandidateLang({
        preferredLanguage: (cand as any).preferred_language,
        formTemplateKey: (cand as any).ht_vacancies?.form_template_key,
        jobTitle: (cand as any).ht_vacancies?.title ?? session.vacancy_title,
        country: (cand as any).ht_vacancies?.country,
      });
      if (requiresPiplConsent({
        formTemplateKey: (cand as any).ht_vacancies?.form_template_key,
        country: (cand as any).ht_vacancies?.country,
      })) consentVariant = 'pipl';
    }
  } else {
    lang = resolveCandidateLang({ jobTitle: session.vacancy_title });
  }

  // El idioma viaja también en el 403: quien vuelve a abrir un enlace ya usado
  // tiene que leer el aviso en su idioma, no en español.
  if (session.status === 'completed') {
    return NextResponse.json({ error: 'Esta prueba ya fue presentada', status: 'completed', lang }, { status: 403 });
  }

  const { data: answers } = await supabaseAdmin
    .from('ts_bat_answers')
    .select('item_code, answer')
    .eq('session_id', session.id);

  // Sin no-store el navegador y el CDN sirven el estado viejo de la sesion:
  // un candidato que reanuda ve la pantalla de habeas data otra vez, y el panel
  // reporta 'sin empezar' una prueba que ya se presento.
  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      candidate_name: session.candidate_name,
      vacancy_title: session.vacancy_title,
      battery_version: session.battery_version ?? batteryVersionFor(lang),
      lang,
      consent_data_at: session.consent_data_at,
      consent_cam_at: session.consent_cam_at,
      // Lo que ya aceptó (no se toca) y lo que se le mostraría hoy.
      consent_text_ver: session.consent_text_ver ?? null,
      consent_variant: consentVariant,
      consent_version: consentVersionForVariant(consentVariant),
      purpose: session.purpose,
    },
    blocks: BLOCK_ORDER.map((b) => ({
      key: b,
      ...blocksFor(lang)[b],
      items: ITEMS.filter((i) => i.block === b).map((i) => sanitizeForCandidate(localizeItem(i, lang))),
    })),
    existing: Object.fromEntries((answers ?? []).map((a: any) => [a.item_code, a.answer])),
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
