/**
 * GET  /api/decision/[token]  → estado de la decisión (para que la página sepa si ya respondieron)
 * POST /api/decision/[token]  → registra decisión + auto-actualiza stage del candidato
 *
 * Endpoint público (sin auth) — el token es la credencial.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { recordStageEvent } from "@/lib/stage-events";
import { isPreviewTestMode, previewTestJson } from "@/lib/preview-mode";
import { validarRechazo } from "@/lib/rejection-rules";
import { normalizeStage } from "@/lib/stage-labels";
import { publicStepBody } from "@/lib/candidate-public-error";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

/**
 * Destinos que el Hiring Lead puede elegir desde la página pública.
 * Solo codes v4: `cwo_interview` y `touring` quedaron muertos y `touring`
 * además normaliza a `pruebas`, así que aceptarlo mandaba al candidato a la
 * batería psicotécnica en vez de a la etapa que el líder quiso.
 */
const DECISION_TARGET_STAGES = [
  'recruiter_interview',
  'prueba_tecnica',
  'terna',
  'oferta',
  'contratado',
];

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  const { data, error } = await supabaseAdmin
    .from("ts_interview_decisions")
    .select("id, candidate_id, vacancy_id, interview_type, recipient_role, recipient_name, sent_at, expires_at, responded_at, decision, decision_to_stage, reasoning, recommended_vacancy_id, recommended_vacancy_text")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("decision GET", error);
    return NextResponse.json(publicStepBody(), { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: "Esta decisión ya expiró" }, { status: 410 });
  }

  // Get candidate + vacancy info
  const { data: cand } = await supabaseAdmin
    .from("ht_candidates")
    .select("id, name, current_job_role, current_company, headline, stage")
    .eq("id", data.candidate_id)
    .maybeSingle();

  const { data: vac } = data.vacancy_id
    ? await supabaseAdmin.from("ht_vacancies").select("id, title, area").eq("id", data.vacancy_id).maybeSingle()
    : { data: null };

  // AI summary si existe
  const { data: ai } = await supabaseAdmin
    .from("ht_ai_interviews")
    .select("ai_summary, ai_score, ai_recommendation, overall_score")
    .eq("candidate_id", data.candidate_id)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // List of all open vacancies for the "recomendar otra" dropdown
  const { data: openVacs } = await supabaseAdmin
    .from("ht_vacancies")
    .select("id, title, area")
    .eq("client_id", TS_CLIENT_ID);

  return NextResponse.json({
    decision_id: data.id,
    already_responded: !!data.responded_at,
    decision: data.decision,
    interview_type: data.interview_type,
    recipient_role: data.recipient_role,
    recipient_name: data.recipient_name,
    sent_at: data.sent_at,
    candidate: cand ? {
      name: cand.name,
      current_role: cand.current_job_role,
      current_company: cand.current_company,
      headline: cand.headline,
      stage: cand.stage,
    } : null,
    vacancy: vac ? { id: vac.id, title: vac.title, area: vac.area } : null,
    ai_insights: ai ? {
      summary: ai.ai_summary,
      score: ai.ai_score ?? ai.overall_score,
      recommendation: ai.ai_recommendation,
    } : null,
    open_vacancies: (openVacs || []).map(v => ({ id: v.id, title: v.title, area: v.area })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    const body = await req.json();

    const { data: existing } = await supabaseAdmin
      .from("ts_interview_decisions")
      .select("id, candidate_id, vacancy_id, responded_at, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: "Token inválido" }, { status: 404 });
    if (existing.responded_at) {
      return NextResponse.json({ error: "Esta decisión ya fue registrada" }, { status: 409 });
    }
    if (existing.expires_at && new Date(existing.expires_at) < new Date()) {
      return NextResponse.json({ error: "Esta decisión expiró" }, { status: 410 });
    }

    // Validate decision
    const validDecisions = ['avanza','no_avanza','needs_more_info','recommend_other_vacancy'];
    if (!validDecisions.includes(body.decision)) {
      return NextResponse.json({ error: "Decisión inválida" }, { status: 400 });
    }

    if (isPreviewTestMode()) {
      return previewTestJson("POST /api/decision/[token]");
    }

    const updates: any = {
      responded_at: new Date().toISOString(),
      decision: body.decision,
      reasoning: body.reasoning ? String(body.reasoning).slice(0, 2000) : null,
    };

    if (body.decision === 'avanza') {
      updates.decision_to_stage = body.target_stage || null;
    }
    if (body.decision === 'recommend_other_vacancy') {
      updates.recommended_vacancy_id = body.recommended_vacancy_id || null;
      updates.recommended_vacancy_text = body.recommended_vacancy_text ? String(body.recommended_vacancy_text).slice(0, 500) : null;
    }

    // Etapa previa · se lee antes de escribir para poder registrar el evento.
    const { data: candBefore } = await supabaseAdmin
      .from("ht_candidates")
      .select("stage, vacancy_id")
      .eq("id", existing.candidate_id)
      .maybeSingle();
    const fromStage = candBefore?.stage ?? null;

    // Auto-apply stage transition si avanza con stage definido
    let stageUpdated = false;
    if (body.decision === 'avanza' && body.target_stage) {
      if (DECISION_TARGET_STAGES.includes(body.target_stage)) {
        await supabaseAdmin
          .from("ht_candidates")
          .update({ stage: body.target_stage, updated_at: new Date().toISOString() })
          .eq("id", existing.candidate_id);
        stageUpdated = true;
        // La decisión del Hiring Lead mueve la etapa sin pasar por el endpoint
        // de stage: sin el evento el dashboard no ve el avance.
        await recordStageEvent({
          candidateId: existing.candidate_id,
          fromStage,
          toStage: body.target_stage,
          vacancyId: existing.vacancy_id ?? candBefore?.vacancy_id ?? null,
          source: "system",
          note: "decisión del Hiring Lead",
        });
      }
    } else if (body.decision === 'no_avanza') {
      const rechazo = validarRechazo({
        category_key: body.category_key,
        note: body.reasoning,
      });
      if (!rechazo.ok) {
        return NextResponse.json({ error: rechazo.error }, { status: 400 });
      }
      await supabaseAdmin
        .from("ht_candidates")
        .update({
          stage: 'rechazado',
          status: 'rejected',
          rejection_category: rechazo.category_key,
          rejection_note_private: rechazo.note,
          rejected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.candidate_id);
      stageUpdated = true;
      await recordStageEvent({
        candidateId: existing.candidate_id,
        fromStage,
        toStage: 'rechazado',
        vacancyId: existing.vacancy_id ?? candBefore?.vacancy_id ?? null,
        source: "system",
        note: "decisión del Hiring Lead · no avanza",
      });
    } else if (body.decision === 'recommend_other_vacancy' && body.recommended_vacancy_id && body.move_now) {
      // Mover candidato a la otra vacante en stage aplico (o el que indique target_stage)
      const movedToStage = body.target_stage || 'aplico';
      if (normalizeStage(movedToStage) === 'rechazado') {
        return NextResponse.json(
          { error: "Para rechazar hay que elegir «No avanza» e indicar la categoría." },
          { status: 400 },
        );
      }
      await supabaseAdmin
        .from("ht_candidates")
        .update({
          vacancy_id: body.recommended_vacancy_id,
          stage: movedToStage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.candidate_id);
      stageUpdated = true;
      // El evento va contra la vacante NUEVA · es donde el candidato empieza a
      // contar días.
      await recordStageEvent({
        candidateId: existing.candidate_id,
        fromStage,
        toStage: movedToStage,
        vacancyId: body.recommended_vacancy_id,
        source: "system",
        note: "recomendado para otra vacante",
      });
    }
    updates.stage_auto_updated = stageUpdated;

    const { error: upErr } = await supabaseAdmin
      .from("ts_interview_decisions")
      .update(updates)
      .eq("id", existing.id);

    if (upErr) {
      console.error("decision POST update", upErr);
      return NextResponse.json(publicStepBody(), { status: 500 });
    }

    return NextResponse.json({
      success: true,
      stage_auto_updated: stageUpdated,
    });
  } catch (err: any) {
    console.error('decision POST error:', err);
    return NextResponse.json(publicStepBody(), { status: 500 });
  }
}
