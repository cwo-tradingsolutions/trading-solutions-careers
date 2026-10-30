import { fetchElevenConversation } from "./ai-interview-finalize";
import { aiInterviewEnabled } from "./ai-interview-flag";
import { supabaseAdmin } from "./supabase";

export const RESCORE_BATCH_LIMIT = 3;
const CLAIM_PREFIX = "SCORING:";
const CLAIM_STALE_MS = 15 * 60 * 1000;

export function rescoreBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.APP_URL || env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app").trim();
  if (!/^https?:\/\//i.test(raw)) return "https://trading-solutions-careers.vercel.app";
  return raw.replace(/\/$/, "");
}

export function rescoreAction(
  row: { status: string; conversation_id: string | null; ai_score: number | null },
  elevenStatus: string | null,
): "score" | "wait" | "skip" {
  if (!row.conversation_id || row.ai_score != null) return "skip";
  if (row.status !== "in_progress" && row.status !== "completed") return "skip";
  if (elevenStatus === "done") return "score";
  return "wait";
}

export function validConversationId(id: string): boolean {
  return /^conv_[A-Za-z0-9]{10,64}$/.test(id);
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
async function claimForScoring(id: string): Promise<boolean> {
  const stamp = `${CLAIM_PREFIX}${Date.now()}`;
  const fresh = await supabaseAdmin
    .from("ht_ai_interviews")
    .update({ ai_recommendation: stamp })
    .eq("id", id)
    .is("ai_score", null)
    .or("ai_recommendation.is.null,ai_recommendation.not.like.SCORING:%")
    .select("id");
  if ((fresh.data?.length ?? 0) > 0) return true;

  const held = await supabaseAdmin
    .from("ht_ai_interviews")
    .select("ai_recommendation")
    .eq("id", id)
    .is("ai_score", null)
    .like("ai_recommendation", "SCORING:%")
    .maybeSingle();
  const claimedAt = Number(String(held.data?.ai_recommendation ?? "").slice(CLAIM_PREFIX.length));
  if (!Number.isFinite(claimedAt) || Date.now() - claimedAt < CLAIM_STALE_MS) return false;
  const reclaimed = await supabaseAdmin
    .from("ht_ai_interviews")
    .update({ ai_recommendation: stamp })
    .eq("id", id)
    .eq("ai_recommendation", held.data?.ai_recommendation)
    .is("ai_score", null)
    .select("id");
  return (reclaimed.data?.length ?? 0) > 0;
}

export async function runInProgressRescore(input: {
  interviewIds?: string[] | null;
  cronSecret?: string | null;
} = {}): Promise<{ pending: number; results: RescoreResult[]; disabled?: boolean }> {
  if (!aiInterviewEnabled()) {
    return { pending: 0, results: [], disabled: true };
  }

  let query = supabaseAdmin
    .from("ht_ai_interviews")
    .select("id, token, conversation_id, status, ai_score")
    .in("status", ["in_progress", "completed"])
    .not("conversation_id", "is", null)
    .is("ai_score", null)
    .limit(RESCORE_BATCH_LIMIT);

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
    const claimed = await claimForScoring(interview.id);
    if (!claimed) {
      results.push({ interview_id: interview.id, success: false, error_kind: "claimed" });
      continue;
    }

    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 90_000);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-ats-rescore": "1",
      };
      const secret = (input.cronSecret ?? "").trim();
      if (secret) headers["x-cron-secret"] = secret;
      const response = await fetch(`${rescoreBaseUrl()}/api/headhunting/ai-interview/${interview.token}/finalize`, {
        method: "POST",
        headers,
        body: JSON.stringify({ conversation_id: interview.conversation_id }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timeoutId));
      const body = await response.json().catch(() => ({}));
      if (body.rescored === true) {
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
