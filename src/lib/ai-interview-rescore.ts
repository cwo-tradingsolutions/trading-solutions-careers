import { fetchElevenConversation } from "./ai-interview-finalize";
import { aiInterviewEnabled } from "./ai-interview-flag";
import { readCronSecret } from "./cron-auth";
import { supabaseAdmin } from "./supabase";

export const RESCORE_BATCH_LIMIT = 3;
export const SCORING_MAX_ATTEMPTS = 5;
const DEFAULT_CLAIM_TTL_MS = 2 * 60 * 1000;

export function scoringClaimTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.SCORING_CLAIM_TTL_MS);
  if (Number.isFinite(raw) && raw >= 30_000 && raw <= 10 * 60_000) return raw;
  return DEFAULT_CLAIM_TTL_MS;
}

/** Null when the URL is missing or not https. Never falls back to a public host. */
export function rescoreBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.APP_URL || env.NEXT_PUBLIC_APP_URL || "").trim();
  if (!raw.startsWith("https://")) return null;
  return raw.replace(/\/$/, "");
}

export function rescoreRowEligible(
  row: { scoring_claimed_at?: string | null; scoring_attempts?: number | null },
  now = Date.now(),
  ttl = scoringClaimTtlMs(),
): "eligible" | "claimed" | "exhausted" {
  const attempts = row.scoring_attempts ?? 0;
  if (attempts >= SCORING_MAX_ATTEMPTS) return "exhausted";
  if (row.scoring_claimed_at) {
    const at = new Date(row.scoring_claimed_at).getTime();
    if (Number.isFinite(at) && now - at < ttl) return "claimed";
  }
  return "eligible";
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
 * Scores in-progress interviews, and completed ones that never received a score,
 * once ElevenLabs marks the conversation done. The claim lives on
 * scoring_claimed_at, not on ai_recommendation.
 */
async function releaseClaim(id: string): Promise<void> {
  await supabaseAdmin
    .from("ht_ai_interviews")
    .update({ scoring_claimed_at: null })
    .eq("id", id);
}

async function markNeedsManual(id: string): Promise<void> {
  await supabaseAdmin
    .from("ht_ai_interviews")
    .update({ status: "needs_review", scoring_claimed_at: null })
    .eq("id", id)
    .is("ai_score", null);
}

async function claimForScoring(row: {
  id: string;
  scoring_attempts?: number | null;
  scoring_claimed_at?: string | null;
}): Promise<boolean> {
  const attempts = row.scoring_attempts ?? 0;
  if (attempts >= SCORING_MAX_ATTEMPTS) {
    await markNeedsManual(row.id);
    return false;
  }
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - scoringClaimTtlMs()).toISOString();
  const attemptFilter = attempts === 0
    ? "scoring_attempts.is.null,scoring_attempts.eq.0"
    : `scoring_attempts.eq.${attempts}`;
  const { data } = await supabaseAdmin
    .from("ht_ai_interviews")
    .update({
      scoring_claimed_at: now,
      scoring_attempts: attempts + 1,
    })
    .eq("id", row.id)
    .is("ai_score", null)
    .or(`and(or(scoring_claimed_at.is.null,scoring_claimed_at.lt.${cutoff}),or(${attemptFilter}))`)
    .select("id");
  return (data?.length ?? 0) > 0;
}

export async function runInProgressRescore(input: {
  interviewIds?: string[] | null;
} = {}): Promise<{ pending: number; results: RescoreResult[]; disabled?: boolean }> {
  if (!aiInterviewEnabled()) {
    return { pending: 0, results: [], disabled: true };
  }

  const baseUrl = rescoreBaseUrl();
  if (!baseUrl) {
    return {
      pending: 0,
      results: [{
        interview_id: "",
        success: false,
        error: "APP_URL or NEXT_PUBLIC_APP_URL must be https",
        error_kind: "bad_base_url",
      }],
    };
  }

  const cutoff = new Date(Date.now() - scoringClaimTtlMs()).toISOString();
  await supabaseAdmin
    .from("ht_ai_interviews")
    .update({ status: "needs_review", scoring_claimed_at: null })
    .in("status", ["in_progress", "completed"])
    .is("ai_score", null)
    .gte("scoring_attempts", SCORING_MAX_ATTEMPTS)
    .or(`scoring_claimed_at.is.null,scoring_claimed_at.lt.${cutoff}`);

  let query = supabaseAdmin
    .from("ht_ai_interviews")
    .select("id, token, conversation_id, status, ai_score, scoring_claimed_at, scoring_attempts, started_at")
    .in("status", ["in_progress", "completed"])
    .not("conversation_id", "is", null)
    .is("ai_score", null)
    .or(`and(or(scoring_claimed_at.is.null,scoring_claimed_at.lt.${cutoff}),or(scoring_attempts.is.null,scoring_attempts.lt.${SCORING_MAX_ATTEMPTS}))`)
    .order("started_at", { ascending: true, nullsFirst: false })
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
    const gate = rescoreRowEligible(interview);
    if (gate === "exhausted") {
      await markNeedsManual(interview.id);
      results.push({ interview_id: interview.id, success: false, error_kind: "needs_manual" });
      continue;
    }
    if (gate === "claimed") {
      results.push({ interview_id: interview.id, success: false, error_kind: "claimed" });
      continue;
    }
    const secret = readCronSecret();
    if (!secret) {
      if (interview.status === "completed") await releaseClaim(interview.id);
      results.push({
        interview_id: interview.id,
        success: false,
        error: "CRON_SECRET is missing, too short, or not distinct",
        error_kind: "cron_secret",
      });
      continue;
    }
    const claimed = await claimForScoring(interview);
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
        "x-cron-secret": secret,
      };
      const response = await fetch(`${baseUrl}/api/headhunting/ai-interview/${interview.token}/finalize`, {
        method: "POST",
        headers,
        body: JSON.stringify({ conversation_id: interview.conversation_id }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timeoutId));
      const body = await response.json().catch(() => ({}));
      if (body.rescored === true) {
        results.push({ interview_id: interview.id, success: true });
      } else if (response.status === 401 || response.status === 403) {
        await releaseClaim(interview.id);
        results.push({
          interview_id: interview.id,
          success: false,
          error: "CRON_SECRET was rejected",
          error_kind: "cron_secret",
          http_status: response.status,
        });
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
