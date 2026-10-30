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

export function publicFinalizeBody(state: "completed" | "needs_review"): {
  status: "completed" | "needs_review";
} {
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
  return vars.interview_token === interview.token || vars.interview_id === interview.id;
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

function pickLatest(matches: ConversationDetail[]): ConversationDetail {
  return [...matches].sort(
    (a, b) => (b.start_time_unix_secs ?? 0) - (a.start_time_unix_secs ?? 0),
  )[0];
}

async function resolveUnboundConversation(
  interview: InterviewBind,
  body: unknown,
  fetchConversation: (id: string) => Promise<ConversationDetail | null>,
  listConversationIds: (agentId: string) => Promise<string[]>,
): Promise<ConversationDetail | null> {
  const hinted = hintedConversationId(body);
  if (hinted) {
    const detail = await fetchConversation(hinted);
    if (detail && conversationMatchesInterview(detail, interview)) return detail;
  }
  if (!interview.agent_id) return null;
  const ids = await listConversationIds(interview.agent_id);
  const matches: ConversationDetail[] = [];
  for (const id of ids) {
    if (hinted && id === hinted) continue;
    const detail = await fetchConversation(id);
    if (detail && conversationMatchesInterview(detail, interview)) matches.push(detail);
  }
  if (matches.length === 0) return null;
  return pickLatest(matches);
}

export async function runCandidateFinalize(input: {
  interview: InterviewBind;
  body: unknown;
  fetchConversation: (id: string) => Promise<ConversationDetail | null>;
  listConversationIds: (agentId: string) => Promise<string[]>;
  markManualReview: () => Promise<void>;
  scoreServerTranscript: (conversationId: string, transcript: unknown) => Promise<void>;
}): Promise<{ status: number; body: { status: "completed" | "needs_review" } }> {
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
    detail = await resolveUnboundConversation(
      input.interview,
      input.body,
      input.fetchConversation,
      input.listConversationIds,
    );
  }

  const serverTranscript = detail?.transcript;
  if (!detail || serverTranscript == null) {
    await input.markManualReview();
    return { status: 200, body: publicFinalizeBody("needs_review") };
  }

  await input.scoreServerTranscript(detail.conversation_id, serverTranscript);
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

export async function listElevenConversationIds(
  agentId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const response = await fetchImpl(
    `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${encodeURIComponent(agentId)}&page_size=20`,
    { headers: { "xi-api-key": apiKey } },
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as { conversations?: Array<{ conversation_id?: string }>; history?: Array<{ conversation_id?: string }> };
  const list = payload.conversations || payload.history || [];
  return list
    .map((item) => item.conversation_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, 20);
}
