/**
 * POST /api/headhunting/candidates/[candidateId]/send-ai-interview
 *
 * Genera un token único de entrevista IA, lo guarda en ht_ai_interviews,
 * y crea un draft en Gmail con el link a la página de entrevista.
 *
 * El candidato accede a /entrevista-ia/[token] que embebe el widget de
 * ElevenLabs Conversational AI configurado para hacer la entrevista por voz.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import { recordStageEvent } from "@/lib/stage-events";
import { normalizeStage, STAGE_RANK } from "@/lib/stage-labels";
import { resolveCandidateLang } from "@/lib/candidate-lang";
import crypto from "crypto";
import { ATS_FROM_NAME, candidateSignatureHtml } from "@/lib/ats-from";

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

    // Generate token (72h expiry)
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    // Insert AI interview record
    const { data: interview, error: insertErr } = await supabaseAdmin
      .from("ht_ai_interviews")
      .insert({
        candidate_id: candidateId,
        token,
        token_expires_at: expiresAt.toISOString(),
        agent_id: process.env.ELEVENLABS_AGENT_ID || null,
        status: "invited",
      })
      .select()
      .single();

    if (insertErr) {
      console.error("ai-interview insert error:", insertErr);
      return NextResponse.json({ error: "save_failed", detail: insertErr.message }, { status: 500 });
    }

    // La entrevista IA hace el trabajo del screening del reclutador: se
    // escribe el code v4 (`entrevista_ia` ya no existe) y con evento, para que
    // el tablero y los agentes se enteren. Solo hacia adelante: reenviar el
    // enlace a quien va más avanzado no lo devuelve.
    const ETAPA_IA = "recruiter_interview";
    if ((STAGE_RANK[normalizeStage(candidate.stage)] ?? 0) < (STAGE_RANK[ETAPA_IA] ?? 0)) {
      const { error: stageErr } = await supabaseAdmin
        .from("ht_candidates")
        .update({ stage: ETAPA_IA, updated_at: new Date().toISOString() })
        .eq("id", candidateId);
      if (!stageErr) {
        await recordStageEvent({
          candidateId,
          fromStage: candidate.stage ?? null,
          toStage: ETAPA_IA,
          vacancyId: candidate.vacancy_id ?? null,
          source: "system",
          note: "Entrevista IA enviada",
        });
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";
    const interviewUrl = `${baseUrl}/entrevista-ia/${token}`;
    // Idioma del proceso · China va en ingles.
    const lang = resolveCandidateLang({
      formTemplateKey: (candidate as any).ht_vacancies?.form_template_key,
      preferredLanguage: (candidate as any).preferred_language,
      jobTitle: (candidate as any).ht_vacancies?.title,
      country: (candidate as any).ht_vacancies?.country,
    });
    const firstName = (candidate.name as string).split(" ")[0] || (lang === "en" ? "there" : "candidato");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vacancyTitle = (candidate as any).ht_vacancies?.title || (lang === "en" ? "the position" : "la vacante");

    // Try to create Gmail draft
    let draftId: string | null = null;
    try {
      const gmail = await isGmailConnected();
      if (gmail.connected) {
        const htmlEs = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  .cta { display: inline-block; background: #0a0a0a; color: white !important; text-decoration: none; padding: 13px 28px; font-weight: 700; margin: 16px 0; letter-spacing: 0.3px; }
  ul { margin: 8px 0 16px; padding-left: 20px; }
  li { margin-bottom: 5px; font-size: 14px; }
  p { font-size: 14px; margin: 0 0 14px; }
</style></head><body>
  <div class="container">
    <p>Hola <strong>${firstName}</strong>,</p>
    <p>Llegaste a la siguiente etapa del proceso para <strong>${vacancyTitle}</strong>. El próximo paso es una conversación con nuestra recruiter virtual · es por voz, en tiempo real, y termina con una sección corta en inglés.</p>
    <p>No es un examen · te va a preguntar sobre tu experiencia y quieres contarle naturalmente, como una llamada cualquiera.</p>
    <p style="text-align:center"><a href="${interviewUrl}" class="cta">Iniciar entrevista</a></p>
    <p>Algunos detalles para que estés cómoda/o:</p>
    <ul>
      <li>Dura entre 15 y 20 minutos</li>
      <li>Necesitas computador con micrófono, internet estable y un espacio tranquilo</li>
      <li>Habla con naturalidad · ella te escucha y responde</li>
      <li>El enlace queda activo 72 horas</li>
      <li>Mejor hazla de corrido, sin pausas largas</li>
    </ul>
    <p>Después de la entrevista nos contactamos contigo para los siguientes pasos. Si te queda alguna duda, contéstanos este correo.</p>
    ${candidateSignatureHtml("es")}
  </div>
</body></html>`;

        const htmlEn = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  .cta { display: inline-block; background: #0a0a0a; color: white !important; text-decoration: none; padding: 13px 28px; font-weight: 700; margin: 16px 0; letter-spacing: 0.3px; }
  ul { margin: 8px 0 16px; padding-left: 20px; }
  li { margin-bottom: 5px; font-size: 14px; }
  p { font-size: 14px; margin: 0 0 14px; }
</style></head><body>
  <div class="container">
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>You have reached the next stage of the process for <strong>${vacancyTitle}</strong>. The next step is a conversation with our virtual recruiter · it is by voice, in real time, and it ends with a short section in English.</p>
    <p>It is not an exam · she will ask you about your experience and you can tell her about it naturally, like any other call.</p>
    <p style="text-align:center"><a href="${interviewUrl}" class="cta">Start the interview</a></p>
    <p>A few details so you are comfortable:</p>
    <ul>
      <li>It takes between 15 and 20 minutes</li>
      <li>You need a computer with a microphone, a stable internet connection and a quiet space</li>
      <li>Speak naturally · she listens and answers you</li>
      <li>The link stays active for 72 hours</li>
      <li>Better to do it in one go, without long pauses</li>
    </ul>
    <p>After the interview we will get in touch with you about the next steps. If you have any questions, just reply to this email.</p>
    ${candidateSignatureHtml("en")}
  </div>
</body></html>`;

        const html = lang === "en" ? htmlEn : htmlEs;

        const draftRes = await createDraftViaGmail({
          to: candidate.email as string,
          subject: lang === "en"
            ? `Trading Solutions · Interview for ${vacancyTitle}`
            : `Trading Solutions · Entrevista para ${vacancyTitle}`,
          html,
          fromName: ATS_FROM_NAME,
        });
        if (draftRes.ok) {
          draftId = draftRes.draft_id;
          await supabaseAdmin
            .from("ht_ai_interviews")
            .update({ recruiter_draft_id: draftRes.draft_id })
            .eq("id", interview.id);
        }
      }
    } catch (e) {
      console.error("AI interview draft creation failed:", e);
    }

    return NextResponse.json({
      success: true,
      candidate_id: candidateId,
      interview_id: interview.id,
      interview_url: interviewUrl,
      expires_at: expiresAt.toISOString(),
      draft_id: draftId,
      channel: draftId ? "gmail-draft" : "token-only",
    });
  } catch (err) {
    console.error("send-ai-interview error:", err);
    return NextResponse.json(
      { error: "Error interno", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
