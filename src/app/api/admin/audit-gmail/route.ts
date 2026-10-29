/**
 * POST /api/admin/audit-gmail
 *
 * Cruza candidatos del ATS con su historial de Gmail (jointheteam@tradingsolutions.com)
 * para detectar inconsistencias entre stage en ATS vs último intercambio en email.
 *
 * Detecta señales como:
 *   - Candidato respondió un email pero stage no avanzó
 *   - ATS marca rechazado pero hay correspondencia activa
 *   - Stage = aplico pero ya enviamos prefiltro/Elevare via Gmail
 *
 * Body opcional: { vacancy_id?: string, only_active?: boolean }
 *
 * Respuesta: lista de findings con suggested_action por candidato.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getCandidateGmailHistory, isGmailConnected } from "@/lib/gmail";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

const ACTIVE_STAGES = [
  'aplico','prefiltro_enviado','prefiltro_pasado','prefiltro_revision',
  'assessment_invitado','assessment_en_progreso','assessment_completado',
  'entrevista_ia','bateria_psicometrica','recruiter_interview',
  'cwo_interview','touring','terna','oferta',
];

type Finding = {
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  vacancy_title: string | null;
  ats_stage: string;
  ats_status: string;
  last_message_date: string | null;
  last_message_direction: 'from_candidate' | 'to_candidate' | null;
  last_message_subject: string;
  last_message_snippet: string;
  total_messages: number;
  signal: 'response_pending' | 'stage_mismatch' | 'rejected_but_active' | 'never_sent' | 'rechazo_sin_correo' | 'rechazo_en_borrador' | 'no_findings';
  suggested_action: string;
  severity: 'high' | 'medium' | 'low' | 'none';
};

/**
 * ¿El correo de rechazo llegó a salir?
 *
 * POR QUÉ EXISTE: reject-with-reason NO envía el correo, crea un BORRADOR en
 * Gmail. Si nadie lo abre y le da enviar, el candidato queda marcado como
 * rechazado en el ATS y nunca se entera. Es el hueco más silencioso del proceso.
 *
 * El asunto lo arma rejectionSubject(): "Trading Solutions · Sobre tu aplicación a X".
 */
const ASUNTO_RECHAZO = /sobre tu aplicaci/i;

function estadoDelCorreoDeRechazo(messages: { subject: string; label_ids: string[] }[]) {
  let enviado = false;
  let enBorrador = false;
  for (const m of messages) {
    if (!ASUNTO_RECHAZO.test(m.subject || "")) continue;
    const labels = m.label_ids || [];
    if (labels.includes("SENT")) enviado = true;
    if (labels.includes("DRAFT")) enBorrador = true;
  }
  return { enviado, enBorrador };
}

