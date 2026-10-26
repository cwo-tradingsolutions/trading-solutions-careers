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
import { VALID_STAGES } from "@/lib/stage-labels";
import { compEventNote } from "@/lib/hr-pipeline-look";
import { resolveCandidateLang } from "@/lib/candidate-lang";
import {
  buildCompJobOfferPreview,
  deliverCompJobOfferPreview,
  loadOfertaCompSource,
  logCompPreviewSkip,
  manualCompPreviewRequested,
  resolveCompHookPlan,
  type CompJobOfferPreviewPayload,
  type CompPreviewResult,
} from "@/lib/comp-job-offer-preview";

const TS_LINKEDIN_URL = "https://www.linkedin.com/company/trading-sol/";

function buildRejectionHtmlEn(name: string, vacancyTitle: string): string {
  const firstName = (name || "").split(" ")[0] || "candidate";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Inter, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; padding: 24px; background: #f9f9f9; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border-radius: 12px; }
  a { color: #2C64ED; }
</style></head><body>
  <div class="container">
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>Thank you for taking the time to apply for the <strong>${vacancyTitle}</strong> position at Trading Solutions. After reviewing your application, we have decided to move forward with other candidates whose profile is a closer match for the position at this time. Trading Solutions keeps growing, and we would love to stay in touch.</p>
    <p>Your information stays in our database for future opportunities. We also invite you to follow us on LinkedIn to hear about new openings: <a href="${TS_LINKEDIN_URL}">${TS_LINKEDIN_URL}</a></p>
    <p>We appreciate your interest in Trading Solutions and wish you all the best in your next steps.</p>
    <p>Best regards,<br><strong>Talent Team</strong><br>Trading Solutions</p>
  </div>
</body></html>`;
}

function buildRejectionHtml(name: string, vacancyTitle: string): string {
  const firstName = (name || "").split(" ")[0] || "candidato";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Inter, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; padding: 24px; background: #f9f9f9; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border-radius: 12px; }
  a { color: #2C64ED; }
</style></head><body>
  <div class="container">
    <p>Hola <strong>${firstName}</strong>,</p>
    <p>Gracias por tomarte el tiempo de aplicar a la posición de <strong>${vacancyTitle}</strong> en Trading Solutions. Después de revisar tu aplicación, hemos decidido avanzar con otros candidatos cuyo perfil se ajusta más a la posición en este momento. Sin embargo, Trading Solutions sigue creciendo y nos encantaría mantenernos en contacto.</p>
    <p>Tu información queda en nuestra base de datos para futuras oportunidades. También te invitamos a seguirnos en LinkedIn para enterarte de nuevas vacantes: <a href="${TS_LINKEDIN_URL}">${TS_LINKEDIN_URL}</a></p>
    <p>Apreciamos tu interés en Trading Solutions y te deseamos mucho éxito en tus próximos pasos.</p>
    <p>Un abrazo,<br><strong>Kelly Castañeda</strong><br>Talent Acquisition and Development Lead<br>Trading Solutions</p>
  </div>
</body></html>`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidateId } = params;
    const body = await req.json();
    const targetStage = String(body.stage || "");
    const createRejectionDraft = body.create_rejection_draft !== false;

    if (!VALID_STAGES.includes(targetStage)) {
      return NextResponse.json(
        { error: `Stage inválida. Válidas: ${VALID_STAGES.join(", ")}` },
        { status: 400 }
      );
    }

    // Cargar candidato
    const { data: candidate, error: fetchErr } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, vacancy_id, stage, status, preferred_language, ht_vacancies(title, form_template_key, country)")
      .eq("id", candidateId)
      .single();

    if (fetchErr || !candidate) {
      return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      stage: targetStage,
      updated_at: new Date().toISOString(),
    };

    // Si se mueve a rechazado, también actualizar status
    if (targetStage === "rechazado") {
      updates.status = "rejected";
    }

    // Si se mueve a contratado, status también
    if (targetStage === "contratado") {
      updates.status = "completed";
    }

    let draftId: string | null = null;
    let elevareUrl: string | null = null;

    // Si se mueve a assessment_invitado: generar token + draft de Elevare
    if (targetStage === "assessment_invitado") {
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
    <p>Un abrazo,<br><strong>Kelly Castañeda</strong><br>Talent Acquisition and Development Lead<br>Trading Solutions</p>
  </div>
</body></html>`;
          const draftRes = await createDraftViaGmail({
            to: candidate.email as string,
            subject: `Trading Solutions · Assessment virtual para ${vacancyTitle}`,
            html,
            fromName: "Kelly Castañeda",
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
    if (targetStage === "rechazado" && createRejectionDraft) {
      try {
        const gmail = await isGmailConnected();
        if (gmail.connected) {
          // @ts-expect-error supabase relation
          const rawVacancyTitle = candidate.ht_vacancies?.title as string | undefined;
          // El proceso de China corre en inglés · también el descarte.
          const rejLang = resolveCandidateLang({
            formTemplateKey: (candidate as any).ht_vacancies?.form_template_key,
            preferredLanguage: (candidate as any).preferred_language,
            jobTitle: rawVacancyTitle,
            country: (candidate as any).ht_vacancies?.country,
          });
          const vacancyTitle = rawVacancyTitle || (rejLang === "en" ? "the position" : "la posición");
          const draftRes = await createDraftViaGmail({
            to: candidate.email as string,
            subject: rejLang === "en"
              ? `Trading Solutions · About your application`
              : `Trading Solutions · Sobre tu aplicación`,
            html: rejLang === "en"
              ? buildRejectionHtmlEn(candidate.name as string, vacancyTitle)
              : buildRejectionHtml(candidate.name as string, vacancyTitle),
            fromName: rejLang === "en" ? "Trading Solutions Talent Team" : "Kelly Castañeda",
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

    // Comp preview · solo al ENTRAR a la etapa existente `oferta`.
    // Samuel marca la etapa. Este bloque no la mueve: si faltan name/email/cargo
    // y el preview está armado, responde 400 y no escribe. Si Comp no está
    // configurado, o el deploy es prod, se omite y la etapa sí se guarda.
    let compPreview: CompPreviewResult | null = null;
    let pendingCompPayload: CompJobOfferPreviewPayload | null = null;
    let pendingCompUrl: string | null = null;
    let pendingCompKey: string | null = null;
    let pendingPreviewKey: string | null = null;
    if (targetStage === "oferta") {
      const plan = resolveCompHookPlan({
        fromStage: (candidate.stage as string | null) ?? null,
        toStage: targetStage,
        manualPreview: manualCompPreviewRequested(body.comp_preview),
        candidateId,
        vacancyId: (candidate.vacancy_id as string | null) ?? null,
      });
      if (plan.kind === "skip") {
        logCompPreviewSkip(plan.result.reason, plan.result.idempotency_key);
        compPreview = plan.result;
      } else {
        const source = await loadOfertaCompSource(supabaseAdmin, candidateId);
        const built = source
          ? buildCompJobOfferPreview(source)
          : { ok: false as const, missing: ["name", "email", "cargo"] as Array<"name" | "email" | "cargo"> };
        if (!built.ok) {
          console.info("[comp-job-offer-preview] incomplete", {
            missing: built.missing,
            idempotency_key: plan.idempotency_key,
          });
          return NextResponse.json(
            {
              error: "comp_preview_incomplete",
              detail: "Faltan name, email o cargo para el preview de Comp. No se inventan y la etapa no cambia.",
              missing: built.missing,
            },
            { status: 400 },
          );
        }
        pendingCompPayload = built.payload;
        pendingCompUrl = plan.url;
        pendingCompKey = plan.idempotency_key;
        pendingPreviewKey = plan.previewKey;
      }
    }

    const updateBase = supabaseAdmin
      .from("ht_candidates")
      .update(updates)
      .eq("id", candidateId);
    // La llamada a Comp va después de ganar la escritura. Si otra petición
    // ya movió la fila, esta no reenvía (clave candidate_id:vacancy_id).
    const updateQuery = !pendingCompPayload
      ? updateBase
      : candidate.stage == null
        ? updateBase.is("stage", null)
        : updateBase.eq("stage", candidate.stage as string);
    const { data: updatedRows, error: updateErr } = await updateQuery.select("id");

    if (updateErr) {
      return NextResponse.json({ error: "save_failed", detail: updateErr.message }, { status: 500 });
    }

    if (pendingCompPayload && pendingCompKey && (!updatedRows || updatedRows.length === 0)) {
      logCompPreviewSkip("already_moved", pendingCompKey);
      return NextResponse.json({
        success: false,
        error: "stage_conflict",
        detail: "La etapa cambió en paralelo. No se llamó a Comp.",
        candidate_id: candidateId,
        from_stage: candidate.stage,
        to_stage: targetStage,
        comp_preview: {
          status: "skipped",
          reason: "already_moved",
          idempotency_key: pendingCompKey,
        },
      }, { status: 409 });
    }

    if (pendingCompPayload && pendingCompUrl && pendingCompKey && pendingPreviewKey) {
      compPreview = await deliverCompJobOfferPreview(pendingCompPayload, {
        url: pendingCompUrl,
        idempotencyKey: pendingCompKey,
        previewKey: pendingPreviewKey,
      });
    }

    // ─── Historial de etapa ────────────────────────────────────────
    // Sin esto los "días en etapa" del dashboard vuelven a depender de
    // updated_at, que se pisa con cualquier edición del candidato.
    // Es best-effort: si falla, el movimiento igual quedó guardado.
    if (candidate.stage !== targetStage) {
      const compNote = compEventNote(compPreview?.status);
      const { error: eventErr } = await supabaseAdmin
        .from("ht_candidate_stage_events")
        .insert({
          candidate_id: candidateId,
          vacancy_id: candidate.vacancy_id ?? null,
          from_stage: candidate.stage ?? null,
          to_stage: targetStage,
          changed_at: new Date().toISOString(),
          source: "ui",
          note: compNote,
        });
      if (eventErr) {
        console.error("[stage] no se pudo registrar el evento de etapa:", eventErr.message);
      }
      // Columna opcional. Si no existe en esta base, el evento de arriba
      // igual deja el chip. No se tocan variables de Comp en producción.
      if (compNote) {
        const stored = await supabaseAdmin
          .from("ht_candidates")
          .update({
            comp_preview_status: compNote === "comp:sent" ? "sent" : "fail",
            comp_preview_at: new Date().toISOString(),
          })
          .eq("id", candidateId);
        if (stored.error) {
          console.info("[comp-job-offer-preview] status not stored on row", stored.error.message);
        }
      }
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
    <p>Un abrazo,<br><strong>Kelly Castañeda</strong><br>Talent Acquisition and Development Lead<br>Trading Solutions</p>
  </div>
</body></html>`;
          const welcomeRes = await createDraftViaGmail({
            to: candidate.email as string,
            subject: `Bienvenida/o a Trading Solutions, ${firstName}`,
            html: welcomeHtml,
            fromName: "Kelly Castañeda",
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
      to_stage: targetStage,
      draft_id: draftId,
      welcome_draft_id: welcomeDraftId,
      elevare_url: elevareUrl,
      person_id: personId,
      onboarding_id: onboardingId,
      ...(compPreview ? { comp_preview: compPreview } : {}),
    });
  } catch (err) {
    console.error("stage update error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
