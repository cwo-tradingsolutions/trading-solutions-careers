/**
 * POST /api/admin/send-batch-to-mary
 *
 * Genera UN draft consolidado a Mary con TODOS los candidatos actualmente
 * en la cola "bateria_psicometrica" (Pruebas Psicométricas).
 * Después mueve a todos a "solicitud_enviada_mary".
 *
 * Caso de uso: Kelly (o Yohanna) hace este batch 2x/día (mañana/tarde) en lugar
 * de mandar correos individuales a Mary. Eficiencia operativa.
 *
 * Body opcional: { vacancy_id?: string, to?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import { recordStageEvents } from "@/lib/stage-events";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

const MARY_EMAIL = process.env.MARY_PSICO_EMAIL || "mbanquez@tradingsolutions.com";

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type Cand = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  vacancy_id: string | null;
  ht_vacancies: { title: string } | null;
  metadata?: Record<string, unknown> | null;
  prefilter_data?: Record<string, unknown> | null;
  prefilter_form_data?: Record<string, unknown> | null;
};

function pickCedula(c: Cand): string {
  const sources: Record<string, unknown>[] = [
    (c.metadata || {}) as Record<string, unknown>,
    (c.prefilter_data || {}) as Record<string, unknown>,
    (c.prefilter_form_data || {}) as Record<string, unknown>,
  ];
  const keys = ["cedula", "identification", "document_number", "document"];
  for (const src of sources) {
    for (const k of keys) {
      if (src[k]) return String(src[k]);
    }
  }
  return "";
}

function buildEmailHtml(cands: Cand[]): string {
  const rows = cands.map((c, i) => `
    <tr style="border-top:1px solid #e8e8e8">
      <td style="padding:12px 8px;vertical-align:top;width:32px;color:#737373;font-weight:600">${i + 1}</td>
      <td style="padding:12px 8px;vertical-align:top">
        <div style="font-weight:700;font-size:14px;color:#0a0a0a">${escapeHtml(c.name || "—")}</div>
        <div style="font-size:12px;color:#525252;margin-top:2px">${escapeHtml(c.ht_vacancies?.title || "(sin vacante)")}</div>
      </td>
      <td style="padding:12px 8px;vertical-align:top;font-size:12px">
        ${c.email ? `<div>${escapeHtml(c.email)}</div>` : "<div style='color:#a3a3a3'>sin email</div>"}
        ${c.phone ? `<div style="margin-top:2px;color:#404040">${escapeHtml(c.phone)}</div>` : ""}
      </td>
      <td style="padding:12px 8px;vertical-align:top;font-size:12px">
        ${pickCedula(c) ? escapeHtml(pickCedula(c)) : "<span style='color:#a3a3a3'>(pendiente · pedir al candidato)</span>"}
      </td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:'Open Sauce Sans',-apple-system,sans-serif;color:#0a0a0a;line-height:1.6">
  <div style="max-width:720px;margin:0 auto;padding:32px 16px">
    <div style="background:white;padding:32px;border:1px solid #e8e8e8">
      <p style="font-size:11px;color:#737373;letter-spacing:0.6px;text-transform:uppercase;margin:0 0 6px">Batch Pruebas Psicométricas</p>
      <h2 style="font-size:22px;margin:4px 0 12px;font-weight:700">${cands.length} candidatos para pruebas psicométricas</h2>

      <p style="font-size:14px;margin:0 0 16px">Hola Mary,</p>
      <p style="font-size:14px;margin:0 0 16px">
        Te paso el lote del día con los candidatos que ya pasaron sus 3 rondas de entrevista
        (Recruiter, Hiring Lead, CWO + Hiring Manager) y están listos para aplicar pruebas psicométricas.
      </p>
      <p style="font-size:14px;margin:0 0 16px">
        Cada uno ya tiene contexto completo en sus entrevistas previas · vos decidís qué batería
        aplicar según el cargo (DISC, MBTI, Big5 propio, IQ Psicoalianza, técnicas si aplican).
      </p>

      <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:24px">
        <thead>
          <tr style="background:#0a0a0a;color:white;text-align:left">
            <th style="padding:10px 8px;font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase">#</th>
            <th style="padding:10px 8px;font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase">Candidato · Vacante</th>
            <th style="padding:10px 8px;font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase">Contacto</th>
            <th style="padding:10px 8px;font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase">Cédula</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <p style="margin-top:24px;font-size:14px">
        Cuando termines con cada uno, entra al ATS y mové al candidato a "Máquina de Turing" (si pasa)
        o a "Rechazado" (si no pasa). Si necesitas más contexto de algún candidato, escríbeme.
      </p>

      <p style="margin-top:18px;font-size:14px">Gracias!<br><strong>Equipo Talento</strong></p>

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e8e8e8;font-size:11px;color:#737373">
        Batch generado automáticamente · ${new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}
      </div>
    </div>
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
    const body = await req.json().catch(() => ({}));
    const vacancyId: string | null = body.vacancy_id || null;
    const toEmail: string = body.to || MARY_EMAIL;

    let q = supabaseAdmin
      .from("ht_candidates")
      .select("*, ht_vacancies(title)")
      .eq("stage", "bateria_psicometrica")
      .order("created_at", { ascending: true });

    if (vacancyId) q = q.eq("vacancy_id", vacancyId);

    const { data, error } = await q;
    if (error) {
      console.error("Error cargando cola Mary:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const cands = ((data || []) as unknown as Cand[]);
    if (cands.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No hay candidatos en la cola de Pruebas Psicométricas",
      }, { status: 400 });
    }

    // 1. Crear draft consolidado
    let draftId: string | null = null;
    try {
      const gmail = await isGmailConnected();
      if (!gmail.connected) {
        return NextResponse.json({ error: "Gmail no conectado" }, { status: 503 });
      }
      const html = buildEmailHtml(cands);
      const draftRes = await createDraftViaGmail({
        to: toEmail,
        subject: `Pruebas psicométricas · batch de ${cands.length} candidatos · ${new Date().toLocaleDateString("es-CO")}`,
        html,
        fromName: "Trading Solutions · Talento",
        replyTo: "jointheteam@tradingsolutions.com",
      });
      if (draftRes.ok) draftId = draftRes.draft_id;
    } catch (e: any) {
      console.error("Mary batch draft creation failed:", e);
      return NextResponse.json({ error: e?.message || "Error generando draft" }, { status: 500 });
    }

    // 2. Mover a todos a solicitud_enviada_mary
    const movedIds: string[] = [];
    const movedCands: Cand[] = [];
    for (const c of cands) {
      try {
        await supabaseAdmin
          .from("ht_candidates")
          .update({
            stage: "solicitud_enviada_mary",
            updated_at: new Date().toISOString(),
          })
          .eq("id", c.id);
        movedIds.push(c.id);
        movedCands.push(c);
      } catch (e) {
        console.warn(`No se pudo mover candidato ${c.id}:`, e);
      }
    }

    // El batch mueve decenas de candidatos de una. Sin registrar los eventos,
    // todos quedan con updated_at de hoy y el dashboard los muestra como recién
    // movidos aunque lleven semanas esperando a Mary.
    // La query de arriba filtra por stage, así que la etapa previa es conocida.
    await recordStageEvents(
      movedCands.map((c) => ({
        candidateId: c.id,
        fromStage: "bateria_psicometrica",
        toStage: "solicitud_enviada_mary",
        vacancyId: c.vacancy_id ?? null,
        source: "system" as const,
      })),
    );

    return NextResponse.json({
      success: true,
      candidates_count: cands.length,
      moved_count: movedIds.length,
      draft_id: draftId,
      to: toEmail,
    });
  } catch (err: any) {
    console.error("send-batch-to-mary error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
