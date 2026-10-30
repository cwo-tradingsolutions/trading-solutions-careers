/**
 * POST /api/admin/candidates/[candidateId]/resend-rejection
 *
 * Vuelve a generar el correo de rechazo de alguien que YA está rechazado.
 *
 * POR QUÉ EXISTE
 * `reject-with-reason` arma el correo como efecto secundario de mover al
 * candidato a rechazado. Si en ese momento Gmail no respondía, el permiso de
 * Google había expirado, o el borrador quedó sin enviar, no había manera de
 * volver a intentarlo: el candidato ya estaba en rechazado y no se podía
 * rechazar de nuevo. Esta ruta separa las dos cosas — la decisión ya está
 * tomada, acá solo se vuelve a mandar el correo.
 *
 * Body:
 *   - mode: "draft" (default) deja borrador en Gmail · "send" envía de verdad
 *   - force: true crea el borrador aunque ya haya salido o ya exista uno
 *
 * ANTES DE CREAR NADA, MIRA GMAIL
 * El borrador que se crea al rechazar se envía desde Gmail, y ese envío el ATS
 * no lo ve. Por eso muchas fichas decían «Sin enviar» con el correo ya en
 * Enviados. Ahora, antes de armar otro borrador:
 *   1. Si el correo ya está en Enviados (después de la fecha del rechazo),
 *      marca la ficha como enviada y no crea nada.
 *   2. Si el borrador de antes sigue en Gmail sin enviar, lo dice y no crea
 *      otro encima: un segundo borrador es un segundo correo esperando salir.
 *
 * No toca la etapa, ni la categoría, ni `rejected_at`. Solo el correo.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import {
  createDraftViaGmail,
  isGmailConnected,
  findSentRejection,
  gmailDraftExists,
} from "@/lib/gmail";
import { sendCandidateMail } from "@/lib/ats-mail-store";
import {
  buildRejectionHtml,
  rejectionEmailsEnabled,
  rejectionSentAt,
  rejectionSubject,
  REJECTION_FROM_NAME,
  REJECTION_REPLY_TO,
} from "@/lib/rejection-email";
import { resolveCandidateLang } from "@/lib/candidate-lang";


export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } },
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    // Por defecto borrador: el correo lo revisa y lo envía una persona.
    const mode: "send" | "draft" = body?.mode === "send" ? "send" : "draft";
    const force = body?.force === true;

    const { data: cand, error: fetchErr } = await supabaseAdmin
      .from("ht_candidates")
      .select(
        "id, name, email, stage, status, preferred_language, rejection_category, rejection_note_public, rejection_sent_at, rejection_draft_id, rejected_at, ht_vacancies(title, form_template_key, country)",
      )
      .eq("id", params.candidateId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: "No se pudo leer el candidato", detail: fetchErr.message }, { status: 500 });
    }
    if (!cand) {
      return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
    }

    // Solo para quienes están en la etapa de rechazados. Mira la etapa y no el
    // `status`: hay fichas con status «rejected» de un proceso viejo que hoy
    // siguen activas en otra etapa, y a esas no se les manda un rechazo.
    if (cand.stage !== "rechazado") {
      return NextResponse.json(
        { error: "Este candidato no está rechazado. El correo de rechazo se genera al rechazarlo." },
        { status: 409 },
      );
    }

    if (!cand.email) {
      return NextResponse.json(
        { error: `${cand.name || "El candidato"} no tiene correo registrado.` },
        { status: 422 },
      );
    }

    // China corre en inglés · el correo de descarte también.
    const lang = resolveCandidateLang({
      formTemplateKey: (cand as any).ht_vacancies?.form_template_key,
      preferredLanguage: (cand as any).preferred_language,
      jobTitle: (cand as any).ht_vacancies?.title,
      country: (cand as any).ht_vacancies?.country,
    });

    const gmail = await isGmailConnected();
    if (!gmail.connected) {
      return NextResponse.json(
        {
          error:
            "Gmail no está conectado o el permiso de Google expiró. Se reconecta entrando a " +
            "/api/google/auth con la sesión de jointheteam@tradingsolutions.com.",
        },
        { status: 503 },
      );
    }

    if (!force) {
      // 1. ¿Ya salió? Se mira Enviados, no la ficha: la ficha no se entera de
      //    lo que se envía desde Gmail.
      const enviado = await findSentRejection(cand.email as string, (cand as any).rejected_at);
      if (enviado.ok && enviado.sentAt) {
        if (!cand.rejection_sent_at) {
          await supabaseAdmin
            .from("ht_candidates")
            .update({ rejection_sent_at: enviado.sentAt, updated_at: new Date().toISOString() })
            .eq("id", params.candidateId);
        }
        const fecha = new Date(enviado.sentAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
        return NextResponse.json({
          success: true,
          already_sent: true,
          sent_at: enviado.sentAt,
          times: enviado.count,
          message:
            `Ya había salido el ${fecha}` +
            (enviado.count > 1 ? ` (${enviado.count} veces)` : "") +
            ". Quedó marcado como enviado; no se creó otro borrador.",
        });
      }

      // 2. ¿Hay un borrador anterior esperando en Gmail?
      const draftId = (cand as any).rejection_draft_id as string | null;
      if (mode === "draft" && draftId) {
        const existe = await gmailDraftExists(draftId);
        if (existe === true) {
          return NextResponse.json({
            success: true,
            draft_exists: true,
            draft_id: draftId,
            to: cand.email,
            message: "Ya hay un borrador sin enviar para esta persona en Gmail. Envía ese; no se creó otro.",
          });
        }
      }
    }

    if (!rejectionEmailsEnabled()) {
      return NextResponse.json({
        success: true,
        email_suppressed: true,
        sent: false,
        message:
          "Los correos de rechazo están apagados (REJECTION_EMAILS_ENABLED). No se creó borrador ni se envió nada.",
      });
    }

    const vacancyTitle: string =
      ((cand as any).ht_vacancies?.title as string) ||
      (lang === "en" ? "the position" : "la posición");
    const firstName = (cand.name || "").split(" ")[0] || (lang === "en" ? "there" : "candidato");
    const html = buildRejectionHtml(firstName, vacancyTitle, lang);
    const subject = rejectionSubject(vacancyTitle, lang);
    const fromName = REJECTION_FROM_NAME;

    if (mode === "draft") {
      const res = await createDraftViaGmail({
        to: cand.email as string,
        subject,
        html,
        fromName,
        replyTo: REJECTION_REPLY_TO,
      });
      if (!res.ok) {
        console.error("[resend-rejection] draft", res.error);
        return NextResponse.json({ error: "No se pudo crear el borrador en Gmail.", status: "not_sent" }, { status: 502 });
      }
      await supabaseAdmin
        .from("ht_candidates")
        .update({ rejection_draft_id: res.draft_id, updated_at: new Date().toISOString() })
        .eq("id", params.candidateId);

      return NextResponse.json({
        success: true,
        mode: "draft",
        draft_id: res.draft_id,
        to: cand.email,
        message: `Borrador creado en ${res.gmail_email}. Revisalo y enviálo desde Gmail.`,
      });
    }

    const delivered = await sendCandidateMail({
      to: cand.email as string,
      candidate: cand.email as string,
      type: "rejection_resend",
      subject,
      html,
      replyTo: REJECTION_REPLY_TO,
    });
    if (delivered.status === "bloqueado_staging") {
      return NextResponse.json({
        success: true,
        mode: "send",
        status: "bloqueado_staging",
        message: "El correo no salió: el destinatario no está permitido en este ambiente.",
      });
    }
    if (delivered.status === "pending") {
      return NextResponse.json({
        success: true,
        mode: "send",
        status: "pending",
        to: cand.email,
        message: "El correo quedó pendiente hasta reconectar jointheteam@.",
      });
    }

    const sentAt = rejectionSentAt(true);
    const { error: updErr } = await supabaseAdmin
      .from("ht_candidates")
      .update({ rejection_sent_at: sentAt, updated_at: sentAt })
      .eq("id", params.candidateId);

    // Si el correo salió pero no se pudo marcar, es peor callarlo: el próximo
    // clic volvería a enviar sin avisar que ya había salido.
    if (updErr) {
      return NextResponse.json({
        success: true,
        mode: "send",
        to: cand.email,
        sent_at: sentAt,
        warning: "El correo salió, pero no se pudo registrar la fecha de envío: " + updErr.message,
      });
    }

    return NextResponse.json({
      success: true,
      mode: "send",
      to: cand.email,
      sent_at: sentAt,
      resent: Boolean(cand.rejection_sent_at),
      message: `Correo enviado a ${cand.email}.`,
    });
  } catch (err: any) {
    console.error("[resend-rejection]", err);
    return NextResponse.json(
      { error: "Error interno", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}
