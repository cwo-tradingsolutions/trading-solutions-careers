import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  conversationMatchesInterview,
  publicFinalizeBody,
  runCandidateFinalize,
  type ConversationDetail,
  type InterviewBind,
} from "./ai-interview-finalize.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const interview: InterviewBind = {
  id: "iv-1",
  token: "tok-ana",
  status: "in_progress",
  agent_id: "agent-valeria",
  conversation_id: null,
};

function detail(overrides: Partial<ConversationDetail>): ConversationDetail {
  return {
    conversation_id: "conv_server",
    agent_id: "agent-valeria",
    status: "done",
    start_time_unix_secs: Math.floor(Date.now() / 1000),
    dynamic_variables: { interview_token: "tok-ana", interview_id: "iv-1" },
    transcript: [{ role: "user", message: "SERVER TRANSCRIPT" }],
    ...overrides,
  };
}

test("finalize twice is idempotent and the response has no score", async () => {
  let calls = 0;
  const done = { ...interview, status: "completed", conversation_id: "conv_server" };
  for (let i = 0; i < 2; i++) {
    const result = await runCandidateFinalize({
      interview: done,
      body: { transcript: "client transcript", conversation_id: "conv_attacker", score: 100, recommendation: "AVANZA", summary: "secret" },
      fetchConversation: async () => {
        calls += 1;
        return null;
      },
      markManualReview: async () => {
        calls += 1;
      },
      scoreServerTranscript: async () => {
        calls += 1;
      },
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: "completed" });
    assert.equal("score" in result.body, false);
    assert.equal("recommendation" in result.body, false);
    assert.equal("summary" in result.body, false);
  }
  assert.equal(calls, 0);
  assert.deepEqual(Object.keys(publicFinalizeBody("completed")), ["status"]);
});

test("a client transcript is ignored when the conversation is bound on the server", async () => {
  const clientTranscript = [{ role: "user", message: "CLIENT TRANSCRIPT score 100" }];
  const server = detail({ conversation_id: "conv_server" });
  let scored: unknown = null;
  let fetched: string | null = null;
  const result = await runCandidateFinalize({
    interview: { ...interview, conversation_id: "conv_server" },
    body: { transcript: clientTranscript, conversation_id: "conv_attacker", score: 100 },
    fetchConversation: async (id) => {
      fetched = id;
      return server;
    },
    markManualReview: async () => {
      throw new Error("manual review");
    },
    scoreServerTranscript: async (_id, transcript) => {
      scored = transcript;
    },
  });
  assert.equal(fetched, "conv_server");
  assert.equal(scored, server.transcript);
  assert.notEqual(scored, clientTranscript);
  assert.deepEqual(result.body, { status: "completed" });
});

test("a nearby conversation without this candidate metadata is not used", async () => {
  const other = detail({
    conversation_id: "conv_other",
    dynamic_variables: { interview_token: "tok-other", interview_id: "iv-other" },
    start_time_unix_secs: Math.floor(Date.now() / 1000),
    transcript: [{ role: "user", message: "SOMEONE ELSE" }],
  });
  assert.equal(conversationMatchesInterview(other, interview), false);
  let scored = false;
  let reviewed = false;
  const result = await runCandidateFinalize({
    interview,
    body: { transcript: [{ role: "user", message: "CLIENT" }], conversation_id: "conv_other" },
    fetchConversation: async () => other,
    markManualReview: async () => {
      reviewed = true;
    },
    scoreServerTranscript: async () => {
      scored = true;
    },
  });
  assert.equal(scored, false);
  assert.equal(reviewed, true);
  assert.deepEqual(result.body, { status: "needs_review" });
  assert.equal("score" in result.body, false);
});

test("an exact agent and interview_token match is fetched from ElevenLabs", async () => {
  const match = detail({ conversation_id: "conv_match", transcript: [{ role: "user", message: "ANA" }] });
  let scored: unknown = null;
  const result = await runCandidateFinalize({
    interview,
    body: { transcript: "ignore me", conversation_id: "conv_match" },
    fetchConversation: async (id) => (id === "conv_match" ? match : null),
    markManualReview: async () => {
      throw new Error("should match");
    },
    scoreServerTranscript: async (id, transcript) => {
      assert.equal(id, "conv_match");
      scored = transcript;
    },
  });
  assert.equal(scored, match.transcript);
  assert.deepEqual(result.body, { status: "completed" });
});

test("finalize route no longer uses the ten minute conversation window", () => {
  const src = readFileSync(
    join(root, "src/app/api/headhunting/ai-interview/[token]/finalize/route.ts"),
    "utf8",
  );
  assert.equal(src.includes("TOLERANCE"), false);
  assert.equal(src.includes("body.transcript"), false);
  assert.equal(src.includes("10 * 60"), false);
  assert.equal(src.includes("page_size=20"), false);
  assert.equal(src.includes('.neq("status", "completed")'), true);
});

test("a conversation that is not done is left untouched", async () => {
  let writes = 0;
  const live = detail({ status: "in-progress", transcript: [{ role: "user", message: "partial" }] });
  const result = await runCandidateFinalize({
    interview: { ...interview, conversation_id: "conv_server", token: "tok-live" },
    body: { transcript: "client" },
    fetchConversation: async () => live,
    markManualReview: async () => {
      writes += 1;
    },
    scoreServerTranscript: async () => {
      writes += 1;
      return true;
    },
  });
  assert.equal(writes, 0);
  assert.deepEqual(result.body, { status: "in_progress" });
});

test("an empty done transcript is not completed", async () => {
  let writes = 0;
  const empty = detail({ transcript: [] });
  const result = await runCandidateFinalize({
    interview: { ...interview, conversation_id: "conv_server", token: "tok-empty" },
    body: {},
    fetchConversation: async () => empty,
    markManualReview: async () => {
      writes += 1;
    },
    scoreServerTranscript: async () => {
      writes += 1;
      return true;
    },
  });
  assert.equal(writes, 0);
  assert.deepEqual(result.body, { status: "in_progress" });
});

test("interview_id alone does not bind a conversation", () => {
  const byIdOnly = detail({
    dynamic_variables: { interview_id: "iv-1" },
  });
  assert.equal(conversationMatchesInterview(byIdOnly, interview), false);
  const byToken = detail({ dynamic_variables: { interview_token: "tok-ana" } });
  assert.equal(conversationMatchesInterview(byToken, interview), true);
});

test("unbound finalize does not scan a page of conversations and is rate limited", async () => {
  let fetches = 0;
  const calls = async () =>
    runCandidateFinalize({
      interview: { ...interview, token: "tok-rate", conversation_id: null },
      body: {},
      fetchConversation: async () => {
        fetches += 1;
        return null;
      },
      markManualReview: async () => {},
      scoreServerTranscript: async () => true,
    });
  for (let i = 0; i < 8; i++) await calls();
  const blocked = await calls();
  assert.equal(fetches, 0);
  assert.equal(blocked.status, 429);
  assert.deepEqual(blocked.body, { status: "in_progress" });
});
