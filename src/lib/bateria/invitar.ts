/**
 * Invitación a la Batería TS · lo que comparten el envío manual
 * (/api/bateria/enviar) y el automático al pasar el prefiltro.
 *
 * Antes vivía dentro de la ruta. Se sacó para que el envío automático use
 * exactamente la misma sesión, el mismo correo y el mismo movimiento de etapa
 * que el manual: dos copias terminan diciendo cosas distintas.
 */
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { BATTERY_VERSION } from '@/lib/bateria/items';
import { asuntoBateria, htmlBateria, textoBateria, asuntoBateriaEn, htmlBateriaEn, textoBateriaEn } from '@/lib/bateria/correo';
import { ATS_FROM_NAME } from '@/lib/ats-from';
import { resolveCandidateLang } from '@/lib/candidate-lang';
import { isGmailConnected, sendViaGmail } from '@/lib/gmail';
import { getResend, EMAIL_FROM } from '@/lib/resend';
import { recordStageEvent } from '@/lib/stage-events';
import { normalizeStage, STAGE_RANK } from '@/lib/stage-labels';

/** Las respuestas van a la cuenta de reclutamiento, no al remitente tecnico. */
export const RESPONDER_A = 'jointheteam@tradingsolutions.com';

/** La etapa en la que queda quien ya recibio la bateria. */
export const ETAPA_BATERIA = 'pruebas';

export type CandBateria = { id?: string; nombre?: string; email?: string; vacante?: string };

/**
 * Mandar la bateria ES lo que pone al candidato en esa etapa. Dejarlo como dos
 * acciones separadas garantiza que tarde o temprano se haga la primera y se
 * olvide la segunda, y entonces el funnel deja de decir la verdad sobre donde
 * esta cada quien — que es justo para lo que sirve.
 *
 * Solo mueve hacia adelante: a quien ya va mas avanzado no se le retrocede por
 * reenviarle su enlace.
 */
export async function moverABateria(candidatoId: string, note = 'Batería enviada desde el ATS') {
  const { data: c } = await supabaseAdmin
    .from('ht_candidates').select('id, stage, vacancy_id').eq('id', candidatoId).single();
  if (!c) return;

  const actual = normalizeStage(c.stage);
  const rankActual = STAGE_RANK[actual] ?? 0;
  const rankBateria = STAGE_RANK[ETAPA_BATERIA] ?? 0;
  if (rankActual >= rankBateria) return;

  const { error } = await supabaseAdmin
    .from('ht_candidates')
    .update({ stage: ETAPA_BATERIA, updated_at: new Date().toISOString() })
    .eq('id', candidatoId);
  if (error) { console.error('bateria · no se pudo mover de etapa', candidatoId, error.message); return; }

  await recordStageEvent({
    candidateId: candidatoId,
    fromStage: c.stage ?? null,
    toStage: ETAPA_BATERIA,
    vacancyId: c.vacancy_id ?? null,
    source: 'system',
    note,
  });
}

/**
 * Un enlace por persona. Si el candidato ya tiene sesion se reusa la suya:
 * crear una segunda le borraria el avance de la primera y dejaria dos filas
 * compitiendo por el mismo informe.
 */
export async function sesionDe(c: CandBateria, perfil: string | null, origin: string) {
  const { data: ya } = await supabaseAdmin
    .from('ts_bat_sessions')
    .select('id, token, status, invite_count')
    .eq('ht_candidate_id', c.id)
    .limit(1);

  if (ya?.length) {
    if (perfil) await supabaseAdmin.from('ts_bat_sessions').update({ perfil_cargo: perfil }).eq('id', ya[0].id);
    return { id: ya[0].id, token: ya[0].token, url: `${origin}/prueba/${ya[0].token}`, reusada: true, invite_count: ya[0].invite_count ?? 0 };
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
      ht_candidate_id: c.id ?? null,
      vacancy_title: c.vacante ?? 'Prueba de selección',
      perfil_cargo: perfil,
      status: 'created',
    })
    .select('id, token')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'no se pudo crear la sesión');
  return { id: data.id, token: data.token, url: `${origin}/prueba/${data.token}`, reusada: false, invite_count: 0 };
}

export type ResultadoAuto =
  | { enviado: true; canal: 'gmail' | 'resend'; url: string }
  | { enviado: false; motivo: string; url?: string };

/**
 * Envío automático de la Batería TS (prefiltro pasado / listo para batería).
 *
 * Sale de verdad, no como borrador: Kelly lo pidió así el 27-oct. Primero por
 * Gmail —la cuenta conectada es jointheteam@, con su historial—; si Gmail no
 * está conectado, por Resend con EMAIL_FROM y respuesta a jointheteam@. Si no
 * hay ninguno de los dos (staging), no sale nada, el candidato se queda en
 * Prefiltro y se devuelve el motivo: moverlo sin invitación sería mentir.
 */
export async function enviarBateriaAuto(candidatoId: string, origin: string): Promise<ResultadoAuto> {
  try {
    const { data: c } = await supabaseAdmin
      .from('ht_candidates')
      .select('id, name, email, stage, preferred_language, ht_vacancies(title, form_template_key, country)')
      .eq('id', candidatoId)
      .single();
    if (!c) return { enviado: false, motivo: 'candidato no encontrado' };
    if (!c.email) return { enviado: false, motivo: 'sin correo en la ficha' };

    const vac = (c as any).ht_vacancies;
    const cand: CandBateria = { id: c.id, nombre: c.name ?? undefined, email: c.email, vacante: vac?.title ?? undefined };
    const ses = await sesionDe(cand, null, origin);

    const lang = resolveCandidateLang({
      formTemplateKey: vac?.form_template_key,
      preferredLanguage: (c as any).preferred_language,
      jobTitle: vac?.title,
      country: vac?.country,
    });
    const datos = { nombre: cand.nombre ?? null, vacante: cand.vacante ?? null, url: ses.url };
    const asunto = lang === 'en' ? asuntoBateriaEn(datos.vacante) : asuntoBateria(datos.vacante);
    const html = lang === 'en' ? htmlBateriaEn(datos) : htmlBateria(datos);
    const texto = lang === 'en' ? textoBateriaEn(datos) : textoBateria(datos);

    let canal: 'gmail' | 'resend';
    const gmail = await isGmailConnected();
    if (gmail.connected) {
      const r = await sendViaGmail({
        to: c.email, subject: asunto, html, replyTo: RESPONDER_A,
        fromName: ATS_FROM_NAME,
      });
      if (!r.ok) return { enviado: false, motivo: r.error, url: ses.url };
      canal = 'gmail';
    } else if (process.env.RESEND_API_KEY) {
      const { error } = await getResend().emails.send({
        from: EMAIL_FROM, to: c.email, replyTo: RESPONDER_A, subject: asunto, html, text: texto,
      });
      if (error) return { enviado: false, motivo: error.message, url: ses.url };
      canal = 'resend';
    } else {
      return { enviado: false, motivo: 'sin Gmail ni Resend configurados', url: ses.url };
    }

    await supabaseAdmin
      .from('ts_bat_sessions')
      .update({ invited_at: new Date().toISOString(), invite_channel: `auto-${canal}`, invite_count: ses.invite_count + 1, updated_at: new Date().toISOString() })
      .eq('id', ses.id);
    await moverABateria(candidatoId, `Batería enviada automáticamente (${canal}) al pasar el prefiltro`);
    return { enviado: true, canal, url: ses.url };
  } catch (e: any) {
    console.error('bateria · envío automático falló', candidatoId, e?.message || e);
    return { enviado: false, motivo: e?.message ?? 'error' };
  }
}
