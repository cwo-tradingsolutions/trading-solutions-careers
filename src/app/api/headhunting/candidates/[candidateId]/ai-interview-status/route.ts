/**
 * GET /api/headhunting/candidates/[candidateId]/ai-interview-status
 *
 * Devuelve el estado de la entrevista IA más reciente del candidato,
 * usado por el panel del Funnel para mostrar score + recomendación.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { visibleRecommendation } from "@/lib/ai-recommendation";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { candidateId } = params;
  const { data, error } = await supabaseAdmin
    .from("ht_ai_interviews")
    .select("id, token, token_expires_at, status, started_at, completed_at, conversation_id, audio_url, ai_score, overall_score, competency_score, english_score, ai_recommendation, ai_summary, ai_strengths, ai_gaps, ai_red_flags, english_level, english_detail, competencies_scores, recruiter_draft_id")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    interview: data
      ? { ...data, ai_recommendation: visibleRecommendation(data.ai_recommendation) }
      : null,
  });
}
