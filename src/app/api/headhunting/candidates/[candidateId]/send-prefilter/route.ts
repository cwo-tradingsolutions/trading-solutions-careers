/**
 * POST /api/headhunting/candidates/[candidateId]/send-prefilter
 *
 * Genera un prefilter_token único, lo guarda en ht_candidates, y crea un
 * draft en Gmail con el link al formulario.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import { recordStageEvent } from "@/lib/stage-events";
import crypto from "crypto";
import { resolveCandidateLang } from "@/lib/candidate-lang";
import { ATS_FROM_NAME } from "@/lib/ats-from";

export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidateId } = params;

    const { data: candidate, error } = await supabaseAdmin
      .from("ht_candidates")
      .select("*, ht_vacancies(title, form_template_key, country), ht_clients(name)")
      .eq("id", candidateId)
      .single();

    if (error || !candidate) {
      return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: updateErr } = await supabaseAdmin
      .from("ht_candidates")
      .update({
        prefilter_token: token,
        prefilter_token_expires_at: expiresAt.toISOString(),
        prefilter_invited_at: new Date().toISOString(),
        stage: "prefiltro_enviado",
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);

    // El envío del prefiltro mueve la etapa; sin el evento el dashboard cree
    // que el candidato sigue en la etapa anterior y cuenta mal los días.
    if (!updateErr) {
      await recordStageEvent({
        candidateId,
        fromStage: candidate.stage ?? null,
        toStage: "prefiltro_enviado",
        vacancyId: candidate.vacancy_id ?? null,
        source: "system",
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";
    const formUrl = `${baseUrl}/prefiltro/${token}`;
    const rawVacancyTitle = (candidate as any).ht_vacancies?.title as string | undefined;
    // El proceso de China corre en inglés · el candidato no habla español.
    const lang = resolveCandidateLang({
      formTemplateKey: (candidate as any).ht_vacancies?.form_template_key,
      preferredLanguage: (candidate as any).preferred_language,
      jobTitle: rawVacancyTitle,
      country: (candidate as any).ht_vacancies?.country,
    });
    const vacancyTitle = rawVacancyTitle || (lang === "en" ? "the position" : "la vacante");
    const firstName = (candidate.name || "").split(" ")[0] || (lang === "en" ? "there" : "candidato");

    const gmailStatus = await isGmailConnected();
    if (!gmailStatus.connected) {
      return NextResponse.json({
        success: true,
        candidate_id: candidateId,
        prefilter_url: formUrl,
        expires_at: expiresAt.toISOString(),
        channel: "token-only",
        note: "Gmail no conectado — copia el link manualmente.",
      });
    }

    const htmlEn = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Inter, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 24px; background: #f9f9f9; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border-radius: 12px; }
  .cta { display: inline-block; background: #2C64ED; color: white !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 16px 0; }
  .footer { margin-top: 24px; color: #999; font-size: 12px; }
</style></head><body>
  <div class="container">
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>Thank you for your interest in joining Trading Solutions and in the <strong>${vacancyTitle}</strong> position.</p>
    <p>As a first step in our process, we ask you to complete a short questionnaire that helps us get to know you better. It takes <strong>7-10 minutes</strong>.</p>
    <p style="text-align:center"><a href="${formUrl}" class="cta">Complete the questionnaire</a></p>
    <p>Details:</p>
    <ul>
      <li>Estimated time: 7-10 minutes</li>
      <li>The link is valid for 7 days</li>
      <li>Your answers are saved automatically</li>
    </ul>
    <p>If you have any questions, just reply to this email.</p>
    <p>Best regards,<br><strong>Talent Acquisition Team</strong><br>Trading Solutions</p>
    <div class="footer">This link is personal and non-transferable.</div>
  </div>
</body></html>`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Inter, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 24px; background: #f9f9f9; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border-radius: 12px; }
  .cta { display: inline-block; background: #2C64ED; color: white !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 16px 0; }
  .footer { margin-top: 24px; color: #999; font-size: 12px; }
</style></head><body>
  <div class="container">
    <p>Hola <strong>${firstName}</strong>,</p>
    <p>Gracias por tu interés en formar parte de Trading Solutions y la posición de <strong>${vacancyTitle}</strong>.</p>
    <p>Como primer paso de nuestro proceso, te pedimos completar un cuestionario corto que nos ayuda a conocerte mejor. Nos toma <strong>7-10 minutos</strong> en total.</p>
    <p style="text-align:center"><a href="${formUrl}" class="cta">Completar cuestionario</a></p>
    <p>Detalles:</p>
    <ul>
      <li>Tiempo estimado: 7-10 minutos</li>
      <li>Enlace válido por 7 días</li>
      <li>Tus respuestas se guardan automáticamente</li>
    </ul>
    <p>Si tienes alguna pregunta, simplemente responde a este correo.</p>
    <p>Un abrazo,<br><strong>Talent Acquisition Team</strong><br>Trading Solutions</p>
    <div class="footer">Este enlace es personal e intransferible.</div>
  </div>
</body></html>`;

    const draftRes = await createDraftViaGmail({
      to: candidate.email,
      subject: lang === "en"
        ? `Trading Solutions · Pre-screening questionnaire for ${vacancyTitle}`
        : `Trading Solutions · Cuestionario inicial para ${candidate.name}`,
      html: lang === "en" ? htmlEn : html,
      fromName: ATS_FROM_NAME,
    });

    if (!draftRes.ok) {
      return NextResponse.json(
        { success: true, prefilter_url: formUrl, channel: "draft-failed", error: draftRes.error },
        { status: 207 }
      );
    }

    return NextResponse.json({
      success: true,
      candidate_id: candidateId,
      prefilter_url: formUrl,
      expires_at: expiresAt.toISOString(),
      channel: "gmail-draft",
      draft_id: draftRes.draft_id,
      gmail_email: draftRes.gmail_email,
    });
  } catch (err) {
    console.error("send-prefilter error:", err);
    return NextResponse.json(
      { error: "Error interno", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
