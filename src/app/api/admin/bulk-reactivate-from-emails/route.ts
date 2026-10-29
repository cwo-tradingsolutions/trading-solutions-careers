/**
 * POST /api/admin/bulk-reactivate-from-emails
 *
 * Toma una lista de emails de candidatos que reportaron enlace expirado.
 * Para cada uno:
 *   1. Lo busca por email en ht_candidates
 *   2. Regenera prefilter_token o assessment_token según stage (válido 7 días)
 *   3. Crea un draft de Gmail con texto de disculpa + URL fresca
 *
 * Body: { emails: string[], custom_subject_prefix?: string }
 *
 * Response: { results: [{email, status, candidate_name, fresh_url, draft_id}] }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import crypto from "crypto";
import { ATS_FROM_NAME } from "@/lib/ats-from";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";

function buildReplyHtml(firstName: string, vacancyTitle: string, freshUrl: string, isPrefilter: boolean): string {
  const stepLabel = isPrefilter ? "el cuestionario inicial" : "el Assessment virtual";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  .cta { display: inline-block; background: #0a0a0a; color: white !important; text-decoration: none; padding: 13px 28px; font-weight: 700; margin: 16px 0; letter-spacing: 0.3px; }
  p { font-size: 14px; margin: 0 0 14px; }
</style></head><body>
  <div class="container">
    <p>Hola <strong>${firstName}</strong>,</p>
    <p>Gracias por avisarme y disculpa la fricción. Aquí te dejo un nuevo enlace para completar ${stepLabel} de <strong>${vacancyTitle}</strong> · queda activo 7 días:</p>
    <p style="text-align:center"><a href="${freshUrl}" class="cta">Continuar</a></p>
    <p style="font-size:12px;color:#737373;word-break:break-all">O cópialo: ${freshUrl}</p>
    <p>Cualquier cosa que necesites para avanzar, regálame una respuesta a este correo.</p>
    <p>Un abrazo,<br><strong>Talent Acquisition Team</strong><br>Trading Solutions</p>
  </div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const emails: string[] = Array.isArray(body.emails) ? body.emails : [];
    if (emails.length === 0) {
      return NextResponse.json({ error: "Falta emails: [...]" }, { status: 400 });
    }

    const gmail = await isGmailConnected();
    if (!gmail.connected) {
      return NextResponse.json({ error: "gmail_not_connected" }, { status: 503 });
    }

    const results: any[] = [];

    for (const rawEmail of emails) {
      const email = String(rawEmail || "").trim().toLowerCase();
      if (!email) {
        results.push({ email: rawEmail, status: "empty_email" });
        continue;
      }

      // Buscar todos los registros con ese email · si hay dupes (caso Carlos)
      // priorizar el más reciente con stage prefiltro o assessment activo.
      const { data: matches } = await supabaseAdmin
        .from("ht_candidates")
        .select("id, name, email, stage, vacancy_id, prefilter_token, assessment_token, created_at, ht_vacancies(title)")
        .ilike("email", email)
        .order("created_at", { ascending: false });

      if (!matches || matches.length === 0) {
        results.push({ email, status: "not_found" });
        continue;
      }

      // Preferir el más reciente que esté en prefiltro_* o assessment_*
      const cand = matches.find(m => {
        const s = (m.stage || "") as string;
        return s.startsWith("prefiltro_") || s.startsWith("assessment_");
      }) || matches[0];

      const stage = (cand.stage || "") as string;
      const isPrefilterStage = stage.startsWith("prefiltro_");
      const isAssessmentStage = stage.startsWith("assessment_");

      if (!isPrefilterStage && !isAssessmentStage) {
        results.push({ email, status: "stage_no_aplica", stage, candidate_name: cand.name });
        continue;
      }

      // Regenerar token correspondiente · 7 días desde hoy
      const newToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      const updates: Record<string, unknown> = {};
      let freshUrl = "";

      if (isPrefilterStage) {
        updates.prefilter_token = newToken;
        updates.prefilter_token_expires_at = expiresAt.toISOString();
        freshUrl = `${APP_URL}/prefiltro/${newToken}`;
      } else {
        updates.assessment_token = newToken;
        updates.token_expires_at = expiresAt.toISOString();
        freshUrl = `${APP_URL}/assessment/ht/${newToken}`;
      }

      await supabaseAdmin.from("ht_candidates").update(updates).eq("id", cand.id);

      const firstName = (cand.name || "").split(" ")[0] || "candidato";
      // @ts-expect-error supabase relation
      const vacancyTitle: string = cand.ht_vacancies?.title || "la vacante";

      const html = buildReplyHtml(firstName, vacancyTitle, freshUrl, isPrefilterStage);
      const subject = isPrefilterStage
        ? `Trading Solutions · Nuevo enlace del cuestionario para ${vacancyTitle}`
        : `Trading Solutions · Nuevo enlace del Assessment para ${vacancyTitle}`;

      const draftRes = await createDraftViaGmail({
        to: cand.email as string,
        subject,
        html,
        fromName: ATS_FROM_NAME,
        replyTo: "jointheteam@tradingsolutions.com",
      });

      results.push({
        email,
        status: draftRes.ok ? "ok" : "draft_failed",
        candidate_id: cand.id,
        candidate_name: cand.name,
        stage,
        fresh_url: freshUrl,
        draft_id: draftRes.ok ? draftRes.draft_id : null,
        error: draftRes.ok ? null : draftRes.error,
      });
    }

    return NextResponse.json({
      processed: results.length,
      ok: results.filter(r => r.status === "ok").length,
      results,
    });
  } catch (err: any) {
    console.error("bulk-reactivate-from-emails error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
