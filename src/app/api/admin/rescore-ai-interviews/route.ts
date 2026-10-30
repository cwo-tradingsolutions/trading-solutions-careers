/**
 * POST /api/admin/rescore-ai-interviews
 *
 * Scores in-progress interviews, and completed ones that never received a score,
 * once ElevenLabs marks the conversation done. Off unless AI_INTERVIEW_ENABLED.
 *
 * Body opcional: { interview_ids?: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { aiInterviewEnabled } from "@/lib/ai-interview-flag";
import { runInProgressRescore } from "@/lib/ai-interview-rescore";

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  if (!aiInterviewEnabled()) {
    return NextResponse.json({ status: "disabled" }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const interviewIds: string[] | null = Array.isArray(body.interview_ids) ? body.interview_ids : null;
    const { pending, results, disabled } = await runInProgressRescore({ interviewIds });
    if (disabled) {
      return NextResponse.json({ status: "disabled" }, { status: 503 });
    }

    if (pending === 0) {
      return NextResponse.json({
        success: true,
        message: "Sin entrevistas en curso listas para puntuar",
        rescored: 0,
      });
    }

    return NextResponse.json({
      success: true,
      rescored: results.filter((row) => row.success).length,
      failed: results.filter((row) => !row.success).length,
      total: pending,
      results,
    });
  } catch (err) {
    console.error("rescore-ai-interviews error");
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { data: pending } = await supabaseAdmin
    .from("ht_ai_interviews")
    .select("id, conversation_id, status, candidate:ht_candidates(name)")
    .in("status", ["in_progress", "completed"])
    .not("conversation_id", "is", null)
    .is("ai_score", null);

  return NextResponse.json({
    pending_count: pending?.length || 0,
    pending: (pending || []).map((row) => ({
      interview_id: row.id,
      status: row.status,
      candidate_name: (row as { candidate?: { name?: string } }).candidate?.name,
    })),
  });
}
