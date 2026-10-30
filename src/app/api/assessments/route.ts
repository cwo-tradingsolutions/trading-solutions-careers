/**
 * /api/assessments
 *   GET  → lista todas las pruebas enviadas (con filtros opcionales)
 *   POST → crea un token de prueba; opcionalmente envía email vía Resend
 *
 * Si en el body se pasa `send_email: true`, el endpoint envía la invitación
 * directamente desde el servidor usando RESEND_API_KEY. Si se omite o es
 * false, se devuelve solo el link + un `mailto:` para que el HR Admin
 * lo dispare manualmente.
 */
import { neon } from "@/lib/sql";
import { requireAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getResend, EMAIL_FROM, EMAIL_BCC } from "@/lib/resend";
import { sendViaGmail, isGmailConnected } from "@/lib/gmail";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

function generateToken(prefix = "ats"): string {
  // Token URL-safe: ats-<16 hex chars>-<timestamp_base36>
  const id = randomBytes(8).toString("hex");
  const ts = Date.now().toString(36);
  return `${prefix}-${id}-${ts}`;
}

/* ========== GET /api/assessments ========== */
export async function GET(req: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const vacancyId = searchParams.get("vacancy_id");
    const email = searchParams.get("email");
    const limit = parseInt(searchParams.get("limit") ?? "100", 10);

    let rows;
    if (status && vacancyId) {
      rows = await sql`
        SELECT * FROM assessment_tokens
         WHERE status = ${status} AND vacancy_id = ${parseInt(vacancyId, 10)}
         ORDER BY sent_at DESC LIMIT ${limit}`;
    } else if (status) {
      rows = await sql`
        SELECT * FROM assessment_tokens
         WHERE status = ${status}
         ORDER BY sent_at DESC LIMIT ${limit}`;
    } else if (vacancyId) {
      rows = await sql`
        SELECT * FROM assessment_tokens
         WHERE vacancy_id = ${parseInt(vacancyId, 10)}
         ORDER BY sent_at DESC LIMIT ${limit}`;
    } else if (email) {
      rows = await sql`
        SELECT * FROM assessment_tokens
         WHERE candidate_email = ${email.toLowerCase()}
         ORDER BY sent_at DESC LIMIT ${limit}`;
    } else {
      rows = await sql`
        SELECT * FROM assessment_tokens
         ORDER BY sent_at DESC LIMIT ${limit}`;
    }

    return NextResponse.json(
      { data: rows, count: rows.length },
      { headers: corsHeaders }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { error: "fetch_failed", detail: msg },
      { status: 500, headers: corsHeaders }
    );
  }
}

/* ========== POST /api/assessments ========== */
type CreateBody = {
  candidate_name: string;
  candidate_email: string;
  vacancy_id?: number | null;
  vacancy_slug?: string | null;
  vacancy_title?: string | null;
  assessment_ids?: string[];
  language?: "es" | "en";
  source?: string;
  candidate_id?: number | null;
  send_email?: boolean; // si true, envía invitación vía Resend
};

function buildEmailHtml(opts: {
  candidate_name: string;
  link: string;
  vacancy_title: string;
  language: "es" | "en";
}): { subject: string; html: string } {
  const firstName = opts.candidate_name.split(" ")[0];
  if (opts.language === "en") {
    return {
      subject: `Trading Solutions · Assessment for ${opts.vacancy_title}`,
      html: `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#1a1a1a;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:600px;margin:0 auto;background:#ffffff">
  <div style="background:#0F172A;padding:28px;text-align:center"><h1 style="color:#fff;font-size:22px;margin:0;font-weight:600">Trading Solutions</h1></div>
  <div style="padding:32px">
    <p>Hi ${firstName},</p>
    <p>Thanks for applying to <strong>${opts.vacancy_title}</strong> at Trading Solutions. The next step is a short assessment.</p>
    <div style="background:#EBF0FF;border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:0"><strong>About the assessment:</strong></p>
      <ul style="margin:8px 0">
        <li>Approximate duration: <strong>55 minutes</strong> (you can pause)</li>
        <li>Format: situational role-play and short analysis</li>
        <li>You'll need: a computer with stable internet</li>
        <li>Link valid for <strong>30 days</strong></li>
      </ul>
    </div>
    <p style="text-align:center"><a href="${opts.link}" style="display:inline-block;background:#2C64ED;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600">Start assessment</a></p>
    <p>There are no right or wrong answers — we want to understand how you think.</p>
    <p>Best regards,<br><strong>Trading Solutions Recruiting</strong></p>
  </div>
  <div style="padding:18px 32px;text-align:center;color:#999;font-size:12px;border-top:1px solid #eee">Confidential — link is personal and non-transferable.</div>
</div></body></html>`,
    };
  }
  return {
    subject: `Trading Solutions · Evaluación para ${opts.vacancy_title}`,
    html: `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#1a1a1a;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:600px;margin:0 auto;background:#ffffff">
  <div style="background:#0F172A;padding:28px;text-align:center"><h1 style="color:#fff;font-size:22px;margin:0;font-weight:600">Trading Solutions</h1></div>
  <div style="padding:32px">
    <p>Hola ${firstName},</p>
    <p>Gracias por aplicar a <strong>${opts.vacancy_title}</strong> en Trading Solutions. Como siguiente paso, te invitamos a completar una evaluación corta.</p>
    <div style="background:#EBF0FF;border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:0"><strong>Sobre la evaluación:</strong></p>
      <ul style="margin:8px 0">
        <li>Duración aproximada: <strong>55 minutos</strong> (puedes pausar)</li>
        <li>Formato: escenarios de role-play y análisis cortos</li>
        <li>Necesitas: computador con internet estable</li>
        <li>Enlace válido por <strong>30 días</strong></li>
      </ul>
    </div>
    <p style="text-align:center"><a href="${opts.link}" style="display:inline-block;background:#2C64ED;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600">Iniciar evaluación</a></p>
    <p>No hay respuestas correctas o incorrectas — queremos conocer cómo piensas.</p>
    <p>Un abrazo,<br><strong>Equipo Trading Solutions</strong></p>
  </div>
  <div style="padding:18px 32px;text-align:center;color:#999;font-size:12px;border-top:1px solid #eee">Confidencial — el enlace es personal e intransferible.</div>
</div></body></html>`,
  };
}

