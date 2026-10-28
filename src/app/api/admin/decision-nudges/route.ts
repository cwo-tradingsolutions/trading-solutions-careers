/**
 * GET  /api/admin/decision-nudges  → lista candidatos con decisión pendiente + nudges activos
 * POST /api/admin/decision-nudges  → crea nudge (Gmail draft) para un candidato específico
 *
 * Body POST: { candidate_id, recipient_email, recipient_name, recipient_role, interview_type }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import crypto from "crypto";
import { ATS_FROM_NAME } from "@/lib/ats-from";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

// Stages que requieren decisión humana antes de avanzar.
// Se filtra a nivel BD, así que tienen que ser codes v4 vivos: con los viejos
// (cwo_interview, touring) la lista salía vacía y nadie recibía nudge.
// Toda la fase de contratación entra · cada paso espera una respuesta.
const STAGES_NEEDING_DECISION = [
  'recruiter_interview',
  'prueba_tecnica',
  'terna',
  'examenes_medicos',
  'estudio_seguridad',
  'documentacion_ingreso',
  'oferta',
];

function buildEmail(opts: {
  candidate_name: string;
  candidate_role_at_company?: string;
  vacancy_title: string;
  interview_type: string;
  recipient_name: string;
  base_url: string;
  token: string;
  ai_summary?: string;
  ai_score?: number;
}): string {
  const linkAvanza = `${opts.base_url}/decision/${opts.token}?d=avanza`;
  const linkNoAvanza = `${opts.base_url}/decision/${opts.token}?d=no_avanza`;
  const linkOther = `${opts.base_url}/decision/${opts.token}?d=recommend_other_vacancy`;
  const linkMore = `${opts.base_url}/decision/${opts.token}?d=needs_more_info`;
  const firstName = opts.recipient_name.split(' ')[0] || opts.recipient_name;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.55; color: #0a0a0a; padding: 0; margin: 0; background: #fafafa; }
  .wrap { max-width: 580px; margin: 0 auto; padding: 24px 16px; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #737373; margin-bottom: 8px; }
  .container { background: white; border: 1px solid #e8e8e8; padding: 32px; }
  h2 { margin: 0 0 14px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; }
  .candidate-card { background: #fafafa; border: 1px solid #e8e8e8; padding: 16px 18px; margin: 20px 0; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; color: #737373; margin-bottom: 4px; }
  .btn { display: block; padding: 13px 22px; font-weight: 700; text-decoration: none; font-size: 13px; margin: 8px auto; text-align: center; max-width: 320px; letter-spacing: 0.3px; }
  .btn-yes { background: #1a7d3e; color: white; }
  .btn-no { background: #c41818; color: white; }
  .btn-other { background: #0a0a0a; color: white; }
  .btn-more { background: white; color: #0a0a0a; border: 1px solid #d4d4d4; }
  .actions { margin: 24px 0 12px; }
  .footer { font-size: 12px; color: #737373; margin-top: 24px; padding-top: 18px; border-top: 1px solid #e8e8e8; }
  .ai-summary { background: #fff8e1; border-left: 3px solid #f5b700; padding: 12px 14px; font-size: 13px; margin: 16px 0; }
  .ai-summary .label { color: #8a6d1c; }
  p { font-size: 14px; margin: 0 0 12px; }
</style></head><body>
  <div class="wrap">
    <div class="eyebrow">Trading Solutions · Talento</div>
    <div class="container">
      <h2>Hola ${firstName}, tengo a alguien para vos.</h2>
      <p style="color:#525252;">Quería pedirte tu lectura sobre este candidato cuando puedas. Con dos clicks te alcanza · si te queda alguna duda, escribime y lo conversamos.</p>

      <div class="candidate-card">
        <div class="label">Candidato</div>
        <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em;">${opts.candidate_name}</div>
        ${opts.candidate_role_at_company ? `<div style="font-size:13px;color:#737373;margin-top:4px;">${opts.candidate_role_at_company}</div>` : ''}
        <div class="label" style="margin-top:14px;">Vacante</div>
        <div style="font-weight:600;font-size:14px;">${opts.vacancy_title}</div>
        <div class="label" style="margin-top:14px;">Etapa</div>
        <div style="font-weight:600;font-size:14px;text-transform:capitalize;">${opts.interview_type.replace('_',' ')}</div>
      </div>

      ${opts.ai_summary ? `
      <div class="ai-summary">
        <div class="label">Lectura IA · score ${opts.ai_score ?? '—'}/100</div>
        <div style="margin-top:4px;">${opts.ai_summary}</div>
      </div>
      ` : ''}

      <div class="actions">
        <a href="${linkAvanza}" class="btn btn-yes">Sí, avanza para esta vacante</a>
        <a href="${linkOther}" class="btn btn-other">Para esta no, pero lo veo en otra</a>
        <a href="${linkNoAvanza}" class="btn btn-no">No avanza</a>
        <a href="${linkMore}" class="btn btn-more">Quiero verlo de nuevo</a>
      </div>

      <p style="font-size:12px;color:#737373;text-align:center;margin-top:18px;">
        Tu respuesta actualiza el stage automáticamente. Si te quedaron dudas que un click no resuelve, contestame este correo.
      </p>

      <div class="footer">
        Un abrazo,<br/>
        <strong>Talent Acquisition Team</strong>
      </div>
    </div>
  </div>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  // Candidatos en stages que requieren decisión + sin decisión activa
  const { data: cands } = await supabaseAdmin
    .from("ht_candidates")
    .select("id, name, email, vacancy_id, stage, status, updated_at, ht_vacancies(title, area)")
    .eq("client_id", TS_CLIENT_ID)
    .in("stage", STAGES_NEEDING_DECISION)
    .order("updated_at", { ascending: true })
    .limit(50);

  // Decisiones existentes
  const candIds = (cands || []).map((c: any) => c.id);
  const { data: decisions } = candIds.length > 0
    ? await supabaseAdmin
        .from("ts_interview_decisions")
        .select("*")
        .in("candidate_id", candIds)
        .order("sent_at", { ascending: false })
    : { data: [] };

  // Mapear: por cada candidato, cuántos nudges enviados, último, decisión final
  const decisionByCand: Record<string, any> = {};
  (decisions || []).forEach((d: any) => {
    const existing = decisionByCand[d.candidate_id];
    if (!existing) {
      decisionByCand[d.candidate_id] = {
        last_decision: d,
        nudges_sent: 1,
        any_response: !!d.responded_at,
      };
    } else {
      existing.nudges_sent++;
      if (d.responded_at) existing.any_response = true;
    }
  });

  const items = (cands || []).map((c: any) => {
    const d = decisionByCand[c.id];
    const daysSinceUpdate = c.updated_at
      ? Math.floor((Date.now() - new Date(c.updated_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return {
      candidate_id: c.id,
      candidate_name: c.name,
      candidate_email: c.email,
      vacancy_id: c.vacancy_id,
      vacancy_title: c.ht_vacancies?.title || null,
      vacancy_area: c.ht_vacancies?.area || null,
      stage: c.stage,
      status: c.status,
      days_since_stage_update: daysSinceUpdate,
      nudges_sent: d?.nudges_sent || 0,
      last_nudge_recipient: d?.last_decision?.recipient_email || null,
      last_nudge_at: d?.last_decision?.sent_at || null,
      decision: d?.last_decision?.responded_at ? d.last_decision.decision : null,
      decided_at: d?.last_decision?.responded_at || null,
    };
  });

  return NextResponse.json({
    candidates: items,
    total: items.length,
    pending_decision: items.filter(i => !i.decision).length,
    overdue: items.filter(i => !i.decision && (i.days_since_stage_update || 0) > 5).length,
  });
}

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { candidate_id, recipient_email, recipient_name, recipient_role, interview_type } = body;

    if (!candidate_id || !recipient_email || !recipient_role) {
      return NextResponse.json({ error: "Faltan candidate_id, recipient_email, recipient_role" }, { status: 400 });
    }

    // Normalize emails: accept space/comma/semicolon-separated input, validate, output as "a, b, c"
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const rawEmails = String(recipient_email)
      .split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(Boolean);
    const validEmails = rawEmails.filter(e => emailRegex.test(e));
    const invalidEmails = rawEmails.filter(e => !emailRegex.test(e));

    if (validEmails.length === 0) {
      return NextResponse.json({
        error: `No se encontraron emails válidos. Recibido: "${recipient_email}". Separá con coma o espacio.`
      }, { status: 400 });
    }
    if (invalidEmails.length > 0) {
      return NextResponse.json({
        error: `Emails inválidos: ${invalidEmails.join(', ')}. Revisá el formato.`
      }, { status: 400 });
    }

    const normalizedTo = validEmails.join(', ');
    const primaryEmail = validEmails[0];

    // Get candidate + vacancy
    const { data: cand } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, current_job_role, current_company, vacancy_id, stage, ht_vacancies(title)")
      .eq("id", candidate_id)
      .single();

    if (!cand) return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });

    // Pull AI summary si existe (de ai interview o elevare)
    const { data: aiInt } = await supabaseAdmin
      .from("ht_ai_interviews")
      .select("ai_summary, ai_score, overall_score")
      .eq("candidate_id", candidate_id)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const token = crypto.randomBytes(20).toString('hex');
    const baseUrl = (req.headers.get('host') && !req.headers.get('host')!.includes('localhost'))
      ? `https://${req.headers.get('host')}`
      : 'https://trading-solutions-careers.vercel.app';

    const html = buildEmail({
      candidate_name: cand.name,
      candidate_role_at_company: cand.current_job_role && cand.current_company
        ? `${cand.current_job_role} en ${cand.current_company}`
        : cand.current_job_role || undefined,
      // @ts-expect-error supabase relation
      vacancy_title: cand.ht_vacancies?.title || 'Vacante',
      interview_type: interview_type || cand.stage || 'entrevista',
      recipient_name: recipient_name || primaryEmail.split('@')[0],
      base_url: baseUrl,
      token,
      ai_summary: aiInt?.ai_summary || undefined,
      ai_score: aiInt?.ai_score ?? aiInt?.overall_score ?? undefined,
    });

    const subject = `Tu lectura sobre ${cand.name} · 2 clicks`;

    // Crear draft en Gmail (To: comma-separated RFC 822)
    const draftRes = await createDraftViaGmail({
      to: normalizedTo,
      subject,
      html,
      fromName: ATS_FROM_NAME,
      replyTo: 'jointheteam@tradingsolutions.com',
    });

    if (!draftRes.ok) {
      return NextResponse.json({ error: draftRes.error }, { status: 500 });
    }

    // Insertar registro (recipient_email = todos los emails normalizados)
    const { data: decisionRow, error: insErr } = await supabaseAdmin
      .from("ts_interview_decisions")
      .insert({
        candidate_id,
        vacancy_id: cand.vacancy_id,
        interview_type: interview_type || cand.stage,
        recipient_role,
        recipient_email: normalizedTo,
        recipient_name: recipient_name || null,
        token,
        channel: 'email',
        sent_via_draft_id: draftRes.draft_id,
      })
      .select()
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      decision_id: decisionRow.id,
      token,
      draft_id: draftRes.draft_id,
      decision_url: `${baseUrl}/decision/${token}`,
    });
  } catch (err: any) {
    console.error('decision-nudges POST error:', err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
