import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isAdminRequest } from '@/lib/bateria/auth';
import { asuntoBateria, htmlBateria, textoBateria } from '@/lib/bateria/correo';
import { asuntoBateriaEn, htmlBateriaEn, textoBateriaEn } from '@/lib/bateria/correo';
import { ATS_FROM_NAME } from '@/lib/ats-from';
import { resolveCandidateLang, type CandidateLang } from '@/lib/candidate-lang';
import { createDraftViaGmail, isGmailConnected } from '@/lib/gmail';
import { sendCandidateMail } from '@/lib/ats-mail-store';
import { moverABateria, sesionDe, limpiarBateriaPendiente, RESPONDER_A, type CandBateria } from '@/lib/bateria/invitar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Modo = 'previsualizar' | 'borrador' | 'enviar';
type Cand = CandBateria;

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

export async function POST(req: NextRequest) {
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

    // El borrador sale de jointheteam@. El envío directo también, por Gmail.
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

      let canal: string;
      let fallo: string | null = null;
      let emailStatus: 'sent' | 'pending' | 'draft' | 'not_sent' | 'bloqueado_staging' = 'not_sent';

      if (modo === 'borrador') {
        const r = await createDraftViaGmail({ to: c.email, subject: asunto, html, fromName: ATS_FROM_NAME });
        canal = 'gmail-borrador';
        if (!r.ok) {
          fallo = 'Gmail no dejó el borrador';
          console.error('bateria/enviar draft', r.error);
        } else {
          emailStatus = 'draft';
        }
      } else {
        const delivered = await sendCandidateMail({
          to: c.email,
          candidate: c.email,
          type: 'battery_invite',
          subject: asunto,
          html,
          replyTo: RESPONDER_A,
          dedupKey: `battery_invite:${ses.id}`,
          sideEffect: c.id
            ? { kind: 'battery', candidateId: c.id, sessionId: ses.id, channel: 'gmail' }
            : null,
        });
        if (delivered.status === 'sent') {
          canal = 'gmail';
          emailStatus = 'sent';
        } else if (delivered.status === 'bloqueado_staging') {
          canal = 'bloqueado_staging';
          emailStatus = 'bloqueado_staging';
        } else if (delivered.status === 'duplicado' || delivered.status === 'invalid_recipient') {
          canal = delivered.status;
          emailStatus = 'not_sent';
        } else {
          canal = 'pending';
          emailStatus = 'pending';
        }
      }

      if (modo === 'borrador' && !fallo) {
        await supabaseAdmin
          .from('ts_bat_sessions')
          .update({ invited_at: new Date().toISOString(), invite_channel: canal, invite_count: ses.invite_count + 1, updated_at: new Date().toISOString() })
          .eq('id', ses.id);
        if (c.id && body?.moverEtapa !== false) await moverABateria(c.id);
        if (c.id) await limpiarBateriaPendiente(c.id);
      }

      resultado.push({ id: c.id, nombre: c.nombre, email: c.email, url: ses.url, reusada: ses.reusada, canal, idioma: lang, email_status: emailStatus, error: fallo });
    }

    const ok = resultado.filter((r) => r.url && !r.error && r.email_status !== 'pending' && r.email_status !== 'bloqueado_staging').length;
    const pendientes = resultado.filter((r) => r.email_status === 'pending').length;
    const bloqueados = resultado.filter((r) => r.email_status === 'bloqueado_staging').length;
    return NextResponse.json(
      {
        modo,
        ok,
        pendientes,
        bloqueados,
        fallaron: resultado.filter((r) => r.error).length,
        cuenta: gmail.email ?? null,
        resultado,
        nota:
          modo === 'borrador'
            ? `Quedaron ${ok} borradores en la bandeja de ${gmail.email ?? 'Gmail'}. Revísalos y dales Enviar. Ya quedaron en la etapa Batería.`
            : `Salieron ${ok} correos por Gmail${pendientes ? ` y ${pendientes} quedaron pendientes` : ''}${bloqueados ? ` y ${bloqueados} quedaron bloqueados` : ''}. Las respuestas llegan a ${RESPONDER_A}.`,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('bateria/enviar', err);
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
