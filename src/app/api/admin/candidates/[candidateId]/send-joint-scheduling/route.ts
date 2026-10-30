/**
 * POST /api/admin/candidates/[candidateId]/send-joint-scheduling
 *
 * Crea draft de Gmail con el link de agendamiento conjunto.
 *
 * Body: { joint_link: string, interviewer_names: string[], duration_minutes: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import { resolveCandidateLang } from "@/lib/candidate-lang";
import { ATS_FROM_NAME } from "@/lib/ats-from";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { candidateId: string } }) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidateId } = params;
    const body = await req.json();
    const jointLink = body.joint_link;
    const interviewerNames: string[] = body.interviewer_names || [];
    const durationMinutes = body.duration_minutes || 45;

    if (!jointLink) return NextResponse.json({ error: "Falta joint_link" }, { status: 400 });

    const { data: cand } = await supabaseAdmin
      .from("ht_candidates")
      .select("name, email, preferred_language, ht_vacancies(title, form_template_key, country)")
      .eq("id", candidateId)
      .single();

    if (!cand || !cand.email) return NextResponse.json({ error: "Candidato sin email" }, { status: 404 });

    // Idioma del proceso · China va en ingles.
    const lang = resolveCandidateLang({
      formTemplateKey: (cand as any).ht_vacancies?.form_template_key,
      preferredLanguage: (cand as any).preferred_language,
      jobTitle: (cand as any).ht_vacancies?.title,
      country: (cand as any).ht_vacancies?.country,
    });
    const firstName = (cand.name || "").split(" ")[0] || (lang === "en" ? "there" : "candidato");
    const vacancyTitle: string = (cand as any).ht_vacancies?.title || (lang === "en" ? "the position" : "la posición");
    const interviewerLabel = interviewerNames.length > 0 ? interviewerNames.join(" y ") : "nuestro equipo";
    const interviewerLabelEn = interviewerNames.length > 0 ? interviewerNames.join(" and ") : "our team";

    const gmail = await isGmailConnected();
    if (!gmail.connected) return NextResponse.json({ error: "Gmail no conectado" }, { status: 503 });

    const htmlEs = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  .cta { display: inline-block; background: #0a0a0a; color: white !important; text-decoration: none; padding: 13px 28px; font-weight: 700; margin: 16px 0; letter-spacing: 0.3px; }
  p { font-size: 14px; margin: 0 0 14px; }
  .footer { color: #737373; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e8e8e8; }
</style></head><body>
  <div class="container">
    <p>Hola <strong>${firstName}</strong>,</p>
    <p>Avanzamos a la siguiente etapa del proceso para <strong>${vacancyTitle}</strong>. La próxima conversación es con <strong>${interviewerLabel}</strong> · va a durar alrededor de ${durationMinutes} minutos por video.</p>
    <p>Elige el horario que mejor te funcione · solo vas a ver opciones donde todos estén disponibles al mismo tiempo. Una vez confirmes, se genera la videollamada de Google Meet automáticamente.</p>
    <p style="text-align:center"><a href="${jointLink}" class="cta">Elegir horario</a></p>
    <p>Si ninguno de los horarios disponibles te funciona, regálame una respuesta a este correo y buscamos juntos.</p>
    <p>Un abrazo,<br><strong>Talent Acquisition Team</strong><br>Trading Solutions</p>
    <div class="footer">El enlace queda activo 7 días. La videollamada de Google Meet se genera automáticamente al confirmar el horario.</div>
  </div>
</body></html>`;

    const htmlEn = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  .cta { display: inline-block; background: #0a0a0a; color: white !important; text-decoration: none; padding: 13px 28px; font-weight: 700; margin: 16px 0; letter-spacing: 0.3px; }
  p { font-size: 14px; margin: 0 0 14px; }
  .footer { color: #737373; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e8e8e8; }
</style></head><body>
  <div class="container">
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>We are moving on to the next stage of the process for <strong>${vacancyTitle}</strong>. The next conversation is with <strong>${interviewerLabelEn}</strong> · it will last around ${durationMinutes} minutes over video.</p>
    <p>Choose the time that works best for you · you will only see options where everyone is available at the same time. Once you confirm, the Google Meet video call is created automatically.</p>
    <p style="text-align:center"><a href="${jointLink}" class="cta">Choose a time</a></p>
    <p>If none of the available times work for you, just reply to this email and we will find one together.</p>
    <p>Best regards,<br><strong>Talent Acquisition Team</strong> · Trading Solutions</p>
    <div class="footer">The link stays active for 7 days. The Google Meet video call is created automatically when you confirm your time.</div>
  </div>
</body></html>`;

    const html = lang === "en" ? htmlEn : htmlEs;

    const draftRes = await createDraftViaGmail({
      to: cand.email as string,
      subject: lang === "en"
        ? `Trading Solutions · Choose your interview time for ${vacancyTitle}`
        : `Trading Solutions · Elige tu horario para la entrevista de ${vacancyTitle}`,
      html,
      fromName: ATS_FROM_NAME,
      replyTo: "jointheteam@tradingsolutions.com",
    });

    if (!draftRes.ok) return NextResponse.json({ error: draftRes.error }, { status: 500 });

    return NextResponse.json({ success: true, draft_id: draftRes.draft_id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
