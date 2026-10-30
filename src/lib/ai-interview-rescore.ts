import { fetchElevenConversation } from "./ai-interview-finalize";
import { supabaseAdmin } from "./supabase";

export function rescoreAction(
  row: { status: string; conversation_id: string | null; ai_score: number | null },
  elevenStatus: string | null,
): "score" | "wait" | "skip" {
  if (!row.conversation_id || row.ai_score != null) return "skip";
  if (row.status !== "in_progress") return "skip";
  if (elevenStatus === "done") return "score";
  return "wait";
}

export type RescoreResult = {
  interview_id: string;
  success: boolean;
  error?: string;
  error_kind?: string;
  http_status?: number;
};

/**
 * Scores in-progress interviews once ElevenLabs marks the conversation done.
 * Completed interviews stay idempotent and are not sent through finalize again.
 */
export async function runInProgressRescore(input: {
  baseUrl: string;
  interviewIds?: string[] | null;
}): Promise<{ pending: number; results: RescoreResult[] }> {
  let query = supabaseAdmin
    .from("ht_ai_interviews")
    .select("id, token, conversation_id, status, ai_score")
    .eq("status", "in_progress")
    .not("conversation_id", "is", null)
    .is("ai_score", null);

  if (input.interviewIds && input.interviewIds.length > 0) {
    query = query.in("id", input.interviewIds);
  }

  const { data: pending, error } = await query;
  if (error) throw new Error(error.message);

  const rows = pending || [];
  const apiKey = process.env.ELEVENLABS_API_KEY || "";
  const results: RescoreResult[] = [];

  for (const interview of rows) {
    const detail = apiKey && interview.conversation_id
      ? await fetchElevenConversation(interview.conversation_id, apiKey)
      : null;
    const action = rescoreAction(
      {
        status: interview.status,
        conversation_id: interview.conversation_id,
        ai_score: interview.ai_score,
      },
      detail?.status ?? null,
    );
    if (action === "wait") {
      results.push({
        interview_id: interview.id,
        success: false,
        error_kind: "still_processing",
      });
      continue;
    }
    if (action !== "score") continue;

    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 90_000);
      const response = await fetch(`${input.baseUrl}/api/headhunting/ai-interview/${interview.token}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: interview.conversation_id }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timeoutId));
      const body = await response.json().catch(() => ({}));
      if (body.status === "completed") {
        results.push({ interview_id: interview.id, success: true });
      } else if (body.status === "in_progress") {
        results.push({
          interview_id: interview.id,
          success: false,
          error_kind: "still_processing",
          http_status: response.status,
        });
      } else {
        results.push({
          interview_id: interview.id,
          success: false,
          error: body.error || `HTTP ${response.status}`,
          error_kind: "scoring_failed",
          http_status: response.status,
        });
      }
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      results.push({
        interview_id: interview.id,
        success: false,
        error: aborted ? "Timeout" : "scoring_failed",
        error_kind: aborted ? "timeout" : "exception",
      });
    }
  }

  return { pending: rows.length, results };
}
