/**
 * GET /api/cron/run-reminders
 *
 * Cron que corre cada 6h. Para cada candidato en stages que tienen reglas
 * de recordatorio:
 *   1. Calcula días en stage
 *   2. Determina la iteración correspondiente (1, 2 o 3)
 *   3. Si no se ha enviado ese reminder aún · NO está pausado · stage matchea:
 *      → renderiza template con variables del candidato
 *      → crea draft en Gmail (canal email)
 *      → registra en ts_reminders_sent
 *   4. Si la iteración > max_iterations sin respuesta → mark_paused
 *
 * Auth: Vercel Cron envía header `Authorization: Bearer ${CRON_SECRET}`.
 * También aceptamos requireAdmin para correr manualmente desde browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import {
  getActiveReminderRules,
  renderTemplate,
  getIterationForDays,
  getLanguage,
} from "@/lib/reminder-templates";
import { requireAdmin } from "@/lib/admin-auth";
import { recordStageEvent } from "@/lib/stage-events";
import crypto from "crypto";
import { ATS_FROM_NAME } from "@/lib/ats-from";

export const runtime = "nodejs";
export const maxDuration = 60;

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";

/**
 * Garantiza que el candidato tenga un token fresco según su stage actual.
 * Cualquier reminder enviado siempre tendrá un enlace válido por al menos 7 días.
 *
 *   - Stages "prefiltro_*" → refresca prefilter_token + 7 días
 *   - Stages "assessment_*" → refresca assessment_token + 7 días
 *
 * Devuelve {prefilterUrl, assessmentUrl} listos para meter en el template.
 */
async function ensureFreshTokensForReminder(cand: any): Promise<{ prefilterUrl: string; assessmentUrl: string }> {
  const stage = cand.stage || "";
  const isPrefilterStage = stage.startsWith("prefiltro_");
  const isAssessmentStage = stage.startsWith("assessment_");

  let prefilterToken = cand.prefilter_token;
  let assessmentToken = cand.assessment_token;
  const updates: Record<string, unknown> = {};

  if (isPrefilterStage) {
    // Siempre regenerar para que el candidato tenga 7 días desde HOY
    prefilterToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    updates.prefilter_token = prefilterToken;
    updates.prefilter_token_expires_at = expiresAt.toISOString();
  }

  if (isAssessmentStage) {
    assessmentToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    updates.assessment_token = assessmentToken;
    updates.token_expires_at = expiresAt.toISOString();
  }

  if (Object.keys(updates).length > 0) {
    await supabaseAdmin
      .from("ht_candidates")
      .update(updates)
      .eq("id", cand.id);
  }

  return {
    prefilterUrl: prefilterToken ? `${APP_URL}/prefiltro/${prefilterToken}` : "",
    assessmentUrl: assessmentToken ? `${APP_URL}/assessment/ht/${assessmentToken}` : "",
  };
}

function isVercelCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  // Permitir Vercel Cron O admin manual
  if (!isVercelCron(req)) {
    const authError = requireAdmin(req);
    if (authError) return authError;
  }

  try {
    const gmailStatus = await isGmailConnected();
    if (!gmailStatus.connected) {
      return NextResponse.json({ error: "gmail_not_connected", message: "Gmail OAuth no está conectado · no se pueden crear drafts" }, { status: 503 });
    }

    const rules = await getActiveReminderRules();
    if (rules.length === 0) {
      return NextResponse.json({ message: "Sin reglas activas", processed: 0 });
    }

    // Pull todos los candidatos en stages relevantes
    const allStages = Array.from(new Set(rules.flatMap(r => r.stage_codes)));
    const { data: candidates } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, phone, stage, updated_at, vacancy_id, preferred_language, ht_vacancies(title), prefilter_token, assessment_token")
      .eq("client_id", TS_CLIENT_ID)
      .in("stage", allStages)
      .not("email", "ilike", "%@tradingsolutions.com");

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ message: "Sin candidatos en stages con reglas", processed: 0 });
    }

    // Pull pausas activas
    const { data: pausedRows } = await supabaseAdmin
      .from("ts_candidate_reminders_paused")
      .select("candidate_id, paused_until")
      .gte("paused_until", new Date().toISOString());
    const pausedSet = new Set((pausedRows || []).map((p: any) => p.candidate_id));

    // Pull log existente para no duplicar
    const candIds = candidates.map((c: any) => c.id);
    const { data: existingLog } = await supabaseAdmin
      .from("ts_reminders_sent")
      .select("candidate_id, scenario_key, iteration, channel")
      .in("candidate_id", candIds);
    const sentSet = new Set(
      (existingLog || []).map((r: any) => `${r.candidate_id}|${r.scenario_key}|${r.iteration}|${r.channel}`)
    );

    const results: any[] = [];
    const now = Date.now();

    for (const cand of candidates) {
      // Skip si está pausado
      if (pausedSet.has(cand.id)) {
        results.push({ candidate_id: cand.id, status: "skipped_paused" });
        continue;
      }

      // Encontrar regla aplicable
      const rule = rules.find(r => r.stage_codes.includes(cand.stage || ""));
      if (!rule) {
        results.push({ candidate_id: cand.id, status: "no_rule" });
        continue;
      }

      // Calcular días en stage
      const daysInStage = cand.updated_at
        ? Math.floor((now - new Date(cand.updated_at).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const iteration = getIterationForDays(daysInStage, rule.reminder_days);
      if (iteration === null) {
        results.push({ candidate_id: cand.id, status: "too_early", days: daysInStage });
        continue;
      }

      // ¿Se agotaron iteraciones? → ejecutar acción configurada
      if (iteration > rule.max_iterations) {
        if (rule.on_exhausted_action === "mark_paused") {
          await supabaseAdmin
            .from("ts_candidate_reminders_paused")
            .upsert({
              candidate_id: cand.id,
              paused_until: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
              reason: `Sin respuesta tras ${rule.max_iterations} recordatorios · ${rule.scenario_key}`,
              paused_by: "cron",
              deleted_at: null,
              deleted_by: null,
              delete_reason: null,
            });
          results.push({ candidate_id: cand.id, status: "exhausted_paused" });
        } else if (rule.on_exhausted_action === "mark_rejected") {
          const { error: rejectErr } = await supabaseAdmin
            .from("ht_candidates")
            .update({ stage: "rechazado", status: "rejected", updated_at: new Date().toISOString() })
            .eq("id", cand.id);

          // El auto-rechazo por silencio es justo el caso donde interesa saber
          // desde qué etapa se cayó el candidato y cuándo: sin el evento el
          // historial muestra al rechazado como si nunca hubiera avanzado.
          if (!rejectErr) {
            await recordStageEvent({
              candidateId: cand.id,
              fromStage: cand.stage ?? null,
              toStage: "rechazado",
              vacancyId: cand.vacancy_id ?? null,
              source: "system",
              note: `auto-rechazo tras ${rule.max_iterations} recordatorios · ${rule.scenario_key}`,
            });
          }
          results.push({ candidate_id: cand.id, status: "exhausted_rejected" });
        } else {
          results.push({ candidate_id: cand.id, status: "exhausted_noop" });
        }
        continue;
      }

      // ¿Ya se envió este reminder?
      const sentKey = `${cand.id}|${rule.scenario_key}|${iteration}|email`;
      if (sentSet.has(sentKey)) {
        results.push({ candidate_id: cand.id, status: "already_sent", iteration });
        continue;
      }

      // Renderizar template
      const lang = getLanguage(cand);
      const tpl = rule.templates?.[String(iteration)]?.[lang];
      if (!tpl) {
        results.push({ candidate_id: cand.id, status: "no_template", iteration, lang });
        continue;
      }

      // Variables disponibles
      const firstName = (cand.name || "").split(" ")[0] || "candidato";
      // @ts-expect-error supabase relation
      const vacancyTitle = cand.ht_vacancies?.title || "la vacante";

      // Refrescar token según stage · garantiza enlace válido por 7 días desde HOY
      const { prefilterUrl, assessmentUrl } = await ensureFreshTokensForReminder(cand);

      const rendered = renderTemplate(tpl, {
        firstName,
        vacancy: vacancyTitle,
        prefilter_url: prefilterUrl,
        assessment_url: assessmentUrl,
      });

      // Crear draft en Gmail
      if (rendered.email_subject && rendered.email_body && cand.email) {
        const draftRes = await createDraftViaGmail({
          to: cand.email,
          subject: rendered.email_subject,
          html: rendered.email_body.replace(/\n/g, "<br>"),
          fromName: ATS_FROM_NAME,
          replyTo: "jointheteam@tradingsolutions.com",
        });

        if (draftRes.ok) {
          await supabaseAdmin.from("ts_reminders_sent").insert({
            candidate_id: cand.id,
            scenario_key: rule.scenario_key,
            iteration,
            channel: "email",
            language: lang,
            draft_id: draftRes.draft_id,
            preview_text: rendered.email_body.slice(0, 200),
          });
          results.push({
            candidate_id: cand.id,
            candidate_name: cand.name,
            status: "draft_created",
            scenario: rule.scenario_key,
            iteration,
            language: lang,
            draft_id: draftRes.draft_id,
          });
        } else {
          results.push({ candidate_id: cand.id, status: "draft_failed", error: draftRes.error });
        }
      } else {
        results.push({ candidate_id: cand.id, status: "missing_fields" });
      }
    }

    const summary = {
      scanned: candidates.length,
      drafts_created: results.filter(r => r.status === "draft_created").length,
      already_sent: results.filter(r => r.status === "already_sent").length,
      too_early: results.filter(r => r.status === "too_early").length,
      paused: results.filter(r => r.status === "skipped_paused").length,
      exhausted: results.filter(r => r.status?.startsWith("exhausted")).length,
      errors: results.filter(r => r.status === "draft_failed").length,
    };

    return NextResponse.json({ summary, results: results.slice(0, 50) });
  } catch (err: any) {
    console.error("run-reminders error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
