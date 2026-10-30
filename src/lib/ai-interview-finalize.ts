/**
 * Candidate finalize for the AI interview.
 * The transcript always comes from ElevenLabs for a conversation this server
 * bound to the interview. A client transcript is ignored. A completed interview
 * is not scored again, and the candidate response never includes a score.
 */

export type InterviewBind = {
  id: string;
  token: string;
  status: string | null;
  agent_id: string | null;
  conversation_id: string | null;
};

export type ConversationDetail = {
  conversation_id: string;
  agent_id?: string | null;
  status?: string | null;
  start_time_unix_secs?: number | null;
  dynamic_variables?: Record<string, unknown> | null;
  transcript?: unknown;
};

export type PublicFinalizeStatus = "completed" | "needs_review" | "in_progress";

export function publicFinalizeBody(state: PublicFinalizeStatus): { status: PublicFinalizeStatus } {
  return { status: state };
}

export function dynamicVariables(detail: ConversationDetail): Record<string, string> {
  const raw = detail.dynamic_variables || {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** Exact agent id plus metadata that names this interview. No time window. */
export function conversationMatchesInterview(
  detail: ConversationDetail,
  interview: InterviewBind,
): boolean {
  if (!interview.agent_id) return false;
  if (!detail.agent_id || detail.agent_id !== interview.agent_id) return false;
  if (!detail.conversation_id) return false;
  const vars = dynamicVariables(detail);
  return vars.interview_token === interview.token;
}

/** A finished ElevenLabs transcript has spoken text. An empty or wrapper-only payload does not. */
export function transcriptHasContent(transcript: unknown): boolean {
  if (typeof transcript === "string") return transcript.trim().length > 0;
  if (Array.isArray(transcript)) {
    return transcript.some((turn) => {
      if (!turn || typeof turn !== "object") return false;
      const row = turn as { message?: unknown; text?: unknown; content?: unknown };
      const text = row.message ?? row.text ?? row.content ?? "";
      return String(text).trim().length > 0;
    });
  }
  if (transcript && typeof transcript === "object") {
    const inner = (transcript as { transcript?: unknown }).transcript;
    if (inner != null && inner !== transcript) return transcriptHasContent(inner);
  }
  return false;
}

export const FINALIZE_LOOKUP_WINDOW_MS = 2 * 60 * 1000;
export const FINALIZE_LOOKUP_MAX = 40;
const lookupHits = new Map<string, number[]>();

function sweepFinalizeLookups(now: number) {
  for (const [key, hits] of lookupHits) {
    const recent = hits.filter((at) => now - at < FINALIZE_LOOKUP_WINDOW_MS);
    if (recent.length === 0) lookupHits.delete(key);
    else lookupHits.set(key, recent);
  }
}

/** Caps ElevenLabs reads from public finalize and bind calls, including a stored conversation. */
export function allowFinalizeLookup(
  token: string,
  now = Date.now(),
  bucket: "candidate" | "server" = "candidate",
): boolean {
  sweepFinalizeLookups(now);
  const key = `${bucket}:${token}`;
  const recent = lookupHits.get(key) ?? [];
  if (recent.length >= FINALIZE_LOOKUP_MAX) return false;
  recent.push(now);
  lookupHits.set(key, recent);
  return true;
}

export function finalizeLookupHas(token: string, bucket: "candidate" | "server" = "candidate"): boolean {
  return lookupHits.has(`${bucket}:${token}`);
}

export function normalizeElevenConversation(raw: unknown): ConversationDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = row.conversation_id;
  if (typeof id !== "string" || !id) return null;
  const init = row.conversation_initiation_client_data;
  const initVars =
    init && typeof init === "object"
      ? (init as { dynamic_variables?: unknown }).dynamic_variables
      : undefined;
  const metadata = row.metadata;
  const metaVars =
    metadata && typeof metadata === "object"
      ? (metadata as { dynamic_variables?: unknown }).dynamic_variables
      : undefined;
  const vars = (row.dynamic_variables || initVars || metaVars) as Record<string, unknown> | null;
  const start =
    (metadata && typeof metadata === "object"
      ? (metadata as { start_time_unix_secs?: unknown }).start_time_unix_secs
      : undefined) ?? row.start_time_unix_secs;
  return {
    conversation_id: id,
    agent_id: typeof row.agent_id === "string" ? row.agent_id : null,
    status: typeof row.status === "string" ? row.status : null,
    start_time_unix_secs: typeof start === "number" ? start : null,
    dynamic_variables: vars && typeof vars === "object" ? vars : null,
    transcript: row.transcript ?? raw,
  };
}

function hintedConversationId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { conversation_id?: unknown }).conversation_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function readyToScore(detail: ConversationDetail | null): detail is ConversationDetail {
  return Boolean(detail && detail.status === "done" && transcriptHasContent(detail.transcript));
}

export async function runCandidateFinalize(input: {
  interview: InterviewBind;
  body: unknown;
  fetchConversation: (id: string) => Promise<ConversationDetail | null>;
  rememberConversation?: (conversationId: string) => Promise<void>;
  markManualReview: () => Promise<void>;
  scoreServerTranscript: (conversationId: string, transcript: unknown) => Promise<boolean>;
  /** Server rescore of a completed row that never received a score. */
  rescoreNullScore?: boolean;
  lookupBucket?: "candidate" | "server";
}): Promise<{ status: number; body: { status: PublicFinalizeStatus; rescored?: true } }> {
  if (input.interview.status === "completed" && !input.rescoreNullScore) {
    return { status: 200, body: publicFinalizeBody("completed") };
  }

  if (!allowFinalizeLookup(input.interview.token, Date.now(), input.lookupBucket ?? "candidate")) {
    return { status: 429, body: publicFinalizeBody("in_progress") };
  }

  let detail: ConversationDetail | null = null;
  const hinted = hintedConversationId(input.body);
  if (hinted) {
    const hintedDetail = await input.fetchConversation(hinted);
    if (hintedDetail && conversationMatchesInterview(hintedDetail, input.interview)) {
      detail = hintedDetail;
      if (hinted !== input.interview.conversation_id) {
        await input.rememberConversation?.(hinted);
      }
    }
  }
  if (!detail && input.interview.conversation_id) {
    detail = await input.fetchConversation(input.interview.conversation_id);
    if (detail?.agent_id && input.interview.agent_id && detail.agent_id !== input.interview.agent_id) {
      detail = null;
    }
  }

  if (!detail) {
    await input.markManualReview();
    return { status: 200, body: publicFinalizeBody("needs_review") };
  }

  if (!readyToScore(detail)) {
    return { status: 200, body: publicFinalizeBody("in_progress") };
  }

  const wrote = await input.scoreServerTranscript(detail.conversation_id, detail.transcript);
  if (wrote && input.lookupBucket === "server") {
    return { status: 200, body: { status: "completed", rescored: true } };
  }
  return { status: 200, body: publicFinalizeBody("completed") };
}

export async function fetchElevenConversation(
  id: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ConversationDetail | null> {
  const response = await fetchImpl(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(id)}`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!response.ok) return null;
  return normalizeElevenConversation(await response.json());
}
