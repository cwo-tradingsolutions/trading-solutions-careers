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

const LOOKUP_WINDOW_MS = 60_000;
const LOOKUP_MAX = 8;
const lookupHits = new Map<string, number[]>();

/** Caps unbound ElevenLabs reads from the public finalize POST. */
export function allowFinalizeLookup(token: string, now = Date.now()): boolean {
  const recent = (lookupHits.get(token) ?? []).filter((at) => now - at < LOOKUP_WINDOW_MS);
  if (recent.length >= LOOKUP_MAX) {
    lookupHits.set(token, recent);
    return false;
  }
  recent.push(now);
  lookupHits.set(token, recent);
  return true;
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

async function resolveUnboundConversation(
  interview: InterviewBind,
  body: unknown,
  fetchConversation: (id: string) => Promise<ConversationDetail | null>,
): Promise<ConversationDetail | null> {
  const hinted = hintedConversationId(body);
  if (!hinted) return null;
  const detail = await fetchConversation(hinted);
  if (detail && conversationMatchesInterview(detail, interview)) return detail;
  return null;
}

function readyToScore(detail: ConversationDetail | null): detail is ConversationDetail {
  return Boolean(detail && detail.status === "done" && transcriptHasContent(detail.transcript));
}

export async function runCandidateFinalize(input: {
  interview: InterviewBind;
  body: unknown;
  fetchConversation: (id: string) => Promise<ConversationDetail | null>;
  markManualReview: () => Promise<void>;
  scoreServerTranscript: (conversationId: string, transcript: unknown) => Promise<boolean>;
}): Promise<{ status: number; body: { status: PublicFinalizeStatus } }> {
  if (input.interview.status === "completed") {
    return { status: 200, body: publicFinalizeBody("completed") };
  }

  let detail: ConversationDetail | null = null;
  if (input.interview.conversation_id) {
    detail = await input.fetchConversation(input.interview.conversation_id);
    if (detail?.agent_id && input.interview.agent_id && detail.agent_id !== input.interview.agent_id) {
      detail = null;
    }
  } else {
    if (!allowFinalizeLookup(input.interview.token)) {
      return { status: 429, body: publicFinalizeBody("in_progress") };
    }
    detail = await resolveUnboundConversation(input.interview, input.body, input.fetchConversation);
  }

  if (!detail) {
    await input.markManualReview();
    return { status: 200, body: publicFinalizeBody("needs_review") };
  }

  if (!readyToScore(detail)) {
    return { status: 200, body: publicFinalizeBody("in_progress") };
  }

  await input.scoreServerTranscript(detail.conversation_id, detail.transcript);
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
