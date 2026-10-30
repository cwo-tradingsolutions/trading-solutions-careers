/**
 * GET /api/cron/morning-brief
 *
 * Cron diario · 6 AM Colombia (11 UTC).
 * Le manda a Kelly un correo con el resumen de entrevistas del día +
 * pendientes de evaluar, con links directos al prep doc por candidato.
 *
 * Auth: Vercel Cron envía `Authorization: Bearer ${CRON_SECRET}` · también
 * acepta requireAdmin para correr manual desde browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendViaGmail, isGmailConnected } from "@/lib/gmail";
import { requireAdmin } from "@/lib/admin-auth";
import { cronRequestDecision } from "@/lib/cron-request-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";
const KELLY_EMAIL = "jointheteam@tradingsolutions.com";

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

export async function GET(req: NextRequest) {
  const cronDecision = cronRequestDecision(req.headers.get("authorization"), req.headers.get("x-cron-secret"));
  if (cronDecision === 401 || cronDecision === 500) {
    return NextResponse.json({ ok: false }, { status: cronDecision });
  }
  if (cronDecision !== "ok") {
    const authError = requireAdmin(req);
    if (authError) return authError;
  }

  try {
    const gmail = await isGmailConnected();
    if (!gmail.connected) {
      return NextResponse.json({ error: "gmail_not_connected" }, { status: 503 });
    }

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // Pull candidatos en stages relevantes
    // El filtro corre en la BD, así que normalizeStage no lo salva: si acá
    // quedan codes muertos el brief sale vacío aunque haya entrevistas hoy.
    const { data: cands } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, vacancy_id, stage, calendly_scheduled_at, ht_vacancies(title), prefilter_data")
      .eq("client_id", TS_CLIENT_ID)
      .in("stage", ["recruiter_interview", "prueba_tecnica", "terna"])
      .order("updated_at", { ascending: false });

    const candIds = (cands || []).map(c => c.id);
    const { data: assessments } = candIds.length > 0
      ? await supabaseAdmin
          .from("ts_recruiter_assessments")
          .select("candidate_id")
          .in("candidate_id", candIds)
      : { data: [] };

    const evaluatedSet = new Set((assessments || []).map(a => a.candidate_id));

    const all = (cands || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      vacancy_title: c.ht_vacancies?.title || "—",
      stage: c.stage,
      calendly_scheduled_at: c.calendly_scheduled_at,
      pf: c.prefilter_data || {},
      has_assessment: evaluatedSet.has(c.id),
    }));

    const scheduledToday = all.filter(c => {
      if (!c.calendly_scheduled_at) return false;
      const d = new Date(c.calendly_scheduled_at);
      return d >= todayStart && d <= todayEnd;
    }).sort((a, b) => new Date(a.calendly_scheduled_at!).getTime() - new Date(b.calendly_scheduled_at!).getTime());

    const pendingEval = all.filter(c => c.stage === "recruiter_interview" && !c.has_assessment);

    // Si no hay nada que reportar · skip envío
    if (scheduledToday.length === 0 && pendingEval.length === 0) {
      return NextResponse.json({
        skipped: true,
        reason: "Sin entrevistas hoy y sin pendientes de evaluar",
      });
    }

    // ─── Build email HTML ───
    const today = now.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.5; color: #0a0a0a; padding: 20px; background: #fafafa; }
  .container { max-width: 620px; margin: 0 auto; background: white; padding: 28px; border: 1px solid #e8e8e8; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #737373; margin-bottom: 8px; }
  h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 6px; }
  .greeting { color: #737373; font-size: 13px; margin-bottom: 24px; }
  .section-title { font-size: 12px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #0a0a0a; margin: 22px 0 8px; padding-bottom: 6px; border-bottom: 2px solid #0a0a0a; }
  .cand { padding: 12px; border: 1px solid #e8e8e8; margin-bottom: 8px; background: #fafafa; }
  .cand-name { font-size: 14px; font-weight: 700; }
  .cand-meta { font-size: 11px; color: #737373; margin-top: 2px; }
  .cand-cta { display: inline-block; background: #0a0a0a; color: white !important; text-decoration: none; padding: 6px 14px; font-weight: 700; font-size: 11px; letter-spacing: 0.5px; margin-top: 8px; }
  .empty { color: #737373; font-style: italic; font-size: 12px; }
  .footer { color: #737373; font-size: 11px; margin-top: 28px; padding-top: 14px; border-top: 1px solid #e8e8e8; }
  .stat { display: inline-block; padding: 6px 12px; background: #f3f4f6; border-radius: 4px; font-size: 11px; font-weight: 700; margin-right: 6px; }
</style></head><body>
  <div class="container">
    <div class="eyebrow">Morning Brief · ${today}</div>
    <h1>Tu agenda de entrevistas hoy</h1>
    <p class="greeting">Buenos días Kelly · acá lo que viene en tu día.</p>

    <div>
      <span class="stat">📅 ${scheduledToday.length} agendadas hoy</span>
      <span class="stat">⚡ ${pendingEval.length} pendientes evaluar</span>
    </div>

    ${scheduledToday.length > 0 ? `
      <div class="section-title">📅 Agendadas hoy</div>
      ${scheduledToday.map(c => `
        <div class="cand">
          <div class="cand-name">${c.name}</div>
          <div class="cand-meta">
            ${c.vacancy_title} · ${new Date(c.calendly_scheduled_at!).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })} ·
            Inglés ${c.pf.english_level || "—"} ·
            Salario ${c.pf.salary || "—"}
          </div>
          <a href="${APP_URL}/hr-admin/prep/${c.id}" class="cand-cta">Abrir prep →</a>
        </div>
      `).join("")}
    ` : ""}

    ${pendingEval.length > 0 ? `
      <div class="section-title">⚡ Pendientes de evaluar (post-entrevista)</div>
      ${pendingEval.map(c => `
        <div class="cand">
          <div class="cand-name">${c.name}</div>
          <div class="cand-meta">${c.vacancy_title} · sin evaluación de los 16 mandatos cargada</div>
          <a href="${APP_URL}/hr-admin#funnel" class="cand-cta">Ir al Funnel →</a>
        </div>
      `).join("")}
    ` : ""}

    <div class="footer">
      Trading Solutions · Generado a las ${now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })} ·
      <a href="${APP_URL}/hr-admin#entrevistas" style="color:#0a0a0a">Ver tab Entrevistas completo →</a>
    </div>
  </div>
</body></html>`;

    const subject = scheduledToday.length > 0
      ? `🗓️ ${scheduledToday.length} entrevista${scheduledToday.length !== 1 ? 's' : ''} hoy · ${pendingEval.length} eval pendientes`
      : `⚡ ${pendingEval.length} evaluaciones pendientes`;

    const r = await sendViaGmail({
      to: KELLY_EMAIL,
      subject,
      html,
      fromName: "Trading Solutions ATS",
    });

    if (!r.ok) {
      return NextResponse.json({ error: "send_failed", detail: r.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sent_to: KELLY_EMAIL,
      gmail_id: r.gmail_id,
      counts: {
        scheduled_today: scheduledToday.length,
        pending_eval: pendingEval.length,
      },
    });
  } catch (err: any) {
    console.error("morning-brief error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
