/**
 * POST /api/admin/export-pipeline-to-yohanna
 *
 * Genera un draft de Gmail dirigido a Yohanna con TODOS los candidatos que
 * están actualmente en stages pendientes O rechazados de las vacantes que se
 * especifiquen. Incluye las revisiones de Kelly (prefilter + recruiter assessments).
 *
 * Caso de uso (mayo 2026): Kelly sale el viernes y le pasa el handoff completo a
 * Yohanna de candidatos de Pricing Junior + Inside Sales (las activas que sigue
 * Kelly). Talent Acquisition ya tuvo handoff aparte vía Calendly.
 *
 * Body opcional:
 *   { vacancy_ids?: string[], stages?: string[], to?: string, include_rejected?: boolean }
 *
 * Defaults:
 *   - vacancy_ids: si filter set en UI, usar ese · sino todas las active
 *   - stages: ['prefiltro_pasado','prefiltro_revision','recruiter_interview',
 *              'hiring_lead_interview','cwo_interview'] + 'rechazado' si include_rejected
 *   - to: yfranco@tradingsolutions.com
 *   - include_rejected: true por default
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { sql } from "@/lib/db";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import { ATS_FROM_NAME } from "@/lib/ats-from";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

const YOHANNA_EMAIL = process.env.HANDOFF_EMAIL || "yfranco@tradingsolutions.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";

const DEFAULT_STAGES_ACTIVE = [
  "prefiltro_pasado",
  "prefiltro_revision",
  "recruiter_interview",
  "hiring_lead_interview",
  "cwo_interview",
  "bateria_psicometrica",
  "solicitud_enviada_mary",
];
const STAGE_HUMAN_LABELS: Record<string, string> = {
  prefiltro_pasado: "Prefiltro · Pass",
  prefiltro_revision: "Prefiltro · Review",
  recruiter_interview: "Entrevista Recruiter",
  hiring_lead_interview: "Entrevista Hiring Lead",
  cwo_interview: "CWO + Hiring Manager",
  bateria_psicometrica: "Pruebas Psicométricas",
  solicitud_enviada_mary: "Solicitud a HR Specialist",
  touring: "Máquina de Turing",
  terna: "Terna · Finalistas",
  oferta: "Oferta",
  contratado: "Contratado",
  rechazado: "Rechazado",
};

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
  linkedin_url?: string | null;
  cv_url?: string | null;
  cv_filename?: string | null;
  vacancy_id: string | null;
  ht_vacancies: { title: string } | null;
  stage?: string | null;
  created_at: string | null;
  current_job_role?: string | null;
  prefilter_score?: number | null;
  prefilter_notes?: string | null;
  rejection_reason?: string | null;
  rejection_category?: string | null;
  metadata?: Record<string, unknown> | null;
  prefilter_data?: Record<string, unknown> | null;
  prefilter_form_data?: Record<string, unknown> | null;
};

type Assessment = {
  candidate_id: string;
  verdict?: string | null;
  verdict_summary?: string | null;
  summary_for_cwo?: string | null;
  english_verdict?: string | null;
  english_real?: string | null;
  pass_reasons?: unknown;
  fail_reasons?: unknown;
  additional_notes?: string | null;
  interview_date?: string | null;
};

function pickFromAny(c: Cand, keys: string[]): string {
  const sources: Record<string, unknown>[] = [
    (c.metadata || {}) as Record<string, unknown>,
    (c.prefilter_data || {}) as Record<string, unknown>,
    (c.prefilter_form_data || {}) as Record<string, unknown>,
  ];
  for (const src of sources) {
    for (const k of keys) {
      if (src[k]) return String(src[k]);
    }
  }
  return "";
}

function pickCedula(c: Cand): string {
  return pickFromAny(c, ["cedula", "identification", "document_number", "document"]);
}
function pickLinkedIn(c: Cand): string {
  if (c.linkedin_url) return c.linkedin_url;
  return pickFromAny(c, ["linkedin_url", "linkedin"]);
}
function pickCvUrl(c: Cand): string {
  if (c.cv_url) return c.cv_url;
  if (c.cv_filename) return `${APP_URL}/api/cv/${c.id}`;
  return pickFromAny(c, ["cv_url", "cv_link"]);
}
function pickCurrentRole(c: Cand): string {
  if (c.current_job_role) return c.current_job_role;
  return pickFromAny(c, ["current_job_role", "current_role", "current_position"]);
}
function pickPrefilterScore(c: Cand): string {
  if (c.prefilter_score != null) return `${c.prefilter_score}/100`;
  const fromMeta = pickFromAny(c, ["prefilter_score", "score"]);
  return fromMeta ? `${fromMeta}/100` : "—";
}
function pickPrefilterNotes(c: Cand): string {
  if (c.prefilter_notes) return c.prefilter_notes;
  return pickFromAny(c, ["prefilter_notes", "notes", "why_ts"]);
}
function pickRejectionReason(c: Cand): string {
  if (c.rejection_reason) return c.rejection_reason;
  return pickFromAny(c, ["rejection_reason", "rejection_notes", "reject_reason"]);
}

type AppRow = {
  id: number;
  email: string;
  linkedin: string | null;
  cv_filename: string | null;
  why_ts: string | null;
  prefilter_data: Record<string, unknown> | null;
  score: number | null;
};

function renderCandidateCard(
  c: Cand,
  a: Assessment | null,
  idx: number,
  app: AppRow | undefined,
): string {
  const appPref = (app?.prefilter_data || {}) as Record<string, unknown>;
  const cedula = pickCedula(c)
    || (appPref["cedula"] as string)
    || (appPref["identification"] as string)
    || "";
  // CV · prioriza la application (Neon) que sí tiene cv_data
  const cvHref = app?.cv_filename && app?.id
    ? `${APP_URL}/api/admin/cv/${app.id}`
    : pickCvUrl(c);
  const linkedinHref = pickLinkedIn(c) || app?.linkedin || "";
  const currentRole = pickCurrentRole(c) || (appPref["current_job_role"] as string) || "";
  const prefScoreStr = pickPrefilterScore(c);
  const prefScore = prefScoreStr === "—" && app?.score != null ? `${app.score}/100` : prefScoreStr;
  const prefNotes = pickPrefilterNotes(c) || app?.why_ts || "";
  const applied = c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : "—";

  // Asses block
  let assessBlock = "";
  if (a) {
    const verdict = a.verdict ? a.verdict.toUpperCase() : "";
    const verdictColor =
      a.verdict === "strong_yes" ? "#059669" :
      a.verdict === "maybe" ? "#b45309" :
      a.verdict === "no" ? "#b91c1c" : "#404040";
    const verdictLabel =
      a.verdict === "strong_yes" ? "STRONG YES" :
      a.verdict === "maybe" ? "MAYBE" :
      a.verdict === "no" ? "NO" : verdict;
    const summary = (a.verdict_summary || a.summary_for_cwo || a.additional_notes || "").slice(0, 320);
    const passReasons = Array.isArray(a.pass_reasons) ? (a.pass_reasons as string[]).slice(0, 3) : [];
    const failReasons = Array.isArray(a.fail_reasons) ? (a.fail_reasons as string[]).slice(0, 2) : [];
    assessBlock = `
      <div style="margin-top:10px;padding:10px;background:#f8fafc;border-left:3px solid ${verdictColor};font-size:11px">
        <div style="font-weight:700;color:${verdictColor};margin-bottom:4px;text-transform:uppercase;letter-spacing:0.4px;font-size:10px">
          Eval Kelly · ${escapeHtml(verdictLabel)}
        </div>
        ${summary ? `<div style="color:#404040;margin-bottom:6px">${escapeHtml(summary)}${summary.length >= 320 ? "…" : ""}</div>` : ""}
        ${a.english_real ? `<div style="color:#525252"><strong>Inglés:</strong> ${escapeHtml(a.english_real)}${a.english_verdict ? ` (${escapeHtml(a.english_verdict)})` : ""}</div>` : ""}
        ${passReasons.length ? `<div style="color:#059669;margin-top:4px"><strong>Fortalezas:</strong> ${passReasons.map(escapeHtml).join(" · ")}</div>` : ""}
        ${failReasons.length ? `<div style="color:#b91c1c;margin-top:2px"><strong>Reservas:</strong> ${failReasons.map(escapeHtml).join(" · ")}</div>` : ""}
      </div>
    `;
  }

  // Rejection block
  const rejectionReason = pickRejectionReason(c);
  const rejectionBlock = c.stage === "rechazado" && rejectionReason
    ? `<div style="margin-top:10px;padding:10px;background:#fef2f2;border-left:3px solid #b91c1c;font-size:11px">
        <div style="font-weight:700;color:#b91c1c;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.4px;font-size:10px">
          Razón de rechazo
        </div>
        <div style="color:#404040">${escapeHtml(rejectionReason)}</div>
      </div>`
    : "";

  return `
    <div style="border:1px solid #e8e8e8;padding:16px;margin-bottom:14px;background:white">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div style="flex:1">
          <div style="font-size:11px;color:#737373;font-weight:600">#${idx + 1}</div>
          <div style="font-weight:700;font-size:15px;color:#0a0a0a;margin-top:2px">${escapeHtml(c.name || "—")}</div>
          ${currentRole ? `<div style="font-size:12px;color:#525252;margin-top:2px;font-style:italic">${escapeHtml(currentRole)}</div>` : ""}
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:#737373;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Prefilter</div>
          <div style="font-weight:700;font-size:14px;color:#0a0a0a">${prefScore}</div>
        </div>
      </div>

      <div style="margin-top:10px;font-size:12px;color:#404040">
        ${c.email ? `<div>📧 <a href="mailto:${escapeHtml(c.email)}" style="color:#2563eb;text-decoration:none">${escapeHtml(c.email)}</a></div>` : ""}
        ${c.phone ? `<div style="margin-top:2px">📱 ${escapeHtml(c.phone)}</div>` : ""}
        ${cedula ? `<div style="margin-top:2px;font-size:11px;color:#737373">CC: ${escapeHtml(cedula)}</div>` : ""}
        <div style="margin-top:2px;font-size:11px;color:#737373">Aplicó: ${applied}</div>
      </div>

      ${(linkedinHref || cvHref) ? `
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          ${linkedinHref ? `<a href="${escapeHtml(linkedinHref)}" target="_blank" style="display:inline-block;padding:5px 10px;background:#0a66c2;color:white;text-decoration:none;font-size:11px;font-weight:600">LinkedIn ↗</a>` : ""}
          ${cvHref ? `<a href="${escapeHtml(cvHref)}" target="_blank" style="display:inline-block;padding:5px 10px;background:#0a0a0a;color:white;text-decoration:none;font-size:11px;font-weight:600">CV ↗</a>` : ""}
        </div>
      ` : ""}

      ${prefNotes ? `
        <div style="margin-top:10px;font-size:11px;color:#525252;font-style:italic;line-height:1.5">
          <strong style="font-style:normal;text-transform:uppercase;font-size:10px;color:#737373;letter-spacing:0.4px">Notas prefilter:</strong>
          ${escapeHtml(prefNotes).slice(0, 280)}${prefNotes.length > 280 ? "…" : ""}
        </div>
      ` : ""}

      ${assessBlock}
      ${rejectionBlock}
    </div>
  `;
}

function buildEmailHtml(
  groups: Array<{ vacancyTitle: string; byStage: Record<string, { cands: Cand[]; assessments: Map<string, Assessment> }> }>,
  totalCount: number,
  appByEmail: Map<string, AppRow>,
): string {
  const vacancySections = groups.map(g => {
    const stageSections = Object.entries(g.byStage)
      .filter(([, payload]) => payload.cands.length > 0)
      .map(([stage, payload]) => {
        const cardsHtml = payload.cands
          .map((c, i) => renderCandidateCard(
            c,
            payload.assessments.get(c.id) || null,
            i,
            c.email ? appByEmail.get(c.email.toLowerCase().trim()) : undefined,
          ))
          .join("");
        const stageColor = stage === "rechazado" ? "#b91c1c" : "#0a0a0a";
        return `
          <div style="margin-top:24px">
            <div style="font-size:12px;font-weight:700;color:${stageColor};text-transform:uppercase;letter-spacing:0.5px;padding-bottom:6px;border-bottom:2px solid ${stageColor};margin-bottom:12px">
              ${escapeHtml(STAGE_HUMAN_LABELS[stage] || stage)} · ${payload.cands.length} candidato${payload.cands.length !== 1 ? "s" : ""}
            </div>
            ${cardsHtml}
          </div>
        `;
      })
      .join("");

    return `
      <div style="margin-top:32px;padding:20px;background:#fafafa;border:1px solid #d4d4d4">
        <div style="font-size:11px;color:#737373;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:4px">Vacante</div>
        <h2 style="font-size:24px;margin:0 0 4px;font-weight:800;color:#0a0a0a">${escapeHtml(g.vacancyTitle)}</h2>
        ${stageSections || `<div style="margin-top:12px;font-size:13px;color:#737373;font-style:italic">No hay candidatos pendientes ni rechazados con info de revisión.</div>`}
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:'Open Sauce Sans',-apple-system,sans-serif;color:#0a0a0a;line-height:1.6">
  <div style="max-width:820px;margin:0 auto;padding:32px 16px">
    <div style="background:white;padding:32px;border:1px solid #e8e8e8">

      <p style="font-size:11px;color:#737373;letter-spacing:0.6px;text-transform:uppercase;margin:0 0 6px">Handoff Pipeline · Trading Solutions</p>
      <h2 style="font-size:22px;margin:4px 0 12px;font-weight:700">${totalCount} candidatos · revisiones de Kelly incluidas</h2>

      <p style="font-size:14px;margin:0 0 16px">Hola Yohanna,</p>
      <p style="font-size:14px;margin:0 0 16px">
        Te paso el handoff completo de los candidatos pendientes y revisados de las vacantes
        que sigo viendo. Incluí <strong>las revisiones que ya hice</strong> (verdict + notas) y
        también los candidatos que <strong>rechacé con la razón</strong>, para que tengas el
        contexto completo cuando decidas cómo seguir.
      </p>
      <p style="font-size:14px;margin:0 0 16px">
        Por cada vacante, agrupé los candidatos por etapa actual. Vos decidís a quién entrevistar,
        con quién y cuándo. <strong>Aún quedan más candidatos por revisar que están esperando respuesta</strong> ·
        en la cola de prefilter podés priorizar quién avanza.
      </p>

      <div style="margin:24px 0;padding:18px;background:#f8fafc;border-left:4px solid #0a0a0a">
        <div style="font-size:11px;color:#737373;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:8px;font-weight:600">
          Flujo recomendado para estos candidatos
        </div>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:#0a0a0a;line-height:1.8">
          <li><strong>Entrevista Wellness</strong> · primera conversación · valida match cultural + 16 mandatos básicos (~45 min)</li>
          <li><strong>Entrevista Hiring Lead + Prueba Técnica</strong> · validación técnica del rol con quien va a liderar la posición</li>
          <li><strong>Entrevista CWO + Hiring Manager</strong> · cierre con dueños del rol · validan ajuste estratégico</li>
          <li><strong>Pruebas Psicométricas</strong> · Mary Banquez aplica batería completa (DISC, MBTI, Big5, IQ, Turing si aplica)</li>
          <li><strong>Terna</strong> · selección final entre quienes pasaron todo</li>
        </ol>
        <div style="font-size:12px;color:#525252;margin-top:10px;font-style:italic">
          Como yo salgo, vos decidís quién entrevista en cada paso · pero te recomiendo mantener este orden de filtros.
        </div>
      </div>

      ${vacancySections}

      <p style="margin-top:28px;font-size:14px">
        Cualquier duda sobre alguno puntual, escríbeme.
      </p>

      <p style="margin-top:18px;font-size:14px">
        Un abrazo,<br><strong>Kelly</strong>
      </p>

      <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e8e8e8;font-size:11px;color:#737373;line-height:1.5">
        Generado automáticamente desde el ATS · ${new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}<br>
        Acceso al ATS: <a href="${APP_URL}/hr-admin" style="color:#525252">${APP_URL.replace("https://", "")}/hr-admin</a>
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
    const vacancyIdsParam: string[] | null = Array.isArray(body.vacancy_ids) && body.vacancy_ids.length > 0
      ? body.vacancy_ids
      : (body.vacancy_id ? [body.vacancy_id] : null);
    const stagesParam: string[] = Array.isArray(body.stages) && body.stages.length > 0
      ? body.stages
      : (typeof body.stage === "string" ? [body.stage] : DEFAULT_STAGES_ACTIVE);
    const includeRejected: boolean = body.include_rejected !== false; // default true
    const toEmail: string = body.to || YOHANNA_EMAIL;

    const allStages = includeRejected ? [...new Set([...stagesParam, "rechazado"])] : stagesParam;

    // 1. Si no pasaron vacancy_ids, traer activas
    let activeVacancyIds: string[] = [];
    if (!vacancyIdsParam) {
      try {
        const { data: vacs } = await supabaseAdmin
          .from("ht_vacancies")
          .select("id, title, active")
          .eq("active", true);
        activeVacancyIds = (vacs || []).map((v: { id: string }) => v.id);
      } catch (e) {
        console.warn("No se pudo cargar vacantes activas:", e);
      }
    }
    const finalVacancyIds = vacancyIdsParam || activeVacancyIds;

    // 2. Cargar candidatos
    let q = supabaseAdmin
      .from("ht_candidates")
      .select("*, ht_vacancies(title)")
      .in("stage", allStages)
      .order("created_at", { ascending: false });

    if (finalVacancyIds.length > 0) {
      q = q.in("vacancy_id", finalVacancyIds);
    }

    const { data, error } = await q;
    if (error) {
      console.error("Error cargando candidatos:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const cands = ((data || []) as unknown as Cand[]);
    const totalCount = cands.length;

    if (totalCount === 0) {
      return NextResponse.json({
        success: false,
        error: "No hay candidatos en las etapas/vacantes especificadas",
      }, { status: 400 });
    }

    // 3. Cargar assessments recruiter de todos los candidatos
    const assessmentMap = new Map<string, Assessment>();
    try {
      const candidateIds = cands.map(c => c.id);
      const { data: assessments } = await supabaseAdmin
        .from("ts_recruiter_assessments")
        .select("*")
        .in("candidate_id", candidateIds)
        .eq("assessment_stage", "recruiter_interview")
        .order("interview_date", { ascending: false });
      for (const a of (assessments || []) as Assessment[]) {
        if (!assessmentMap.has(a.candidate_id)) {
          assessmentMap.set(a.candidate_id, a);
        }
      }
    } catch (e) {
      console.warn("No se pudieron cargar recruiter assessments:", e);
    }

    // 3b. Cargar applications (Neon) por email · trae CV + LinkedIn del flujo público
    const appByEmail = new Map<string, AppRow>();
    try {
      const emails = Array.from(new Set(cands.map(c => (c.email || "").toLowerCase().trim()).filter(Boolean)));
      if (emails.length > 0) {
        const appRows = await sql`
          SELECT id, email, linkedin, cv_filename, why_ts, prefilter_data, score
          FROM applications
          WHERE LOWER(email) = ANY(${emails})
          ORDER BY created_at DESC
        ` as unknown as AppRow[];
        for (const a of appRows) {
          const k = (a.email || "").toLowerCase().trim();
          if (!appByEmail.has(k)) appByEmail.set(k, a);
        }
      }
    } catch (e) {
      console.warn("No se pudieron cargar applications de Neon:", e);
    }

    // 4. Agrupar por vacante y por etapa
    const groupsMap = new Map<string, { vacancyTitle: string; byStage: Record<string, { cands: Cand[]; assessments: Map<string, Assessment> }> }>();
    for (const c of cands) {
      const vacancyTitle = c.ht_vacancies?.title || "(sin vacante asignada)";
      const vacancyKey = c.vacancy_id || "no-vacancy";
      if (!groupsMap.has(vacancyKey)) {
        groupsMap.set(vacancyKey, { vacancyTitle, byStage: {} });
      }
      const group = groupsMap.get(vacancyKey)!;
      const stage = c.stage || "sin_etapa";
      if (!group.byStage[stage]) {
        group.byStage[stage] = { cands: [], assessments: new Map() };
      }
      group.byStage[stage].cands.push(c);
      const a = assessmentMap.get(c.id);
      if (a) group.byStage[stage].assessments.set(c.id, a);
    }

    // Stages ordenados por flujo natural
    const stageOrder = [
      "prefiltro_pasado", "prefiltro_revision",
      "recruiter_interview", "hiring_lead_interview", "cwo_interview",
      "bateria_psicometrica", "solicitud_enviada_mary",
      "touring", "terna", "oferta", "contratado", "rechazado",
    ];
    const sortedGroups = Array.from(groupsMap.values()).map(g => {
      const sortedByStage: Record<string, { cands: Cand[]; assessments: Map<string, Assessment> }> = {};
      for (const s of stageOrder) {
        if (g.byStage[s]) sortedByStage[s] = g.byStage[s];
      }
      // stages que no estén en el orden conocido al final
      for (const s of Object.keys(g.byStage)) {
        if (!sortedByStage[s]) sortedByStage[s] = g.byStage[s];
      }
      return { vacancyTitle: g.vacancyTitle, byStage: sortedByStage };
    }).sort((a, b) => a.vacancyTitle.localeCompare(b.vacancyTitle));

    // 5. Crear draft Gmail
    let draftId: string | null = null;
    try {
      const gmail = await isGmailConnected();
      if (!gmail.connected) {
        return NextResponse.json({ error: "Gmail no conectado" }, { status: 503 });
      }
      const html = buildEmailHtml(sortedGroups, totalCount, appByEmail);
      const vacancyTitles = sortedGroups.map(g => g.vacancyTitle).join(" + ");
      const draftRes = await createDraftViaGmail({
        to: toEmail,
        subject: `Handoff pipeline · ${totalCount} candidatos · ${vacancyTitles.slice(0, 80)}`,
        html,
        fromName: ATS_FROM_NAME,
        replyTo: "jointheteam@tradingsolutions.com",
      });
      if (draftRes.ok) draftId = draftRes.draft_id;
    } catch (e: any) {
      console.error("Yohanna handoff draft creation failed:", e);
      return NextResponse.json({ error: e?.message || "Error generando draft" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      vacancies_count: sortedGroups.length,
      candidates_count: totalCount,
      stages_included: allStages,
      draft_id: draftId,
      to: toEmail,
    });
  } catch (err: any) {
    console.error("export-pipeline-to-yohanna error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
