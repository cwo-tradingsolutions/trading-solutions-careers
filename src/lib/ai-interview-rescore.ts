import { fetchElevenConversation } from "./ai-interview-finalize";
import { aiInterviewEnabled } from "./ai-interview-flag";
import { readCronSecret } from "./cron-auth";
import { supabaseAdmin } from "./supabase";

export const RESCORE_BATCH_LIMIT = 3;
export const SCORING_MAX_ATTEMPTS = 5;
/** A bound conversation older than this is a retry, not the live call. */
export const STALE_CONVERSATION_MS = 2 * 60 * 60 * 1000;
const DEFAULT_CLAIM_TTL_MS = 2 * 60 * 1000;
const MIN_CLAIM_TTL_MS = 30_000;
const MAX_CLAIM_TTL_MS = 10 * 60_000;

/**
 * PostgREST v14.3 and earlier raises 42703 when a PATCH combines or() with
 * select(), and also returns an empty body when the filter columns are
 * added, because it reapplies or() to the updated row. Claims and the final
 * score write go through SQL functions instead.
 */

/** Integer decimal only. Anything else keeps the default and is logged. */
export function scoringClaimTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SCORING_CLAIM_TTL_MS;
  if (raw == null || raw.trim() === "") return DEFAULT_CLAIM_TTL_MS;
  const text = raw.trim();
  if (!/^[0-9]+$/.test(text)) {
    console.warn(`SCORING_CLAIM_TTL_MS is invalid: ${text}`);
    return DEFAULT_CLAIM_TTL_MS;
  }
  const parsed = Number(text);
  if (parsed < MIN_CLAIM_TTL_MS || parsed > MAX_CLAIM_TTL_MS) {
    console.warn(`SCORING_CLAIM_TTL_MS is invalid: ${text}`);
    return DEFAULT_CLAIM_TTL_MS;
  }
  return parsed;
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

/** True when a stored conversation must not be scored on a later visit. */
export function conversationIsStale(
  row: {
    conversation_id?: string | null;
    started_at?: string | null;
    scoring_attempts?: number | null;
  },
  now = Date.now(),
): boolean {
  if (!row.conversation_id) return false;
  if ((row.scoring_attempts ?? 0) >= SCORING_MAX_ATTEMPTS) return true;
  if (!row.started_at) return false;
  const started = new Date(row.started_at).getTime();
  return Number.isFinite(started) && now - started >= STALE_CONVERSATION_MS;
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

export type ScoringClaim = { claimedAt: string; attempts: number };

/**
 * Scores in-progress interviews, and completed ones that never received a score,
 * once ElevenLabs marks the conversation done. The claim lives on
 * scoring_claimed_at, not on ai_recommendation. status "failed" is the
 * existing value for a row that needs a person (the check does not allow
 * needs_review).
 */
async function releaseOwnClaim(id: string, claimedAt: string): Promise<void> {
  await supabaseAdmin
    .from("ht_ai_interviews")
    .update({ scoring_claimed_at: null })
    .eq("id", id)
    .eq("scoring_claimed_at", claimedAt);
}

async function markFailed(id: string, claimedAt: string): Promise<void> {
  await supabaseAdmin
    .from("ht_ai_interviews")
    .update({ status: "failed", scoring_claimed_at: null })
    .eq("id", id)
    .eq("scoring_claimed_at", claimedAt)
    .is("ai_score", null);
}

async function claimForScoring(row: {
  id: string;
  scoring_attempts?: number | null;
}): Promise<ScoringClaim | null> {
  const attempts = row.scoring_attempts ?? 0;
  if (attempts >= SCORING_MAX_ATTEMPTS) return null;
  const claimedAt = new Date().toISOString();
  const cutoff = new Date(Date.now() - scoringClaimTtlMs()).toISOString();
  const nextAttempts = attempts + 1;
  const { data, error } = await supabaseAdmin.rpc("claim_ht_ai_interview_scoring", {
    p_id: row.id,
    p_claimed_at: claimedAt,
    p_next_attempts: nextAttempts,
    p_cutoff: cutoff,
  });
  if (error) {
    console.warn("scoring claim failed", error.code || "error");
    return null;
  }
  if (!data) return null;
  return { claimedAt, attempts: nextAttempts };
}

export async function runInProgressRescore(input: {
  interviewIds?: string[] | null;
} = {}): Promise<{ pending: number; results: RescoreResult[]; disabled?: boolean }> {
  if (!aiInterviewEnabled()) {
    return { pending: 0, results: [], disabled: true };
  }

  const baseUrl = rescoreBaseUrl();
  if (!baseUrl) {
    console.warn("rescore skipped: APP_URL or NEXT_PUBLIC_APP_URL is missing or not https");
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
  const retire = () =>
    supabaseAdmin
      .from("ht_ai_interviews")
      .update({ status: "failed", scoring_claimed_at: null })
      .in("status", ["in_progress", "completed"])
      .is("ai_score", null)
      .gte("scoring_attempts", SCORING_MAX_ATTEMPTS);
  await retire().is("scoring_claimed_at", null);
  await retire().lt("scoring_claimed_at", cutoff);

  let query = supabaseAdmin
    .from("ht_ai_interviews")
    .select("id, token, conversation_id, status, ai_score, scoring_claimed_at, scoring_attempts, started_at")
    .in("status", ["in_progress", "completed"])
    .not("conversation_id", "is", null)
    .is("ai_score", null)
    .or(`and(or(scoring_claimed_at.is.null,scoring_claimed_at.lt.${cutoff}),or(scoring_attempts.is.null,scoring_attempts.lt.${SCORING_MAX_ATTEMPTS}))`)
    .order("started_at", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
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
    if (action === "skip") continue;

    const claim = await claimForScoring(interview);
    if (!claim) {
      results.push({ interview_id: interview.id, success: false, error_kind: "claimed" });
      continue;
    }

    if (action === "wait") {
      if (claim.attempts >= SCORING_MAX_ATTEMPTS) {
        await markFailed(interview.id, claim.claimedAt);
        results.push({ interview_id: interview.id, success: false, error_kind: "needs_manual" });
      } else {
        await releaseOwnClaim(interview.id, claim.claimedAt);
        results.push({ interview_id: interview.id, success: false, error_kind: "still_processing" });
      }
      continue;
    }

    const secret = readCronSecret();
    if (!secret) {
      await releaseOwnClaim(interview.id, claim.claimedAt);
      results.push({
        interview_id: interview.id,
        success: false,
        error: "CRON_SECRET is missing, too short, or not distinct",
        error_kind: "cron_secret",
      });
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
        await releaseOwnClaim(interview.id, claim.claimedAt);
        results.push({
          interview_id: interview.id,
          success: false,
          error: "CRON_SECRET was rejected",
          error_kind: "cron_secret",
          http_status: response.status,
        });
      } else if (body.status === "in_progress") {
        await releaseOwnClaim(interview.id, claim.claimedAt);
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
