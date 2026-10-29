/**
 * POST /api/headhunting/candidates/[candidateId]/schedule-interview
 *
 * Body:
 * {
 *   interview_type: 'recruiter'|'cwo'|'technical'|'area_lead'|'wellness'|'final',
 *   scheduled_at: ISO date string,
 *   duration_min?: number (default 45),
 *   location?: string,
 *   meeting_url?: string (Google Meet, Zoom, etc.),
 *   interviewer_emails?: string[],
 *   send_email?: boolean (default true)
 * }
 *
 * - Crea registro en ts_interviews
 * - Genera .ics calendar invite
 * - Envía email al candidato con .ics adjunto + Google Calendar link
 * - Retorna info incluyendo google_calendar_url para que Kelly también lo agregue a su calendar
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { resolveCandidateLang, isChinaProcess } from "@/lib/candidate-lang";
import { supabaseAdmin } from "@/lib/supabase";
import { getResend, EMAIL_FROM, EMAIL_BCC } from "@/lib/resend";
import { buildIcs, buildGoogleCalendarUrl } from "@/lib/ics";
import crypto from "crypto";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

const TYPE_LABEL: Record<string, string> = {
  recruiter: 'Entrevista con Recruiter',
  cwo: 'Entrevista con CWO',
  technical: 'Entrevista técnica',
  area_lead: 'Entrevista con líder del área',
  wellness: 'Entrevista de Wellness / Fit cultural',
  final: 'Entrevista final',
};

const TYPE_LABEL_EN: Record<string, string> = {
  recruiter: 'Recruiter interview',
  cwo: 'Interview with the CWO',
  technical: 'Technical interview',
  area_lead: 'Interview with the hiring lead',
  wellness: 'Wellness / culture fit interview',
  final: 'Final interview',
};

export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidateId } = params;
    const body = await req.json();

    if (!body.interview_type || !TYPE_LABEL[body.interview_type]) {
      return NextResponse.json({ error: "interview_type inválido" }, { status: 400 });
    }
    if (!body.scheduled_at) {
      return NextResponse.json({ error: "scheduled_at requerido (ISO date)" }, { status: 400 });
    }

    const scheduledAt = new Date(body.scheduled_at);
    if (isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: "scheduled_at inválido" }, { status: 400 });
    }

    const duration = Number(body.duration_min) || 45;
    const sendEmail = body.send_email !== false;

    // Get candidate + vacancy
    const { data: cand, error: cErr } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, vacancy_id, preferred_language, ht_vacancies(title, form_template_key, country)")
      .eq("id", candidateId)
      .single();
    if (cErr || !cand) {
      return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
    }

    // @ts-expect-error supabase relation
    const vacTitle: string = cand.ht_vacancies?.title || 'Trading Solutions';
    const typeLabel = TYPE_LABEL[body.interview_type];
    // Idioma del proceso · China va en inglés y con la hora en su huso.
    const lang = resolveCandidateLang({
      formTemplateKey: (cand as any).ht_vacancies?.form_template_key,
      preferredLanguage: (cand as any).preferred_language,
      jobTitle: (cand as any).ht_vacancies?.title,
      country: (cand as any).ht_vacancies?.country,
    });
    const typeLabelEn = TYPE_LABEL_EN[body.interview_type] || typeLabel;
    const china = isChinaProcess({
      formTemplateKey: (cand as any).ht_vacancies?.form_template_key,
      jobTitle: (cand as any).ht_vacancies?.title,
      country: (cand as any).ht_vacancies?.country,
    });
    const icsUid = `ts-${crypto.randomBytes(8).toString('hex')}@tradingsolutions.com`;

    // Insert interview
    const { data: interview, error: insErr } = await supabaseAdmin
      .from("ts_interviews")
      .insert({
        candidate_id: candidateId,
        vacancy_id: cand.vacancy_id,
        interview_type: body.interview_type,
        scheduled_at: scheduledAt.toISOString(),
        duration_min: duration,
        location: body.location || null,
        meeting_url: body.meeting_url || null,
        interviewer_emails: body.interviewer_emails || [],
        ics_uid: icsUid,
        status: 'scheduled',
      })
      .select()
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    // Build .ics
    const ev = {
      uid: icsUid,
      title: `${typeLabel} · ${vacTitle} · Trading Solutions`,
      description: lang === 'en'
        ? `Interview for the ${vacTitle} position at Trading Solutions.\n\n${
            body.meeting_url ? `Meeting link: ${body.meeting_url}\n\n` : ''
          }If you need to reschedule, just reply to this email. See you there!\n\nTalent Team · Trading Solutions`
        : `Entrevista para la posición de ${vacTitle} en Trading Solutions.\n\n${
            body.meeting_url ? `Link de la reunión: ${body.meeting_url}\n\n` : ''
          }Si necesitas reagendar, responde a este correo. ¡Nos vemos!\n\nEquipo Talent Acquisition · Trading Solutions`,
      start: scheduledAt,
      durationMinutes: duration,
      location: body.location,
      meetingUrl: body.meeting_url,
      organizer: { name: 'Kelly Castañeda', email: 'kcastaneda10@gmail.com' },
      attendees: [
        { name: cand.name, email: cand.email },
        ...(body.interviewer_emails || []).map((e: string) => ({ email: e })),
      ],
    };

    const icsContent = buildIcs(ev);
    const googleUrl = buildGoogleCalendarUrl(ev);

    // Send email with .ics attachment
    let emailResult: any = null;
    if (sendEmail) {
      try {
        const fmtDate = scheduledAt.toLocaleString('es-CO', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Bogota',
        });

        // En inglés se manda la hora local del candidato (China) y, entre
        // paréntesis, la de Colombia: la reunión es entre los dos husos.
        const fmtDateCn = scheduledAt.toLocaleString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
          timeZone: china ? 'Asia/Shanghai' : 'America/Bogota',
        });
        const fmtDateCo = scheduledAt.toLocaleString('en-US', {
          hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota',
        });

        const htmlEn = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
            <div style="background: #000; color: #fff; padding: 16px 20px; border-radius: 8px 8px 0 0; font-weight: 800; letter-spacing: 2px; font-size: 14px;">TRADING SOLUTIONS</div>
            <div style="border: 1px solid #e5e5e5; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 14px;">Hi ${cand.name?.split(' ')[0] || ''},</p>
              <p style="margin: 0 0 14px; line-height: 1.55;">Your <strong>${typeLabelEn.toLowerCase()}</strong> for the <strong>${vacTitle}</strong> position is confirmed.</p>
              <div style="background: #f5f5f5; border-left: 4px solid #000; padding: 14px 16px; margin: 16px 0; border-radius: 4px;">
                <div style="font-size: 13px; line-height: 1.6;">
                  <strong>📅 ${fmtDateCn}${china ? ' (China time)' : ' (Colombia time)'}</strong><br/>
                  ${china ? `<span style="color:#555;">${fmtDateCo} Colombia time</span><br/>` : ''}
                  <strong>⏱ Duration:</strong> ${duration} minutes<br/>
                  ${body.meeting_url ? `<strong>🔗 Link:</strong> <a href="${body.meeting_url}" style="color: #2C64ED;">${body.meeting_url}</a><br/>` : ''}
                  ${body.location ? `<strong>📍 Location:</strong> ${body.location}<br/>` : ''}
                </div>
              </div>
              <div style="text-align: center; margin: 22px 0;">
                <a href="${googleUrl}" style="display: inline-block; background: #2C64ED; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: 700; border-radius: 8px; font-size: 13px;">📆 Add to Google Calendar</a>
              </div>
              <p style="margin: 16px 0 0; font-size: 12px; color: #555; line-height: 1.55;">The attached .ics file also works with Outlook, Apple Calendar and others. If you can't make it, please reply to this email as soon as possible so we can reschedule.</p>
              <p style="margin: 22px 0 0; font-size: 12px; color: #888;">Talent Team · Trading Solutions</p>
            </div>
          </div>
        `;

        const htmlEs = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
            <div style="background: #000; color: #fff; padding: 16px 20px; border-radius: 8px 8px 0 0; font-weight: 800; letter-spacing: 2px; font-size: 14px;">TRADING SOLUTIONS</div>
            <div style="border: 1px solid #e5e5e5; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 14px;">Hola ${cand.name?.split(' ')[0] || ''},</p>
              <p style="margin: 0 0 14px; line-height: 1.55;">Te confirmamos tu <strong>${typeLabel.toLowerCase()}</strong> para la posición de <strong>${vacTitle}</strong>.</p>
              <div style="background: #f5f5f5; border-left: 4px solid #000; padding: 14px 16px; margin: 16px 0; border-radius: 4px;">
                <div style="font-size: 13px; line-height: 1.6;">
                  <strong>📅 ${fmtDate}</strong><br/>
                  <strong>⏱ Duración:</strong> ${duration} minutos<br/>
                  ${body.meeting_url ? `<strong>🔗 Link:</strong> <a href="${body.meeting_url}" style="color: #2C64ED;">${body.meeting_url}</a><br/>` : ''}
                  ${body.location ? `<strong>📍 Ubicación:</strong> ${body.location}<br/>` : ''}
                </div>
              </div>
              <div style="text-align: center; margin: 22px 0;">
                <a href="${googleUrl}" style="display: inline-block; background: #2C64ED; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: 700; border-radius: 8px; font-size: 13px;">📆 Agregar a Google Calendar</a>
              </div>
              <p style="margin: 16px 0 0; font-size: 12px; color: #555; line-height: 1.55;">El archivo adjunto (.ics) también funciona con Outlook, Apple Calendar y otros. Si no puedes asistir, responde este correo lo antes posible para reagendar.</p>
              <p style="margin: 22px 0 0; font-size: 12px; color: #888;">Equipo Talent Acquisition · Trading Solutions</p>
            </div>
          </div>
        `;

        const html = lang === 'en' ? htmlEn : htmlEs;

        const r = await getResend().emails.send({
          from: EMAIL_FROM,
          to: cand.email,
          bcc: EMAIL_BCC,
          subject: lang === 'en'
            ? `Trading Solutions · ${typeLabelEn} scheduled for ${vacTitle}`
            : `Trading Solutions · ${typeLabel} agendada para ${vacTitle}`,
          html,
          attachments: [
            {
              filename: 'invitacion.ics',
              content: Buffer.from(icsContent).toString('base64'),
              contentType: 'text/calendar; charset=utf-8; method=REQUEST',
            } as any,
          ],
        });

        emailResult = { sent: true, id: (r as any)?.data?.id || null };

        await supabaseAdmin
          .from("ts_interviews")
          .update({ email_sent: true, email_sent_at: new Date().toISOString() })
          .eq("id", interview.id);
      } catch (e: any) {
        emailResult = { sent: false, error: e?.message || String(e) };
      }
    }

    return NextResponse.json({
      success: true,
      interview_id: interview.id,
      google_calendar_url: googleUrl,
      ics_uid: icsUid,
      email: emailResult,
    });
  } catch (err: any) {
    console.error("schedule-interview error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}

// GET — list interviews for a candidate
export async function GET(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from("ts_interviews")
    .select("*")
    .eq("candidate_id", params.candidateId)
    .order("scheduled_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interviews: data || [] });
}
