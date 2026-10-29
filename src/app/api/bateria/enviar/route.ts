import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { isAdminRequest } from '@/lib/bateria/auth';
import { BATTERY_VERSION } from '@/lib/bateria/items';
import { asuntoBateria, htmlBateria, textoBateria, FIRMA } from '@/lib/bateria/correo';
import { asuntoBateriaEn, htmlBateriaEn, textoBateriaEn, FIRMA_EN } from '@/lib/bateria/correo';
import { resolveCandidateLang, type CandidateLang } from '@/lib/candidate-lang';
import { createDraftViaGmail, isGmailConnected } from '@/lib/gmail';
import { getResend, EMAIL_FROM } from '@/lib/resend';
import { recordStageEvent } from '@/lib/stage-events';
import { normalizeStage, STAGE_RANK } from '@/lib/stage-labels';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Las respuestas van a la cuenta de reclutamiento, no al remitente tecnico. */
const RESPONDER_A = 'jointheteam@tradingsolutions.com';

/** La etapa en la que queda quien ya recibio la bateria. */
const ETAPA_BATERIA = 'pruebas';

/**
 * Mandar la bateria ES lo que pone al candidato en esa etapa. Dejarlo como dos
 * acciones separadas garantiza que tarde o temprano se haga la primera y se
 * olvide la segunda, y entonces el funnel deja de decir la verdad sobre donde
 * esta cada quien — que es justo para lo que sirve.
 *
 * Solo mueve hacia adelante: a quien ya va mas avanzado no se le retrocede por
 * reenviarle su enlace.
 */
async function moverABateria(candidatoId: string) {
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
  if (error) { console.error('bateria/enviar · no se pudo mover de etapa', candidatoId, error.message); return; }

  await recordStageEvent({
    candidateId: candidatoId,
    fromStage: c.stage ?? null,
    toStage: ETAPA_BATERIA,
    vacancyId: c.vacancy_id ?? null,
    source: 'system',
    note: 'Batería enviada desde el ATS',
  });
}

type Modo = 'previsualizar' | 'borrador' | 'enviar';
type Cand = { id?: string; nombre?: string; email?: string; vacante?: string };

/**
 * Idioma de cada candidato · el proceso de China va en ingles.
 *
 * El cuerpo del request solo trae nombre, correo y vacante, asi que la regla
 * (plantilla, preferencia y pais de la vacante) hay que ir a buscarla a la
 * base: en una sola consulta para todos los ids, no una por candidato.
 */
async function idiomasDe(candidatos: Cand[]): Promise<Map<string, CandidateLang>> {
  const mapa = new Map<string, CandidateLang>();
  const ids = candidatos.map((c) => c.id).filter((id): id is string => Boolean(id));
  if (!ids.length) return mapa;

  const { data, error } = await supabaseAdmin
    .from('ht_candidates')
    .select('id, preferred_language, ht_vacancies(title, form_template_key, country)')
    .in('id', ids);
  if (error) { console.error('bateria/enviar · no se pudo resolver el idioma', error.message); return mapa; }

  for (const fila of data ?? []) {
    const vac = (fila as any).ht_vacancies;
    mapa.set(
      String((fila as any).id),
      resolveCandidateLang({
        formTemplateKey: vac?.form_template_key,
        preferredLanguage: (fila as any).preferred_language,
        jobTitle: vac?.title,
        country: vac?.country,
      })
    );
  }
  return mapa;
}

/** Sin ficha en la base queda el titulo que mando el ATS · "... China" basta. */
function idiomaDe(c: Cand, mapa: Map<string, CandidateLang>): CandidateLang {
  const porFicha = c.id ? mapa.get(c.id) : undefined;
  return porFicha ?? resolveCandidateLang({ jobTitle: c.vacante ?? null });
}

/**
 * Un enlace por persona. Si el candidato ya tiene sesion se reusa la suya:
 * crear una segunda le borraria el avance de la primera y dejaria dos filas
 * compitiendo por el mismo informe.
 */