function detectSignal(meta: {
  ats_stage: string;
  ats_status: string;
  last_message_direction: 'from_candidate' | 'to_candidate' | null;
  last_message_subject: string;
  last_message_internal_date: number | null;
  last_updated_at: string | null;
  total_messages: number;
  rechazo_enviado: boolean;
  rechazo_en_borrador: boolean;
}): { signal: Finding['signal']; suggested_action: string; severity: Finding['severity'] } {
  const subj = meta.last_message_subject.toLowerCase();
  const stage = meta.ats_stage;

  // 0) Stage = rechazado y el correo de rechazo nunca salió. Va primero porque
  //    es lo único de esta lista que deja a una persona esperando una respuesta
  //    que ya se tomó.
  if (stage === 'rechazado' && !meta.rechazo_enviado) {
    if (meta.rechazo_en_borrador) {
      return {
        signal: 'rechazo_en_borrador',
        suggested_action: 'El correo de rechazo quedó en BORRADORES y nunca se envió. Abrir Gmail y enviarlo.',
        severity: 'high',
      };
    }
    return {
      signal: 'rechazo_sin_correo',
      suggested_action: 'Marcado como rechazado pero no hay correo de rechazo ni borrador. Enviarlo desde la columna de rechazados.',
      severity: 'high',
    };
  }

  // 1) Stage = rechazado pero hay correspondencia reciente del candidato (FROM él)
  if (stage === 'rechazado' && meta.last_message_direction === 'from_candidate') {
    const lastMsg = meta.last_message_internal_date || 0;
    const lastUpdate = meta.last_updated_at ? new Date(meta.last_updated_at).getTime() : 0;
    if (lastMsg > lastUpdate) {
      return {
        signal: 'rejected_but_active',
        suggested_action: 'El candidato respondió DESPUÉS de marcarlo rechazado. Revisar si el email cambia algo.',
        severity: 'medium',
      };
    }
  }

  // 2) Stage = prefiltro_enviado y candidato respondió → mover a prefiltro_revision
  if (stage === 'prefiltro_enviado' && meta.last_message_direction === 'from_candidate') {
    return {
      signal: 'response_pending',
      suggested_action: 'Candidato respondió al prefiltro · mover a "prefiltro_revision"',
      severity: 'high',
    };
  }

  // 3) Stage = aplico pero ya hay email saliente (probablemente prefiltro)
  if (stage === 'aplico' && meta.last_message_direction === 'to_candidate' && meta.total_messages >= 1) {
    if (subj.includes('prefiltro') || subj.includes('preselecci')) {
      return {
        signal: 'stage_mismatch',
        suggested_action: 'Ya enviamos prefiltro (visto en Gmail). Mover stage a "prefiltro_enviado".',
        severity: 'high',
      };
    }
    if (subj.includes('evaluación') || subj.includes('elevare') || subj.includes('assessment')) {
      return {
        signal: 'stage_mismatch',
        suggested_action: 'Ya enviamos invitación a Elevare. Mover stage a "assessment_invitado".',
        severity: 'high',
      };
    }
  }

  // 4) Stage = assessment_invitado pero candidato respondió pidiendo ayuda/info
  if (stage === 'assessment_invitado' && meta.last_message_direction === 'from_candidate') {
    return {
      signal: 'response_pending',
      suggested_action: 'Candidato respondió tras invitación a Elevare · revisar si pide ayuda o reschedule.',
      severity: 'medium',
    };
  }

  // 5) Recruiter interview / CWO interview con respuesta pendiente
  if ((stage === 'recruiter_interview' || stage === 'cwo_interview') &&
      meta.last_message_direction === 'from_candidate') {
    return {
      signal: 'response_pending',
      suggested_action: `Candidato respondió en stage "${stage}" · puede ser confirmación o pregunta sobre la entrevista.`,
      severity: 'medium',
    };
  }

  // 6) Stage = terna/oferta + sin actividad reciente
  if ((stage === 'terna' || stage === 'oferta') && meta.last_message_internal_date) {
    const daysSince = Math.floor((Date.now() - meta.last_message_internal_date) / (1000 * 60 * 60 * 24));
    if (daysSince > 5) {
      return {
        signal: 'response_pending',
        suggested_action: `Sin contacto hace ${daysSince}d en stage "${stage}". Considerar follow-up.`,
        severity: 'high',
      };
    }
  }

  return { signal: 'no_findings', suggested_action: '', severity: 'none' };
}

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  // Verificar Gmail conectado
  const gmail = await isGmailConnected();
  if (!gmail.connected) {
    return NextResponse.json({
      error: "Gmail no conectado. Autorizá Gmail con scope 'gmail.readonly' en /api/google/auth",
      gmail_connected: false,
    }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const vacancyFilter = body.vacancy_id || null;
    const onlyActive = body.only_active !== false; // default true
    // Auditar los correos de rechazo: trae los rechazados aunque only_active siga true.
    const auditarRechazos = body.audit_rejections === true;

    // 1. Pull candidatos del ATS
    let q = supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, vacancy_id, stage, status, updated_at, ht_vacancies(title)")
      .eq("client_id", TS_CLIENT_ID)
      .not("email", "is", null)
      .not("email", "ilike", "%@tradingsolutions.com");

    if (vacancyFilter) q = q.eq('vacancy_id', vacancyFilter);
    if (onlyActive) q = q.in('stage', auditarRechazos ? [...ACTIVE_STAGES, 'rechazado'] : ACTIVE_STAGES);

    const { data: cands } = await q.limit(100);

    if (!cands || cands.length === 0) {
      return NextResponse.json({
        success: true,
        gmail_connected: true,
        message: "Sin candidatos que auditar",
        findings: [],
      });
    }

    // 2. Para cada candidato, pull historial Gmail (últimos 5 mensajes, 180 días back)
    const findings: Finding[] = [];
    let processed = 0;
    let withFindings = 0;

    for (const c of cands) {
      const email = c.email as string;
      if (!email) continue;

      // 15 mensajes en vez de 5: en un proceso largo el correo de rechazo se
      // sale de la ventana y lo daríamos por no enviado.
      const history = await getCandidateGmailHistory(email, 15, 180);
      processed++;

      if (!history.ok || history.messages.length === 0) {
        // Sin historial Gmail. Para un rechazado esto NO es neutro: significa
        // que nunca se le escribió.
        if ((c.stage || '') === 'rechazado') {
          withFindings++;
          findings.push({
            candidate_id: c.id,
            candidate_name: c.name,
            candidate_email: email,
            // @ts-expect-error supabase relation
            vacancy_title: c.ht_vacancies?.title || null,
            ats_stage: 'rechazado',
            ats_status: c.status || '',
            last_message_date: null,
            last_message_direction: null,
            last_message_subject: '',
            last_message_snippet: '',
            total_messages: 0,
            signal: 'rechazo_sin_correo',
            suggested_action: 'Marcado como rechazado y no hay ningún correo con esta persona. Enviarle el rechazo.',
            severity: 'high',
          });
        }
        continue;
      }

      const rechazo = estadoDelCorreoDeRechazo(history.messages);

      const last = history.messages[0];
      // Direction: si el FROM contiene el email del candidato → from_candidate
      const fromCandidate = last.from.toLowerCase().includes(email.toLowerCase());
      const direction = fromCandidate ? 'from_candidate' : 'to_candidate';

      const signal = detectSignal({
        ats_stage: c.stage || 'aplico',
        ats_status: c.status || '',
        last_message_direction: direction,
        last_message_subject: last.subject,
        last_message_internal_date: last.internal_date,
        last_updated_at: c.updated_at,
        total_messages: history.messages.length,
        rechazo_enviado: rechazo.enviado,
        rechazo_en_borrador: rechazo.enBorrador,
      });

      if (signal.signal !== 'no_findings') {
        withFindings++;
        findings.push({
          candidate_id: c.id,
          candidate_name: c.name,
          candidate_email: email,
          // @ts-expect-error supabase relation
          vacancy_title: c.ht_vacancies?.title || null,
          ats_stage: c.stage || 'aplico',
          ats_status: c.status || '',
          last_message_date: last.date,
          last_message_direction: direction,
          last_message_subject: last.subject,
          last_message_snippet: last.snippet,
          total_messages: history.messages.length,
          signal: signal.signal,
          suggested_action: signal.suggested_action,
          severity: signal.severity,
        });
      }
    }

    // Ordenar por severity
    const sevOrder: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };
    findings.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

    return NextResponse.json({
      success: true,
      gmail_connected: true,
      gmail_email: gmail.email,
      total_processed: processed,
      total_findings: withFindings,
      breakdown_by_severity: {
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
      },
      findings,
    });
  } catch (err: any) {
    console.error('audit-gmail error:', err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}

// GET preview/info
export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const gmail = await isGmailConnected();
  return NextResponse.json({
    gmail_connected: gmail.connected,
    gmail_email: gmail.email,
    note: gmail.connected
      ? "POST /api/admin/audit-gmail para correr auditoría completa. Tarda ~30s para 50 candidatos."
      : "Primero autorizá Gmail en /api/google/auth con scope gmail.readonly",
  });
}
