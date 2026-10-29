/**
 * POST /api/admin/candidates/[candidateId]/send-calendly
 *
 * Genera la URL Calendly pre-llenada con datos del candidato y crea un draft
 * de Gmail con el mensaje de invitación · el candidato elige slot self-serve.
 *
 * URL prefill format:
 *   https://calendly.com/{user}/{event}?name=John&email=x@y.com&a1=Vacancy
 *
 * Body opcional: { custom_message?: string }
 *
 * Side effect:
 *   - Marca calendly_invitation_sent_at en ht_candidates (si la columna existe)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import { resolveCandidateLang } from "@/lib/candidate-lang";
import { agendaDeVacante } from "@/lib/reclutadores";
import { ATS_FROM_NAME } from "@/lib/ats-from";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

// URL por defecto · Calendly individual de Kelly (Entrevista Recruiter solo).
const CALENDLY_URL_DEFAULT = "https://calendly.com/k-castaneda-tradingsolutions/30min";

// Yohanna Franco · Chief Wellness Officer
const YOHANNA_CALENDLY = "https://calendly.com/cwo-tradingsolutions/new-meeting";
const YOHANNA_HOST = {
  firstName: "Yohanna",
  fullName: "Yohanna Franco",
  role: "Chief Wellness Officer · Trading Solutions",
};

// URLs especiales por vacancy_id · personalizadas según quién hace la entrevista recruiter
const CALENDLY_URL_BY_VACANCY: Record<string, string> = {
  // Talent Acquisition and Development Lead · Yohanna Franco (CWO) es la recruiter
  "70c39cab-adaf-49a0-b137-29d0ff9b56b0": YOHANNA_CALENDLY,
};

// Hosts/firmas por vacancy_id · para personalizar el copy y firma del email
const CALENDLY_HOST_BY_VACANCY: Record<string, { firstName: string; fullName: string; role: string }> = {
  "70c39cab-adaf-49a0-b137-29d0ff9b56b0": YOHANNA_HOST,
};

// Stages en los que Yohanna es siempre la host (independiente de la vacante)
const YOHANNA_STAGES = new Set(["cwo_interview"]);

function getCalendlyUrl(vacancyId: string | null | undefined, stage: string | null | undefined): string {
  // 1. Si el stage es de Yohanna (ej. cwo_interview) · siempre Yohanna
  if (stage && YOHANNA_STAGES.has(stage)) {
    return YOHANNA_CALENDLY;
  }
  // 2. Si la vacante tiene un host personalizado (ej. Talent → Yohanna)
  if (vacancyId && CALENDLY_URL_BY_VACANCY[vacancyId]) {
    return CALENDLY_URL_BY_VACANCY[vacancyId];
  }
  // 3. Default · Kelly
  return CALENDLY_URL_DEFAULT;
}

function getHost(vacancyId: string | null | undefined, stage: string | null | undefined): { firstName: string; fullName: string; role: string } {
  if (stage && YOHANNA_STAGES.has(stage)) {
    return YOHANNA_HOST;
  }
  if (vacancyId && CALENDLY_HOST_BY_VACANCY[vacancyId]) {
    return CALENDLY_HOST_BY_VACANCY[vacancyId];
  }
  return { firstName: "Kelly", fullName: "Kelly Castañeda", role: "Talent Acquisition and Development Lead · Trading Solutions" };
}

function buildPrefillUrl(baseUrl: string, name: string, email: string, vacancyTitle: string): string {
  const params = new URLSearchParams();
  if (name) params.set("name", name);
  if (email) params.set("email", email);
  if (vacancyTitle) params.set("a1", vacancyTitle);
  return `${baseUrl}?${params.toString()}`;
}

function buildEmailHtml(firstName: string, vacancyTitle: string, calendlyUrl: string, host: { firstName: string; fullName: string; role: string }, customMessage?: string): string {
  const messageBody = customMessage ||
    `Pasaste a la siguiente etapa del proceso para <strong>${vacancyTitle}</strong>. La próxima conversación es una <strong>entrevista presencial</strong> con <strong>${host.fullName}</strong> en nuestras oficinas de Barranquilla.<br><br><strong>📍 Dirección:</strong> Cra. 57 #99A-65, Torre Sur, Oficina 1501.<br><strong>🪪 Importante:</strong> lleva tu <strong>cédula en original</strong> (indispensable para el ingreso).`;
  const slotText = `Elige el mejor horario de acuerdo a tu disponibilidad · vas a ver el calendario de ${host.firstName} y puedes reservar el espacio que prefieras:`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  .cta { display: inline-block; background: #0a0a0a; color: white !important; text-decoration: none; padding: 13px 28px; font-weight: 700; margin: 16px 0; letter-spacing: 0.3px; }
  p { font-size: 14px; margin: 0 0 14px; }
  .footer { color: #737373; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e8e8e8; }
</style></head><body>
  <div class="container">
    <p>Hola <strong>${firstName}</strong>,</p>
    <p>${messageBody}</p>
    <p>${slotText}</p>
    <p style="text-align:center"><a href="${calendlyUrl}" class="cta">Elegir horario</a></p>
    <p style="font-size:13px;color:#737373"><em>Nota: los festivos colombianos no son hábiles · si ves alguno disponible (ej. lunes 18 de mayo · Día de la Ascensión), por favor escoge otro día.</em></p>
    <p>Si ninguno de los horarios disponibles te funciona, regálame una respuesta a este correo y buscamos juntos.</p>
    <p>Un abrazo,<br><strong>${host.fullName}</strong><br>${host.role}</p>
    <div class="footer">La dirección y los detalles quedan también en la invitación de Calendly al confirmar tu horario.</div>
  </div>
</body></html>`;
}

// Misma plantilla, en ingles · los procesos de China se comunican en ingles.
function buildEmailHtmlEn(firstName: string, vacancyTitle: string, calendlyUrl: string, host: { firstName: string; fullName: string; role: string }, customMessage?: string): string {
  const messageBody = customMessage ||
    `You have moved on to the next stage of the process for <strong>${vacancyTitle}</strong>. The next conversation is an <strong>in-person interview</strong> with <strong>${host.fullName}</strong> at our Barranquilla offices.<br><br><strong>📍 Address:</strong> Cra. 57 #99A-65, Torre Sur, Office 1501.<br><strong>🪪 Important:</strong> bring your <strong>original ID document</strong> (you cannot enter the building without it).`;
  const slotText = `Choose the time that best fits your availability · you will see ${host.firstName}'s calendar and can book whichever slot you prefer:`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  .cta { display: inline-block; background: #0a0a0a; color: white !important; text-decoration: none; padding: 13px 28px; font-weight: 700; margin: 16px 0; letter-spacing: 0.3px; }
  p { font-size: 14px; margin: 0 0 14px; }
  .footer { color: #737373; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e8e8e8; }
</style></head><body>
  <div class="container">
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>${messageBody}</p>
    <p>${slotText}</p>
    <p style="text-align:center"><a href="${calendlyUrl}" class="cta">Choose a time</a></p>
    <p style="font-size:13px;color:#737373"><em>Note: Colombian public holidays are not working days · if you see one available (e.g. Monday, May 18 · Ascension Day), please pick another day.</em></p>
    <p>If none of the available times work for you, just reply to this email and we will find one together.</p>
    <p>Best regards,<br><strong>Talent Team</strong> · Trading Solutions</p>
    <div class="footer">The address and the details are also included in the Calendly invitation once you confirm your time.</div>
  </div>
</body></html>`;
}

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
    const body = await req.json().catch(() => ({}));
    const customMessage: string | undefined = body.custom_message;

    const { data: candidate, error } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, phone, vacancy_id, stage, preferred_language, ht_vacancies(title, form_template_key, country)")
      .eq("id", candidateId)
      .single();

    if (error || !candidate) {
      return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
    }

    // Idioma del proceso · China va en ingles.
    const lang = resolveCandidateLang({
      formTemplateKey: (candidate as any).ht_vacancies?.form_template_key,
      preferredLanguage: (candidate as any).preferred_language,
      jobTitle: (candidate as any).ht_vacancies?.title,
      country: (candidate as any).ht_vacancies?.country,
    });
    const firstName = (candidate.name || "").split(" ")[0] || (lang === "en" ? "there" : "candidato");
    const vacancyTitle: string = (candidate as any).ht_vacancies?.title || (lang === "en" ? "the position" : "la posición");

    // Selección de host según stage y vacante:
    //   0. Dueño de la vacante con agenda propia → su calendario y su firma
    //   1. Stage cwo_interview → siempre Yohanna (en cualquier vacante)
    //   2. Vacante Talent Acquisition → Yohanna como recruiter
    //   3. Default → Kelly
    //
    // El dueño va primero porque es quien va a estar en la entrevista, pero
    // los stages con host fijo mandan sobre él: ahí el host no depende de
    // quién lleve el proceso. Si el dueño todavía no cargó su agenda, todo
    // sigue saliendo como antes en vez de quedarse sin enviar.
    const candidateStage = candidate.stage as string | null;
    const stageConHostFijo = Boolean(candidateStage && YOHANNA_STAGES.has(candidateStage));
    const agenda = stageConHostFijo
      ? { calendlyUrl: null, firma: null }
      : await agendaDeVacante(candidate.vacancy_id as string | null);

    const baseCalendlyUrl =
      agenda.calendlyUrl || getCalendlyUrl(candidate.vacancy_id as string | null, candidateStage);
    const calendlyUrl = buildPrefillUrl(
      baseCalendlyUrl,
      candidate.name as string,
      candidate.email as string,
      vacancyTitle
    );

    const host = agenda.firma || getHost(candidate.vacancy_id as string | null, candidateStage);
    const isCustomHost = baseCalendlyUrl !== CALENDLY_URL_DEFAULT;
    let draftId: string | null = null;
    if (candidate.email) {
      try {
        const gmail = await isGmailConnected();
        if (gmail.connected) {
          const html = lang === "en"
            ? buildEmailHtmlEn(firstName, vacancyTitle, calendlyUrl, host, customMessage)
            : buildEmailHtml(firstName, vacancyTitle, calendlyUrl, host, customMessage);
          const draftRes = await createDraftViaGmail({
            to: candidate.email as string,
            subject: lang === "en"
              ? `Trading Solutions · Choose your interview time for ${vacancyTitle}`
              : `Trading Solutions · Elige tu horario para la entrevista de ${vacancyTitle}`,
            html,
            fromName: ATS_FROM_NAME,
            replyTo: "jointheteam@tradingsolutions.com",
          });
          if (draftRes.ok) draftId = draftRes.draft_id;
        }
      } catch (e) {
        console.error("Calendly draft creation failed:", e);
      }
    }

    // Tracking · si la columna existe, registra el envío. Si no, silenciar.
    try {
      await supabaseAdmin
        .from("ht_candidates")
        .update({
          calendly_invitation_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidateId);
    } catch {
      // columna probablemente no existe — no bloquear flujo
    }

    // WhatsApp link · pre-llenado para click-to-send (firmado por el host correspondiente)
    const waMessageEs = `Hola ${firstName}, te escribo desde Trading Solutions.\n\nPasaste a la siguiente etapa para ${vacancyTitle}. La próxima conversación es una entrevista PRESENCIAL con ${host.fullName}.\n📍 Dirección: Cra. 57 #99A-65, Torre Sur, Oficina 1501 — Barranquilla.\n🪪 Importante: lleva tu cédula en original.\n\nElige el horario que mejor te funcione desde acá: ${calendlyUrl}\n\nSi ninguno te funciona, regálame una respuesta y buscamos juntos.\n\nUn abrazo,\n${host.firstName}`;
    const waMessageEn = `Hi ${firstName}, this is Trading Solutions.\n\nYou have moved on to the next stage for ${vacancyTitle}. The next conversation is an IN-PERSON interview with ${host.fullName}.\n📍 Address: Cra. 57 #99A-65, Torre Sur, Office 1501 — Barranquilla.\n🪪 Important: bring your original ID document.\n\nChoose the time that works best for you here: ${calendlyUrl}\n\nIf none of them work, just reply and we will find one together.\n\nBest regards,\nTalent Team · Trading Solutions`;
    const waMessage = lang === "en" ? waMessageEn : waMessageEs;
    const cleanPhone = (candidate.phone || "").replace(/[^0-9]/g, "");
    const finalPhone = cleanPhone.length === 10 ? `57${cleanPhone}` : cleanPhone;
    const waLink = finalPhone
      ? `https://wa.me/${finalPhone}?text=${encodeURIComponent(waMessage)}`
      : null;

    return NextResponse.json({
      success: true,
      candidate_id: candidateId,
      candidate_name: candidate.name,
      calendly_url: calendlyUrl,
      draft_id: draftId,
      wa_link: waLink,
    });
  } catch (err: any) {
    console.error("send-calendly error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
