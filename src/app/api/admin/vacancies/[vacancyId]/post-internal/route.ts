/**
 * POST /api/admin/vacancies/[vacancyId]/post-internal
 *
 * Crea un draft Gmail con la vacante para enviar a la lista interna de TS
 * (newsletter@tradingsolutions.com). HR revisa el draft y lo envía manualmente
 * desde Gmail.
 *
 * El draft incluye:
 *   - Título del cargo
 *   - Descripción/responsabilidades (de live_vacancies)
 *   - Link público a la vacante (con ?ref=interno para tracking)
 *
 * Internal applicants se identifican en la apply endpoint por email @tradingsolutions.com.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

const NEWSLETTER_EMAIL = process.env.INTERNAL_NEWSLETTER_EMAIL || "newsletter@tradingsolutions.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildEmailHtml(opts: {
  title: string;
  department: string;
  location: string;
  mode: string;
  applyLink: string;
  description: string;
  responsibilities: string;
  requirements: string;
}): string {
  const sectionHtml = (label: string, content: string) =>
    content ? `<h3>${escapeHtml(label)}</h3><div>${content.split("\n").filter(Boolean).map(l => `<p>${escapeHtml(l)}</p>`).join("")}</div>` : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; padding: 24px; background: #fafafa; }
  .container { max-width: 640px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  .tag { display: inline-block; background: #f1f5f9; color: #475569; padding: 4px 10px; font-size: 11px; font-weight: 600; margin-right: 6px; margin-bottom: 4px; }
  h2 { font-size: 22px; margin: 4px 0 12px; font-weight: 700; }
  h3 { font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; color: #525252; margin: 20px 0 8px; border-bottom: 1px solid #e8e8e8; padding-bottom: 6px; }
  p { font-size: 14px; margin: 0 0 10px; }
  .cta { display: inline-block; background: #0a0a0a; color: white !important; text-decoration: none; padding: 13px 28px; font-weight: 700; margin: 18px 0; letter-spacing: 0.3px; }
  .footer { color: #737373; font-size: 12px; margin-top: 26px; padding-top: 16px; border-top: 1px solid #e8e8e8; }
</style></head><body>
  <div class="container">
    <p style="font-size:12px;color:#737373;margin-bottom:6px;letter-spacing:0.6px;text-transform:uppercase">Oportunidad Interna</p>
    <h2>${escapeHtml(opts.title)}</h2>
    <div>
      ${opts.department ? `<span class="tag">${escapeHtml(opts.department)}</span>` : ""}
      ${opts.location ? `<span class="tag">${escapeHtml(opts.location)}</span>` : ""}
      ${opts.mode ? `<span class="tag">${escapeHtml(opts.mode)}</span>` : ""}
    </div>

    <p style="margin-top:18px">Hola equipo,</p>
    <p>Estamos abriendo esta oportunidad interna en Trading Solutions. Si te interesa o conoces a alguien que encaje, anímate a aplicar.</p>

    ${sectionHtml("Sobre el rol", opts.description)}
    ${sectionHtml("Responsabilidades principales", opts.responsibilities)}
    ${sectionHtml("Lo que buscamos", opts.requirements)}

    <p style="text-align:center"><a href="${opts.applyLink}" class="cta">Aplicar a la vacante</a></p>

    <p style="font-size:12px;color:#737373">Si tienes preguntas sobre el rol, responde este correo o escríbele directamente a Talento.</p>

    <div class="footer">
      Este es un job posting interno · Trading Solutions Talent Acquisition.<br>
      Compartido a través de newsletter interno · responde con tu interés o preséntate al proceso desde el link.
    </div>
  </div>
</body></html>`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { vacancyId: string } }
) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { vacancyId } = params;
    const vid = parseInt(vacancyId, 10);
    if (!Number.isFinite(vid)) {
      return NextResponse.json({ error: "vacancyId inválido" }, { status: 400 });
    }

    // 1. Cargar la vacante desde `vacancies` (Neon · misma tabla que usa /api/vacancies)
    let vacancyRow: Record<string, unknown> | null = null;
    try {
      const rows = await sql`SELECT * FROM vacancies WHERE id = ${vid} LIMIT 1`;
      vacancyRow = rows[0] || null;
    } catch (e) {
      console.error("Error cargando vacante:", e);
    }

    if (!vacancyRow) {
      return NextResponse.json({ error: "Vacante no encontrada" }, { status: 404 });
    }

    // 2. Extraer info · acepta varios nombres de columna por seguridad
    const title =
      String(vacancyRow.title_es || vacancyRow.title || "Vacante interna");
    const department =
      String(vacancyRow.department_es || vacancyRow.department || "");
    const location =
      String(vacancyRow.location_es || vacancyRow.location || "Barranquilla");
    const mode =
      String(vacancyRow.work_mode || vacancyRow.mode_es || vacancyRow.mode || "");
    const description =
      String(vacancyRow.description_es || vacancyRow.description || "");
    const responsibilities =
      String(vacancyRow.responsibilities_es || vacancyRow.responsibilities || "");
    const requirements =
      String(vacancyRow.requirements_es || vacancyRow.requirements || "");

    const applyLink = `${APP_URL}/vacantes/${vid}?ref=interno`;

    // 3. Crear draft Gmail
    let draftId: string | null = null;
    try {
      const gmail = await isGmailConnected();
      if (!gmail.connected) {
        return NextResponse.json({ error: "Gmail no conectado" }, { status: 503 });
      }
      const html = buildEmailHtml({
        title,
        department,
        location,
        mode,
        applyLink,
        description,
        responsibilities,
        requirements,
      });
      const draftRes = await createDraftViaGmail({
        to: NEWSLETTER_EMAIL,
        subject: `Oportunidad interna · ${title}`,
        html,
        fromName: "Trading Solutions · Talento",
        replyTo: "jointheteam@tradingsolutions.com",
      });
      if (draftRes.ok) draftId = draftRes.draft_id;
    } catch (e: any) {
      console.error("Internal posting draft creation failed:", e);
      return NextResponse.json({ error: e?.message || "Error generando draft" }, { status: 500 });
    }

    // 4. Tracking opcional · si la columna existe, registra
    try {
      await sql`UPDATE vacancies SET internal_posted_at = NOW() WHERE id = ${vid}`;
    } catch {
      // columna probablemente no existe — no bloquear
    }

    return NextResponse.json({
      success: true,
      vacancy_id: vid,
      vacancy_title: title,
      newsletter_email: NEWSLETTER_EMAIL,
      apply_link: applyLink,
      draft_id: draftId,
    });
  } catch (err: any) {
    console.error("post-internal error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