export async function POST(req: NextRequest) {
  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = (await req.json()) as CreateBody;
    if (!body.candidate_name || !body.candidate_email) {
      return NextResponse.json(
        { error: "missing_fields", required: ["candidate_name", "candidate_email"] },
        { status: 400, headers: corsHeaders }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);
    const token = generateToken();
    const language = body.language ?? "es";
    // Default: la prueba única Evaluación Trading Solutions (migrada de Elevare)
    const assessmentIds =
      body.assessment_ids && body.assessment_ids.length > 0
        ? body.assessment_ids.join(",")
        : "factor_x_ts";
    const source = body.source ?? "manual";

    const inserted = await sql`
      INSERT INTO assessment_tokens (
        token, candidate_id, candidate_name, candidate_email,
        vacancy_id, vacancy_slug, assessment_ids, language, status, source
      ) VALUES (
        ${token},
        ${body.candidate_id ?? null},
        ${body.candidate_name},
        ${body.candidate_email.toLowerCase()},
        ${body.vacancy_id ?? null},
        ${body.vacancy_slug ?? null},
        ${assessmentIds},
        ${language},
        'sent',
        ${source}
      )
      RETURNING *`;

    const url = new URL(req.url);
    const origin = `${url.protocol}//${url.host}`;
    const link = `${origin}/assessment/${token}`;
    const vacancyTitle = body.vacancy_title || "la vacante en Trading Solutions";

    // Mailto helper (fallback si no se envía por Resend)
    const subject = encodeURIComponent(
      language === "en"
        ? `Trading Solutions · Assessment for ${vacancyTitle}`
        : `Trading Solutions · Evaluación para ${vacancyTitle}`
    );
    const message = encodeURIComponent(
      language === "en"
        ? `Hi ${body.candidate_name.split(" ")[0]},\n\nThanks for applying to Trading Solutions. The next step is a short assessment (about 55 minutes, you can pause anytime).\n\nStart here: ${link}\n\nThe link is valid for 30 days.\n\nBest,\nTrading Solutions Recruiting`
        : `Hola ${body.candidate_name.split(" ")[0]},\n\nGracias por aplicar a Trading Solutions. El siguiente paso es una evaluación corta (~55 minutos, puedes pausar cuando quieras).\n\nEmpieza aquí: ${link}\n\nEl enlace es válido por 30 días.\n\nUn abrazo,\nEquipo Trading Solutions`
    );
    const mailto = `mailto:${body.candidate_email}?subject=${subject}&body=${message}`;

    // Envío automático del email si se solicita
    let emailStatus: { sent: boolean; id?: string; error?: string; via?: 'gmail' | 'resend' } = { sent: false };
    if (body.send_email) {
      try {
        // Pull config dinámica (reply_to, bcc) de recruiter_config
        let dynamicBcc = EMAIL_BCC;
        let dynamicReplyTo: string | null = null;
        try {
          const cfgRows = await sql`SELECT * FROM recruiter_config WHERE id = 1`;
          if (cfgRows.length > 0) {
            dynamicBcc = (cfgRows[0].email_bcc as string) || EMAIL_BCC;
            dynamicReplyTo = (cfgRows[0].email_reply_to as string) || null;
          }
        } catch { /* tabla no existe aún — usa env vars */ }

        const { subject: emailSubject, html } = buildEmailHtml({
          candidate_name: body.candidate_name,
          link,
          vacancy_title: vacancyTitle,
          language,
        });

        // ─── Preferir Gmail si está conectado ────────────────────────────
        const gmailStatus = await isGmailConnected();
        if (gmailStatus.connected) {
          const result = await sendViaGmail({
            to: body.candidate_email,
            subject: emailSubject,
            html,
            replyTo: dynamicReplyTo ?? undefined,
            bcc: dynamicBcc ?? undefined,
            fromName: "Trading Solutions Recruiting",
          });
          if (result.ok) {
            emailStatus = { sent: true, id: result.gmail_id, via: 'gmail' };
          } else {
            emailStatus = { sent: false, error: result.error, via: 'gmail' };
          }
        } else {
          // Fallback a Resend
          const resend = getResend();
          const result = await resend.emails.send({
            from: EMAIL_FROM,
            to: body.candidate_email,
            bcc: dynamicBcc,
            subject: emailSubject,
            html,
            ...(dynamicReplyTo ? { replyTo: dynamicReplyTo } : {}),
          });
          if (result.error) {
            emailStatus = { sent: false, error: result.error.message ?? String(result.error), via: 'resend' };
          } else {
            emailStatus = { sent: true, id: result.data?.id, via: 'resend' };
          }
        }
      } catch (e) {
        emailStatus = { sent: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    return NextResponse.json(
      {
        data: inserted[0],
        link,
        mailto,
        email: emailStatus,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { error: "create_failed", detail: msg },
      { status: 500, headers: corsHeaders }
    );
  }
}
