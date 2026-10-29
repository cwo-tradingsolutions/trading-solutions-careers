/**
 * Recruiter Assessments · CRUD básico.
 *
 * GET  /api/admin/recruiter-assessments?candidate_id=X · devuelve la última eval
 *      del candidato (o null si no existe)
 * POST /api/admin/recruiter-assessments · crea/actualiza una evaluación
 *      Body: { candidate_id, mandate_scores, mandate_evidence, mandate_quotes,
 *              english_*, verdict, ..., parsed_by_ai, transcript_text }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const candidateId = url.searchParams.get("candidate_id");
  // stage opcional · si no viene, devuelve la última de cualquier stage (compat retro).
  // Si viene, filtra por ese stage (recruiter_interview, cwo_interview, etc).
  // Si "all", devuelve todas las evaluaciones del candidato.
  const stage = url.searchParams.get("stage");

  if (!candidateId) {
    return NextResponse.json({ error: "Falta candidate_id" }, { status: 400 });
  }

  // Modo "all" · útil para Compare view y CWO Handoff que necesita todas
  if (stage === "all") {
    const { data, error } = await supabaseAdmin
      .from("ts_recruiter_assessments")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("interview_date", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ assessments: data || [] });
  }

  let q = supabaseAdmin
    .from("ts_recruiter_assessments")
    .select("*")
    .eq("candidate_id", candidateId);

  if (stage) {
    q = q.eq("assessment_stage", stage);
  } else {
    // Default backwards-compat: la más reciente de cualquier stage
    // pero priorizamos recruiter_interview cuando no se especifica
    q = q.eq("assessment_stage", "recruiter_interview");
  }

  const { data, error } = await q
    .order("interview_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assessment: data });
}

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const candidateId = body.candidate_id;
    if (!candidateId) {
      return NextResponse.json({ error: "Falta candidate_id" }, { status: 400 });
    }

    const transcript = body.transcript_text || "";
    const transcriptHash = transcript ? crypto.createHash("sha256").update(transcript).digest("hex").slice(0, 16) : null;

    const payload: Record<string, unknown> = {
      candidate_id: candidateId,
      assessment_stage: body.assessment_stage || "recruiter_interview",
      interview_date: body.interview_date || new Date().toISOString(),
      interviewer_email: body.interviewer_email || "jointheteam@tradingsolutions.com",
      duration_minutes: body.duration_minutes || null,
      mandate_scores: body.mandate_scores || {},
      mandate_evidence: body.mandate_evidence || {},
      mandate_quotes: body.mandate_quotes || {},
      english_declared: body.english_declared || null,
      english_real: body.english_real || null,
      english_evidence: body.english_evidence || null,
      english_verdict: body.english_verdict || null,
      verdict: body.verdict || null,
      verdict_summary: body.verdict_summary || null,
      pass_reasons: body.pass_reasons || [],
      fail_reasons: body.fail_reasons || [],
      next_filter_probes: body.next_filter_probes || [],
      transcript_text: transcript || null,
      transcript_hash: transcriptHash,
      parsed_by_ai: !!body.parsed_by_ai,
      ai_model_version: body.ai_model_version || null,
      human_reviewed: !!body.human_reviewed,
      human_overrides: body.human_overrides || null,
      full_eval_doc_url: body.full_eval_doc_url || null,
      updated_at: new Date().toISOString(),
    };

    // Si ya existe una eval para este candidato (con mismo hash de transcript) → update
    // Si no, insert
    let assessmentId = body.id;
    if (assessmentId) {
      const { data, error } = await supabaseAdmin
        .from("ts_recruiter_assessments")
        .update(payload)
        .eq("id", assessmentId)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, assessment: data, action: "updated" });
    }

    const { data, error } = await supabaseAdmin
      .from("ts_recruiter_assessments")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, assessment: data, action: "created" });
  } catch (err: any) {
    console.error("recruiter-assessments POST error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
