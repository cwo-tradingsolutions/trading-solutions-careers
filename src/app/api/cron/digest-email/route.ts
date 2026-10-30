/**
 * GET /api/cron/digest-email
 *
 * Cron diario · 8am Colombia (13:00 UTC). Manda a Kelly un resumen del día:
 *   - Drafts de recordatorio creados anoche listos para revisar y enviar
 *   - Decisiones pendientes (CWO/Hiring Managers)
 *   - Aging crítico
 *   - Quick wins
 *
 * Recipient: jointheteam@tradingsolutions.com (configurable vía env DIGEST_RECIPIENT).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendViaGmail, isGmailConnected } from "@/lib/gmail";
import { requireAdmin } from "@/lib/admin-auth";
import { readCronSecret } from "@/lib/hr-admin-secrets";

export const runtime = "nodejs";
export const maxDuration = 60;

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";

function isVercelCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const secret = readCronSecret();
  return Boolean(secret) && auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isVercelCron(req)) {
    const authError = requireAdmin(req);
    if (authError) return authError;
  }

  try {
    const gmailStatus = await isGmailConnected();
    if (!gmailStatus.connected) {
      return NextResponse.json({ error: "gmail_not_connected" }, { status: 503 });
    }

    const recipient = process.env.DIGEST_RECIPIENT || "jointheteam@tradingsolutions.com";

    // 1. Drafts de recordatorio creados en las últimas 24h
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentDrafts } = await supabaseAdmin
      .from("ts_reminders_sent")
      .select("scenario_key, iteration, candidate:ht_candidates(name, email, ht_vacancies(title))")
      .gte("sent_at", yesterday)
      .eq("channel", "email");

    const draftsByScenario: Record<string, any[]> = {};
    (recentDrafts || []).forEach((d: any) => {
      const key = `${d.scenario_key}_${d.iteration}`;
      if (!draftsByScenario[key]) draftsByScenario[key] = [];
      draftsByScenario[key].push(d);
    });

    // 2. Decisiones pendientes
    const { data: pendingDecisions } = await supabaseAdmin
      .from("ts_interview_decisions")
      .select("*, candidate:ht_candidates(name, ht_vacancies(title))")
      .is("responded_at", null)
      .gte("expires_at", new Date().toISOString());

    // 3. Today's Focus snapshot (aging + quick wins)
    const { data: cands } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, stage, updated_at, ht_vacancies(title)")
      .eq("client_id", TS_CLIENT_ID)
      // Codes v4 vivos · el filtro corre en la BD. "aging_check" nunca fue un
      // stage real y "assessment_completado" quedó absorbido por "pruebas".
      .in("stage", ["prefiltro_revision", "pruebas", "prueba_tecnica", "terna", "oferta"])
      .not("email", "ilike", "%@tradingsolutions.com");

    const now = Date.now();
    const aging = (cands || []).filter((c: any) => {
      if (!c.updated_at) return false;
      const days = Math.floor((now - new Date(c.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      return days > 5;
    });
    const quickWins = (cands || []).filter((c: any) => ["oferta", "terna"].includes(c.stage));

    // Construir HTML
    const totalDrafts = Object.values(draftsByScenario).reduce((sum, arr) => sum + arr.length, 0);
    const totalDecisions = (pendingDecisions || []).length;
    const totalAging = aging.length;
    const totalQuickWins = quickWins.length;

    const today = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; color: #0a0a0a; line-height: 1.5; margin: 0; padding: 24px; background: #fafafa; }
  .wrap { max-width: 640px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #737373; margin-bottom: 8px; }
  h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; margin: 0 0 24px; }
  h2 { font-size: 14px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #1a1a1a; margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #e8e8e8; }
  .kpi-row { display: table; width: 100%; margin: 20px 0; border: 1px solid #e8e8e8; }
  .kpi-cell { display: table-cell; padding: 16px; text-align: center; border-right: 1px solid #e8e8e8; vertical-align: top; }
  .kpi-cell:last-child { border-right: none; }
  .kpi-num { font-size: 36px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
  .kpi-num.green { color: #1a7d3e; }
  .kpi-num.amber { color: #b45309; }
  .kpi-num.red { color: #c41818; }
  .kpi-lbl { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600; color: #737373; margin-top: 8px; }
  .item { padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  .item:last-child { border-bottom: none; }
  .item strong { color: #0a0a0a; }
  .item span { color: #737373; }
  .cta { display: inline-block; background: #0a0a0a; color: white; padding: 12px 24px; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 0.5px; margin-top: 24px; }
  .empty { color: #a3a3a3; font-style: italic; font-size: 13px; padding: 12px 0; }
</style></head>
<body>
  <div class="wrap">
    <div class="eyebrow">Trading Solutions · Talent Acquisition</div>
    <h1>Buenos días, Kelly.</h1>
    <p style="color: #737373; font-size: 14px; margin: 0 0 8px;">Resumen de hoy · ${today}</p>

    <div class="kpi-row">
      <div class="kpi-cell">
        <div class="kpi-num">${totalDrafts}</div>
        <div class="kpi-lbl">Drafts listos</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-num ${totalDecisions > 0 ? 'amber' : ''}">${totalDecisions}</div>
        <div class="kpi-lbl">Decisiones pendientes</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-num ${totalAging > 5 ? 'red' : totalAging > 0 ? 'amber' : ''}">${totalAging}</div>
        <div class="kpi-lbl">Aging crítico</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-num green">${totalQuickWins}</div>
        <div class="kpi-lbl">Quick wins</div>
      </div>
    </div>

    ${totalDrafts > 0 ? `
      <h2>Drafts de recordatorio · revisá y enviá</h2>
      ${Object.entries(draftsByScenario).map(([key, items]) => `
        <div class="item">
          <strong>${key.replace(/_/g, ' · ')}</strong> · ${items.length} candidatos
          <div style="margin-top: 4px; color: #737373; font-size: 12px;">
            ${items.slice(0, 3).map((d: any) => d.candidate?.name || '?').join(' · ')}${items.length > 3 ? ` y ${items.length - 3} más` : ''}
          </div>
        </div>
      `).join('')}
      <p style="font-size: 12px; color: #737373; margin-top: 8px;">Abrí Gmail Drafts para revisar y enviar uno por uno.</p>
    ` : '<h2>Drafts de recordatorio</h2><div class="empty">Sin recordatorios nuevos hoy. El cron corre cada 6h.</div>'}

    ${totalDecisions > 0 ? `
      <h2>Decisiones pendientes</h2>
      ${(pendingDecisions || []).slice(0, 5).map((d: any) => `
        <div class="item">
          <strong>${d.candidate?.name || '?'}</strong> <span>· ${d.candidate?.ht_vacancies?.title || '—'}</span>
          <div style="font-size: 11px; color: #a3a3a3; margin-top: 2px;">Esperando decisión de ${d.recipient_role}${d.recipient_name ? ` (${d.recipient_name})` : ''}</div>
        </div>
      `).join('')}
    ` : ''}

    ${totalQuickWins > 0 ? `
      <h2>Quick wins · cierres inminentes</h2>
      ${quickWins.slice(0, 5).map((c: any) => `
        <div class="item">
          <strong>${c.name}</strong> <span>· ${c.ht_vacancies?.title || '—'} · ${c.stage}</span>
        </div>
      `).join('')}
    ` : ''}

    ${totalAging > 0 ? `
      <h2>Aging · candidatos sin movimiento</h2>
      ${aging.slice(0, 5).map((c: any) => {
        const days = Math.floor((now - new Date(c.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        return `<div class="item"><strong>${c.name}</strong> <span>· ${c.ht_vacancies?.title || '—'} · ${days}d sin moverse</span></div>`;
      }).join('')}
    ` : ''}

    <a href="${APP_URL}/hr-admin#dashboard" class="cta">Abrir Dashboard →</a>

    <p style="color: #a3a3a3; font-size: 11px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e8e8e8;">
      Recibís este correo porque sos administradora del HR ATS de Trading Solutions. Para cambiar la frecuencia o desactivar, escribime.
    </p>
  </div>
</body>
</html>`;

    const subject = totalDrafts + totalDecisions + totalAging > 0
      ? `Talento · ${totalDrafts + totalDecisions + totalAging} acciones para hoy`
      : `Talento · día tranquilo`;

    const sendRes = await sendViaGmail({
      to: recipient,
      subject,
      html,
      fromName: "Trading Solutions Talento",
    });

    if (!sendRes.ok) {
      return NextResponse.json({ error: sendRes.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      gmail_id: sendRes.gmail_id,
      summary: { totalDrafts, totalDecisions, totalAging, totalQuickWins },
    });
  } catch (err: any) {
    console.error("digest-email error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
