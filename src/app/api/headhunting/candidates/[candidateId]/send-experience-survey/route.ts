/**
 * POST /api/headhunting/candidates/[candidateId]/send-experience-survey
 *
 * Genera un token único, crea registro en ts_candidate_experience y devuelve el link
 * Opcionalmente envía email al candidato si ?send=true
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { sendViaGmail, isGmailConnected } from "@/lib/gmail";
import { resolveCandidateLang } from "@/lib/candidate-lang";
import crypto from "crypto";
import { ATS_FROM_NAME } from "@/lib/ats-from";

export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidateId } = params;
    const url = new URL(req.url);
    const send = url.searchParams.get("send") === "true";

    // Get candidate + vacancy
    const { data: cand, error: cErr } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, stage, status, vacancy_id, preferred_language, ht_vacancies(title, form_template_key, country)")
      .eq("id", candidateId)
      .single();

    if (cErr || !cand) {
      return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
    }

    // Idioma del proceso · China va en ingles.
    const lang = resolveCandidateLang({
      formTemplateKey: (cand as any).ht_vacancies?.form_template_key,
      preferredLanguage: (cand as any).preferred_language,
      jobTitle: (cand as any).ht_vacancies?.title,
      country: (cand as any).ht_vacancies?.country,
    });

    // Determine outcome
    let outcome: 'rejected' | 'hired' | 'withdrew' | 'other' = 'other';
    if (cand.stage === 'rechazado') outcome = 'rejected';
    else if (cand.stage === 'contratado') outcome = 'hired';
    else if (cand.status === 'withdrew') outcome = 'withdrew';

    // Check si ya hay encuesta activa no-completa
    const { data: existing } = await supabaseAdmin
      .from("ts_candidate_experience")
      .select("id, token, submitted_at")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let token: string;
    let surveyId: string;

    if (existing && !existing.submitted_at) {
      // Reusar token existente
      token = existing.token;
      surveyId = existing.id;
    } else {
      // Crear nuevo token
      token = crypto.randomBytes(20).toString('hex');
      const { data: created, error: insErr } = await supabaseAdmin
        .from("ts_candidate_experience")
        .insert({
          candidate_id: candidateId,
          vacancy_id: cand.vacancy_id,
          token,
          outcome,
        })
        .select()
        .single();
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
      surveyId = created.id;
    }

    // Auto-detecta URL: en prod usa Vercel host, fallback a la URL canónica TS
    const host = req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = host && !host.includes('localhost')
      ? `${proto}://${host}`
      : "https://trading-solutions-careers.vercel.app";
    const surveyLink = `${baseUrl}/encuesta/${token}`;

    // Send email via Gmail · sale desde jointheteam@tradingsolutions.com con buena entregabilidad
    let emailResult = null;
    if (send && cand.email) {
      try {
        const gmail = await isGmailConnected();
        if (!gmail.connected) {
          emailResult = { sent: false, error: "Gmail no conectado · ve a Settings y conecta Gmail" };
        } else {
          const firstName = cand.name?.split(' ')[0] || (lang === 'en' ? 'there' : 'Hola');
          const subjectEs = outcome === 'hired'
            ? `${firstName}, ¿cómo fue tu experiencia con Trading Solutions?`
            : `${firstName}, nos gustaría conocer tu opinión sobre el proceso`;
          const subjectEn = outcome === 'hired'
            ? `${firstName}, how was your experience with Trading Solutions?`
            : `${firstName}, we would love to hear your thoughts on the process`;
          const subject = lang === 'en' ? subjectEn : subjectEs;

          const greeting = outcome === 'hired'
            ? `¡Felicitaciones por unirte a Trading Solutions! Antes de empezar, queremos saber cómo viviste el proceso.`
            : `Gracias por participar en nuestro proceso de selección. Aunque esta vez no avanzamos juntos, tu experiencia importa y nos ayuda a mejorar.`;

          const greetingEn = outcome === 'hired'
            ? `Congratulations on joining Trading Solutions! Before you start, we would like to know how the process felt for you.`
            : `Thank you for taking part in our selection process. Even though we are not moving forward together this time, your experience matters and helps us improve.`;

          const htmlEs = `
            <div style="font-family: 'Open Sauce Sans', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0a0a0a; background: #fafafa;">
              <div style="font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #737373; margin-bottom: 12px;">Trading Solutions · Talento</div>
              <div style="border: 1px solid #e8e8e8; padding: 32px; background: white;">
                <p style="margin: 0 0 14px; font-size: 14px;">Hola ${firstName},</p>
                <p style="margin: 0 0 14px; line-height: 1.6; font-size: 14px;">${greeting}</p>
                <p style="margin: 0 0 18px; line-height: 1.6; font-size: 14px;">Toma menos de <strong>2 minutos</strong>. Tus respuestas son confidenciales y nos ayudan a hacer mejor el proceso para los que vienen.</p>
                <div style="text-align: center; margin: 24px 0;">
                  <a href="${surveyLink}" style="display: inline-block; background: #0a0a0a; color: #fff; padding: 13px 28px; text-decoration: none; font-weight: 700; font-size: 13px; letter-spacing: 0.3px;">Responder encuesta</a>
                </div>
                <p style="margin: 18px 0 0; font-size: 12px; color: #737373;">Si el botón no funciona, copia este link:<br/><span style="color: #0a0a0a; word-break: break-all;">${surveyLink}</span></p>
                <p style="margin: 24px 0 0; padding-top: 18px; border-top: 1px solid #e8e8e8; font-size: 12px; color: #737373; line-height: 1.6;">
                  Un abrazo,<br/>
                  <strong>Talent Acquisition Team</strong>
                </p>
              </div>
            </div>
          `;

          const htmlEn = `
            <div style="font-family: 'Open Sauce Sans', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0a0a0a; background: #fafafa;">
              <div style="font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #737373; margin-bottom: 12px;">Trading Solutions · Talent</div>
              <div style="border: 1px solid #e8e8e8; padding: 32px; background: white;">
                <p style="margin: 0 0 14px; font-size: 14px;">Hi ${firstName},</p>
                <p style="margin: 0 0 14px; line-height: 1.6; font-size: 14px;">${greetingEn}</p>
                <p style="margin: 0 0 18px; line-height: 1.6; font-size: 14px;">It takes less than <strong>2 minutes</strong>. Your answers are confidential and they help us make the process better for those who come next.</p>
                <div style="text-align: center; margin: 24px 0;">
                  <a href="${surveyLink}" style="display: inline-block; background: #0a0a0a; color: #fff; padding: 13px 28px; text-decoration: none; font-weight: 700; font-size: 13px; letter-spacing: 0.3px;">Answer the survey</a>
                </div>
                <p style="margin: 18px 0 0; font-size: 12px; color: #737373;">If the button does not work, copy this link:<br/><span style="color: #0a0a0a; word-break: break-all;">${surveyLink}</span></p>
                <p style="margin: 24px 0 0; padding-top: 18px; border-top: 1px solid #e8e8e8; font-size: 12px; color: #737373; line-height: 1.6;">
                  Best regards,<br/>
                  <strong style="color: #0a0a0a;">Talent Acquisition Team</strong> · Trading Solutions
                </p>
              </div>
            </div>
          `;

          const html = lang === 'en' ? htmlEn : htmlEs;

          const r = await sendViaGmail({
            to: cand.email,
            subject,
            html,
            fromName: ATS_FROM_NAME,
            replyTo: "jointheteam@tradingsolutions.com",
          });

          if (r.ok) {
            emailResult = { sent: true, id: r.gmail_id };
            await supabaseAdmin
              .from("ts_candidate_experience")
              .update({ sent_at: new Date().toISOString() })
              .eq("id", surveyId);
          } else {
            emailResult = { sent: false, error: r.error };
          }
        }
      } catch (e: any) {
        emailResult = { sent: false, error: e?.message || String(e) };
      }
    }

    return NextResponse.json({
      success: true,
      survey_id: surveyId,
      token,
      link: surveyLink,
      outcome,
      email: emailResult,
    });
  } catch (err: any) {
    console.error("send-experience-survey error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
