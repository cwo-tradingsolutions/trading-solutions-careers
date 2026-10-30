import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sql, initDB } from "@/lib/db";
import { generatePortalToken } from "@/lib/portal-token";
import { sendCandidateMail } from "@/lib/ats-mail-store";
import { candidateSignatureHtml } from "@/lib/ats-from";
import { applicationStatusEmailsEnabled } from "@/lib/application-status-email";
import { buildRejectionHtml, REJECTION_REPLY_TO, rejectionEmailsEnabled, rejectionSubject } from "@/lib/rejection-email";
import { resolveCandidateLang } from "@/lib/candidate-lang";
import { candidateMailBcc } from "@/lib/candidate-bcc";
import { publicStepBody } from "@/lib/candidate-public-error";

let dbInitialized = false;

async function ensureDB() {
  if (!dbInitialized) {
    await initDB();
    dbInitialized = true;
  }
}

// Email automático en transiciones clave de status — el humano sigue
// decidiendo, pero NO tiene que escribir el correo de cada candidato.
async function sendStatusTransitionEmail(
  appRow: { id: number; full_name: string; email: string; job_title: string; job_id: number | null },
  newStatus: string
): Promise<"sent" | "pending" | "skipped" | "unavailable" | "bloqueado_staging"> {
  if (!appRow.email) return "skipped";
  // Determinar qué template usar según status
  let subject = "";
  let html = "";
  const firstName = appRow.full_name.split(" ")[0];
  const portalLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://trading-solutions-careers.vercel.app'}/portal/${generatePortalToken(appRow.id, appRow.email)}`;

  // Kelly: no BCC on candidate mail. Reply-To and the booking link still come from config.
  const bcc = candidateMailBcc();
  let replyTo: string | null = null;
  let bookingUrl: string | null = null;
  try {
    const cfgRows = await sql`SELECT email_reply_to, booking_url FROM recruiter_config WHERE id = 1`;
    if (cfgRows.length > 0) {
      replyTo = (cfgRows[0].email_reply_to as string) || null;
      bookingUrl = (cfgRows[0].booking_url as string) || null;
    }
  } catch { /* ignore */ }

  const baseHeader = `<div style="background:#0F172A;padding:28px;text-align:center"><h1 style="color:#fff;font-size:22px;margin:0;font-weight:600">Trading Solutions</h1></div>`;
  const baseFooter = `<div style="padding:18px 32px;text-align:center;color:#999;font-size:12px;border-top:1px solid #eee">Boutique Freight Forwarder · Operación en +10 países</div>`;
  const wrap = (body: string) => `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#1a1a1a;background:#f5f5f5;margin:0;padding:0"><div style="max-width:600px;margin:0 auto;background:#ffffff">${baseHeader}<div style="padding:32px">${body}</div>${baseFooter}</div></body></html>`;

  if (newStatus === "interview") {
    subject = `Trading Solutions · Avanzas a entrevista para ${appRow.job_title}`;
    const bookingButton = bookingUrl
      ? `<p style="text-align:center"><a href="${bookingUrl}" style="display:inline-block;background:#2C64ED;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600">Agendar mi entrevista</a></p>`
      : `<p style="font-size:13px;color:#666">Te contactaremos en las próximas 24 horas para coordinar la fecha y hora.</p>`;
    html = wrap(`
      <p>Hola ${firstName},</p>
      <p>¡Buenas noticias! Tras revisar tu perfil para <strong>${appRow.job_title}</strong>, queremos avanzar contigo a la fase de entrevista.</p>
      <div style="background:#EBF0FF;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0"><strong>Sobre la entrevista:</strong></p>
        <ul style="margin:8px 0;padding-left:20px"><li>Duración: 30-45 minutos</li><li>Formato: Google Meet (videollamada)</li><li>Conversación abierta — queremos conocerte y que nos conozcas</li></ul>
      </div>
      ${bookingButton}
      <p style="text-align:center;margin-top:16px"><a href="${portalLink}" style="font-size:13px;color:#666;text-decoration:underline">Ver mi proceso</a></p>
      ${candidateSignatureHtml("es")}
    `);
  } else if (newStatus === "rejected") {
    let jobLocation: string | null = null;
    if (appRow.job_id != null) {
      try {
        const locRows = await sql`SELECT location FROM vacancies WHERE id = ${appRow.job_id} LIMIT 1`;
        if (locRows.length > 0) jobLocation = (locRows[0].location as string) ?? null;
      } catch { /* el id y el título alcanzan para elegir el idioma */ }
    }
    const rejLang = resolveCandidateLang({
      jobId: appRow.job_id,
      jobTitle: appRow.job_title,
      country: jobLocation,
    });
    subject = rejectionSubject(appRow.job_title, rejLang);
    html = buildRejectionHtml(firstName, appRow.job_title, rejLang);
    replyTo = replyTo || REJECTION_REPLY_TO;
  } else if (newStatus === "hired") {
    subject = `Trading Solutions · ¡Bienvenido al equipo! 🎉`;
    html = wrap(`
      <p>${firstName},</p>
      <p>¡Bienvenido oficialmente al equipo de Trading Solutions!</p>
      <p>Estamos emocionados de tenerte como parte del equipo de <strong>${appRow.job_title}</strong>. En las próximas horas te contactaremos para coordinar tu onboarding y los primeros pasos.</p>
      <p>Mientras tanto, si tienes preguntas o necesitas algo, simplemente responde este correo.</p>
      ${candidateSignatureHtml("es")}
    `);
  } else if (newStatus === "offer") {
    subject = `Trading Solutions · Tenemos una oferta para ti`;
    html = wrap(`
      <p>Hola ${firstName},</p>
      <p>Después de evaluarte cuidadosamente, queremos ofrecerte la posición de <strong>${appRow.job_title}</strong> en Trading Solutions.</p>
      <p>Te contactaremos en las próximas horas con los detalles formales de la oferta. Mientras tanto, si tienes preguntas, responde este correo.</p>
      ${candidateSignatureHtml("es")}
    `);
  } else {
    return "skipped";
  }

  try {
    const delivered = await sendCandidateMail({
      to: appRow.email,
      candidate: appRow.email,
      type: "application_status",
      subject,
      html,
      replyTo: replyTo ?? undefined,
      bcc: bcc ?? undefined,
    });
    return delivered.status;
  } catch (e) {
    console.error(`Email transition ${newStatus} no se pudo encolar para app#${appRow.id}:`, e);
    return "unavailable";
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    await ensureDB();

    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const { status, skipEmail } = body;

    const validStatuses = ["new", "reviewing", "interview", "offer", "hired", "rejected"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // Pull el status anterior + datos para email
    const before = await sql`
      SELECT id, full_name, email, job_title, job_id, status FROM applications WHERE id = ${id} LIMIT 1
    `;
    if (before.length === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    const prev = before[0] as { id: number; full_name: string; email: string; job_title: string; job_id: number | null; status: string };

    const result = await sql`
      UPDATE applications
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, status, updated_at
    `;

    // Rejection has its own flag. Interview, offer and hired use
    // APPLICATION_STATUS_EMAILS_ENABLED, which stays off until it is set.
    const wantsEmail = !skipEmail && prev.status !== status;
    const statusMail =
      status === "interview" || status === "offer" || status === "hired";
    const emailTriggered = wantsEmail && (
      status === "rejected"
        ? rejectionEmailsEnabled()
        : statusMail && applicationStatusEmailsEnabled()
    );
    const emailStatus = emailTriggered
      ? await sendStatusTransitionEmail(prev, status)
      : "skipped";

    return NextResponse.json({ success: true, application: result[0], emailTriggered, email_status: emailStatus });
  } catch (error: unknown) {
    console.error("Error updating application:", error);
    return NextResponse.json(publicStepBody(), { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    await ensureDB();
    
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const result = await sql`
      SELECT * FROM applications WHERE id = ${id}
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    return NextResponse.json({ application: result[0] });
  } catch (error: unknown) {
    console.error("Error fetching application:", error);
    return NextResponse.json(publicStepBody(), { status: 500 });
  }
}