async function sesionDe(c: Cand, perfil: string | null, origin: string) {
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

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  if (!isAdminRequest(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const modo: Modo = body?.modo ?? 'previsualizar';
    const perfil: string | null = body?.perfil || null;
    const candidatos: Cand[] = Array.isArray(body?.candidatos) ? body.candidatos : [];
    const origin = req.nextUrl.origin;

    // ── Vista previa ─────────────────────────────────────────────────────
    // No crea sesiones ni toca la base. Es exactamente el mismo HTML que
    // despues sale en el borrador, con un enlace de ejemplo.
    if (modo === 'previsualizar') {
      const c = candidatos[0] ?? {};
      // La vista previa tiene que salir en el idioma en el que saldria el
      // envio: si Kelly aprueba un correo en espanol para un candidato de
      // China, aprobo algo que el candidato nunca va a recibir.
      const lang = idiomaDe(c, await idiomasDe([c]));
      const datos = {
        nombre: c.nombre ?? (lang === 'en' ? 'Mei Lin Chen' : 'María Fernanda Gómez'),
        vacante: c.vacante ?? (lang === 'en' ? 'Administration & Office Setup Lead' : 'Especialista SIG-SST'),
        url: `${origin}/prueba/ASI-SE-VE-EL-ENLACE`,
      };
      return NextResponse.json(
        {
          modo,
          idioma: lang,
          asunto: lang === 'en' ? asuntoBateriaEn(datos.vacante) : asuntoBateria(datos.vacante),
          html: lang === 'en' ? htmlBateriaEn(datos) : htmlBateria(datos),
          texto: lang === 'en' ? textoBateriaEn(datos) : textoBateria(datos),
          para: c.email ?? 'candidato@ejemplo.com',
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!candidatos.length) return NextResponse.json({ error: 'Sin candidatos' }, { status: 400 });

    // Gmail primero: el borrador sale de la cuenta de reclutamiento, con su
    // firma y su historial. Resend es la salida de emergencia.
    const gmail = modo === 'borrador' ? await isGmailConnected() : { connected: false as boolean, email: undefined as string | undefined };
    if (modo === 'borrador' && !gmail.connected) {
      return NextResponse.json(
        { error: 'Gmail no está conectado, así que no puedo dejar los borradores en su bandeja. Conéctelo en Ajustes o use "Enviar ahora".' },
        { status: 409 }
      );
    }

    const resultado: any[] = [];
    const idiomas = await idiomasDe(candidatos.slice(0, 100));

    for (const c of candidatos.slice(0, 100)) {
      let ses;
      try {
        ses = await sesionDe(c, perfil, origin);
      } catch (e: any) {
        resultado.push({ id: c.id, nombre: c.nombre, email: c.email, error: e?.message ?? 'no se creó la sesión' });
        continue;
      }

      if (!c.email) {
        resultado.push({ ...c, url: ses.url, reusada: ses.reusada, error: 'sin correo en la ficha' });
        continue;
      }

      const lang = idiomaDe(c, idiomas);
      const datos = { nombre: c.nombre ?? null, vacante: c.vacante ?? null, url: ses.url };
      const asunto = lang === 'en' ? asuntoBateriaEn(c.vacante ?? null) : asuntoBateria(c.vacante ?? null);
      const html = lang === 'en' ? htmlBateriaEn(datos) : htmlBateria(datos);
      const texto = lang === 'en' ? textoBateriaEn(datos) : textoBateria(datos);

      let canal: string;
      let fallo: string | null = null;

      if (modo === 'borrador') {
        const r = await createDraftViaGmail({ to: c.email, subject: asunto, html, fromName: `${lang === 'en' ? FIRMA_EN : FIRMA} · Trading Solutions` });
        canal = 'gmail-borrador';
        if (!r.ok) fallo = r.error ?? 'Gmail rechazó el borrador';
      } else {
        const resend = getResend();
        const { error: eMail } = await resend.emails.send({
          from: EMAIL_FROM,
          to: c.email,
          replyTo: RESPONDER_A,
          subject: asunto,
          html,
          text: texto,
        });
        canal = 'resend';
        if (eMail) fallo = eMail.message;
      }

      if (!fallo) {
        await supabaseAdmin
          .from('ts_bat_sessions')
          .update({ invited_at: new Date().toISOString(), invite_channel: canal, invite_count: ses.invite_count + 1, updated_at: new Date().toISOString() })
          .eq('id', ses.id);
        if (c.id && body?.moverEtapa !== false) await moverABateria(c.id);
      }

      resultado.push({ id: c.id, nombre: c.nombre, email: c.email, url: ses.url, reusada: ses.reusada, canal, idioma: lang, error: fallo });
    }

    const ok = resultado.filter((r) => r.url && !r.error).length;
    return NextResponse.json(
      {
        modo,
        ok,
        fallaron: resultado.filter((r) => r.error).length,
        cuenta: gmail.email ?? null,
        resultado,
        nota:
          modo === 'borrador'
            ? `Quedaron ${ok} borradores en la bandeja de ${gmail.email ?? 'Gmail'}. Revíselos y déles Enviar. Ya quedaron en la etapa Batería.`
            : `Salieron ${ok} correos y quedaron en la etapa Batería. Las respuestas llegan a ${RESPONDER_A}.`,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('bateria/enviar', err);
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
