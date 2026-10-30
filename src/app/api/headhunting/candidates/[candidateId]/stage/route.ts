/**
 * POST /api/headhunting/candidates/[candidateId]/stage
 *
 * Mueve un candidato a una nueva etapa del funnel.
 * Body: { stage: 'aplico' | 'prefiltro_pasado' | 'rechazado' | ... , create_rejection_draft?: boolean }
 *
 * Si stage === 'rechazado' Y create_rejection_draft (default true):
 *   - Cambia status a 'rejected'
 *   - Crea draft de descarte automático en Gmail
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import { defaultOnboardingTasks } from "@/lib/onboarding-tasks";
import crypto from "crypto";

// Las etapas válidas (v4 + legacy) viven en la fuente única de verdad.
// No declarar listas de etapas acá.
import { VALID_STAGES, KELLY_GATES, normalizeStage, STAGE_RANK } from "@/lib/stage-labels";
import { resolveCandidateLang } from "@/lib/candidate-lang";
import { recordStageEvent } from "@/lib/stage-events";
import { enviarBateriaAuto } from "@/lib/bateria/invitar";
import { ATS_FROM_NAME } from "@/lib/ats-from";
import { validarRechazo, MSG_RECHAZO_SILENCIOSO } from "@/lib/rejection-rules";
import {
  buildRejectionHtml,
  rejectionEmailsEnabled,
  rejectionSubject,
  REJECTION_REPLY_TO,
} from "@/lib/rejection-email";

export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidateId } = params;
    const body = await req.json();
    const requestedStage = String(body.stage || "");
    const createRejectionDraft = body.create_rejection_draft !== false;

    if (!VALID_STAGES.includes(requestedStage)) {
      return NextResponse.json(
        { error: `Stage inválida. Válidas: ${VALID_STAGES.join(", ")}` },
        { status: 400 }
      );
    }

    // Se escribe el code v4. Los únicos históricos que se conservan son los
    // que sostienen un gate de Kelly sin code propio (Psicométricas,
    // Entrevista HM): normalizarlos los mandaría a Batería TS o Terna.
    const GATE_LEGACY = KELLY_GATES.flatMap((g) => g.legacy);
    const targetStage = GATE_LEGACY.includes(requestedStage) ? requestedStage : normalizeStage(requestedStage);

    // Cargar candidato
    const { data: candidate, error: fetchErr } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, vacancy_id, stage, status, source, preferred_language, ht_vacancies(title, form_template_key, country)")
      .eq("id", candidateId)
      .single();

    if (fetchErr || !candidate) {
      return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      stage: targetStage,
      updated_at: new Date().toISOString(),
    };

    // Si se mueve a rechazado, también actualizar status.
    // Sin categoría no se escribe: el descarte silencioso queda prohibido.
    if (targetStage === "rechazado") {
      const rechazo = validarRechazo({
        category_key: body.category_key ?? body.rejection_category,
        note: body.note ?? body.rejection_note ?? body.note_private,
      });
      if (!rechazo.ok) {
        return NextResponse.json({ error: rechazo.error || MSG_RECHAZO_SILENCIOSO }, { status: 400 });
      }
      updates.status = "rejected";
      updates.rejection_category = rechazo.category_key;
      updates.rejection_note_private = rechazo.note;
      updates.rejected_at = new Date().toISOString();
    }

    // Si se mueve a contratado, status también
    if (targetStage === "contratado") {
      updates.status = "completed";
    }

    let draftId: string | null = null;
    let elevareUrl: string | null = null;

    // Si se mueve a assessment_invitado: generar token + draft de Elevare
    if (requestedStage === "assessment_invitado") {
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 72);
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";
      elevareUrl = `${baseUrl}/assessment/ht/${token}`;

      updates.assessment_token = token;
      updates.token_expires_at = expiresAt.toISOString();
      updates.invited_at = new Date().toISOString();
      updates.status = "invited";

      try {
        const gmail = await isGmailConnected();
        if (gmail.connected) {
          // @ts-expect-error supabase relation
          const vacancyTitle = candidate.ht_vacancies?.title || "la vacante";
          const firstName = (candidate.name as string).split(" ")[0] || "candidato";
          const html = `<!DOCTYPE html>
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
    <p>Pasaste a la siguiente etapa del proceso para <strong>${vacancyTitle}</strong>. El próximo paso es un Assessment virtual que nos ayuda a conocerte mejor · cómo pensás, cómo decidís, qué te mueve.</p>
    <p>No es un examen · no hay respuestas correctas. Es solo entender tu forma de ver las cosas.</p>
    <p style="text-align:center"><a href="${elevareUrl}" class="cta">Iniciar Assessment</a></p>
    <p>Algunos detalles para que estés cómoda/o:</p>
    <ul>
      <li>Toma alrededor de 55 minutos · podés guardarlo y retomar</li>
      <li>Necesitás computador con internet estable y cámara web (la usamos solo para validar identidad)</li>
      <li>Buscá un espacio tranquilo, sin interrupciones</li>
      <li>El enlace queda activo 72 horas</li>
      <li>Tus respuestas se guardan automáticamente</li>
    </ul>
    <p>Si te queda alguna duda, contestame este correo.</p>
    <p>Un abrazo,<br><strong>Talent Acquisition Team</strong><br>Trading Solutions</p>
  </div>
</body></html>`;
          const draftRes = await createDraftViaGmail({
            to: candidate.email as string,
            subject: `Trading Solutions · Assessment virtual para ${vacancyTitle}`,
            html,
            fromName: ATS_FROM_NAME,
          });
          if (draftRes.ok) {
            draftId = draftRes.draft_id;
          }
        }
      } catch (e) {
        console.error("Failed to create Elevare draft:", e);
      }
    }

    // Crear draft de rechazo si aplica
    if (targetStage === "rechazado" && createRejectionDraft && rejectionEmailsEnabled()) {
      try {
        const gmail = await isGmailConnected();
        if (gmail.connected) {
          // @ts-expect-error supabase relation
          const rawVacancyTitle = candidate.ht_vacancies?.title as string | undefined;
          const rejLang = resolveCandidateLang({
            formTemplateKey: (candidate as any).ht_vacancies?.form_template_key,
            preferredLanguage: (candidate as any).preferred_language,
            jobTitle: rawVacancyTitle,
            country: (candidate as any).ht_vacancies?.country,
          });
          const vacancyTitle = rawVacancyTitle || (rejLang === "en" ? "the position" : "la posición");
          const firstName = ((candidate.name as string) || "").split(" ")[0] || (rejLang === "en" ? "there" : "candidato");
          const draftRes = await createDraftViaGmail({
            to: candidate.email as string,
            subject: rejectionSubject(vacancyTitle, rejLang),
            html: buildRejectionHtml(firstName, vacancyTitle, rejLang),
            fromName: ATS_FROM_NAME,
            replyTo: REJECTION_REPLY_TO,
          });
          if (draftRes.ok) {
            draftId = draftRes.draft_id;
            updates.rejection_draft_id = draftRes.draft_id;
          }
        }
      } catch (e) {
        console.error("Failed to create rejection draft:", e);
      }
    }

    const { error: updateErr } = await supabaseAdmin
      .from("ht_candidates")
      .update(updates)
      .eq("id", candidateId);

    if (updateErr) {
      return NextResponse.json({ error: "save_failed", detail: updateErr.message }, { status: 500 });
    }

    // ─── Historial de etapa ────────────────────────────────────────
    // Sin esto los "días en etapa" del dashboard vuelven a depender de
    // updated_at, que se pisa con cualquier edición del candidato.
    // Es best-effort: si falla, el movimiento igual quedó guardado.
    // recordStageEvent también emite candidate.stage_changed para los agentes.
    await recordStageEvent({
      candidateId,
      fromStage: candidate.stage ?? null,
      toStage: targetStage,
      vacancyId: candidate.vacancy_id ?? null,
      source: "ui",
    });

    // ─── Listo para batería → Batería TS automática ───────────────
    // El reclutador aprueba a alguien que estaba en revisión: es el mismo
    // "prefiltro pasado" que el automático, así que recibe la batería igual.
    // `auto_bateria: false` lo apaga para quien solo quiera reclasificar.
    let bateriaAuto: Awaited<ReturnType<typeof enviarBateriaAuto>> | null = null;
    let finalStage = targetStage;
    // Solo desde antes de la batería: a quien se devuelve a Prefiltro desde
    // más adelante no se le reenvía nada ni se le vuelve a mover.
    const veniaDeAntes = (STAGE_RANK[normalizeStage(candidate.stage)] ?? 0) < (STAGE_RANK["pruebas"] ?? 0);
    if (targetStage === "prefiltro_pasado" && veniaDeAntes && body.auto_bateria !== false) {
      const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      bateriaAuto = await enviarBateriaAuto(candidateId, origin);
      if (bateriaAuto.enviado) finalStage = "pruebas";
    }

    // ─── Auto-create People + Onboarding when hired ───
    let onboardingId: string | null = null;
    let personId: string | null = null;
    let welcomeDraftId: string | null = null;
    if (targetStage === "contratado") {
      // Welcome email · primer contacto post-oferta firmada
      try {
        const gmail = await isGmailConnected();
        if (gmail.connected && candidate.email) {
          const firstName = (candidate.name as string).split(" ")[0] || "";
          // @ts-expect-error supabase relation
          const vacancyTitle = candidate.ht_vacancies?.title || "tu nuevo rol";
          const welcomeHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #1a7d3e; margin-bottom: 12px; }
  h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 16px; }
  p { font-size: 14px; margin: 0 0 14px; }
  ul { margin: 8px 0 16px; padding-left: 20px; }
  li { margin-bottom: 5px; font-size: 14px; }
</style></head><body>
  <div class="container">
    <div class="eyebrow">Bienvenida/o a Trading Solutions</div>
    <h1>${firstName}, qué bueno tenerte con nosotros.</h1>
    <p>Cerramos el proceso para <strong>${vacancyTitle}</strong> y ya estás dentro. Antes de tu primer día queremos hacerte el camino corto · te paso lo que viene.</p>
    <p><strong>En los próximos días te vamos a enviar:</strong></p>
    <ul>
      <li>Tu carta oferta firmada y los documentos para HR</li>
      <li>Acceso a tu correo @tradingsolutions.com y a las herramientas que vas a usar</li>
      <li>Tu plan de los primeros 30/60/90 días con el equipo</li>
      <li>Quién será tu buddy para tus primeras semanas</li>
    </ul>
    <p>Si tenés alguna duda mientras tanto · sobre tu fecha de inicio, lo logístico, lo que sea · contestame este correo y resolvemos.</p>
    <p>Nos vemos muy pronto.</p>
    <p>Un abrazo,<br><strong>Talent Acquisition Team</strong><br>Trading Solutions</p>
  </div>
</body></html>`;
          const welcomeRes = await createDraftViaGmail({
            to: candidate.email as string,
            subject: `Bienvenida/o a Trading Solutions, ${firstName}`,
            html: welcomeHtml,
            fromName: ATS_FROM_NAME,
            replyTo: "jointheteam@tradingsolutions.com",
          });
          if (welcomeRes.ok) {
            welcomeDraftId = welcomeRes.draft_id;
          }
        }
      } catch (e) {
        console.error("Welcome draft creation failed:", e);
      }

      try {
        // Get vacancy info
        const { data: vac } = await supabaseAdmin
          .from("ht_vacancies")
          .select("id, title, area, role_level")
          .eq("id", candidate.vacancy_id)
          .maybeSingle();

        // Find or create person
        const { data: existingPerson } = await supabaseAdmin
          .from("ts_people")
          .select("id")
          .eq("linked_candidate_id", candidateId)
          .maybeSingle();

        if (existingPerson) {
          personId = existingPerson.id;
        } else {
          const { data: newPerson } = await supabaseAdmin
            .from("ts_people")
            .insert({
              name: candidate.name,
              email: candidate.email,
              role: vac?.title || 'Pendiente',
              area: vac?.area || null,
              role_level: vac?.role_level || 'entry',
              start_date: new Date().toISOString().slice(0, 10),
              status: 'onboarding',
              linked_candidate_id: candidateId,
              linked_vacancy_id: vac?.id || null,
              location: 'Barranquilla',
              is_top_performer: false,
            })
            .select("id")
            .single();
          if (newPerson) personId = newPerson.id;
        }

        // Find or create onboarding
        if (personId) {
          const { data: existingOnb } = await supabaseAdmin
            .from("ts_onboarding")
            .select("id")
            .eq("person_id", personId)
            .maybeSingle();
          if (existingOnb) {
            onboardingId = existingOnb.id;
          } else {
            const tasks = defaultOnboardingTasks(vac?.role_level || 'entry');
            const { data: newOnb } = await supabaseAdmin
              .from("ts_onboarding")
              .insert({
                person_id: personId,
                start_date: new Date().toISOString().slice(0, 10),
                status: 'in_progress',
                tasks,
              })
              .select("id")
              .single();
            if (newOnb) onboardingId = newOnb.id;
          }
        }
      } catch (e) {
        console.error("Auto-onboarding creation failed:", e);
      }
    }

    return NextResponse.json({
      success: true,
      candidate_id: candidateId,
      from_stage: candidate.stage,
      to_stage: finalStage,
      bateria_auto: bateriaAuto,
      draft_id: draftId,
      welcome_draft_id: welcomeDraftId,
      elevare_url: elevareUrl,
      person_id: personId,
      onboarding_id: onboardingId,
    });
  } catch (err) {
    console.error("stage update error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
