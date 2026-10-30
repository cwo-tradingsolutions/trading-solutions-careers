import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FINALIZE_LOOKUP_MAX,
  FINALIZE_LOOKUP_WINDOW_MS,
  allowFinalizeLookup,
  conversationMatchesInterview,
  finalizeLookupHas,
  publicFinalizeBody,
  runCandidateFinalize,
  type ConversationDetail,
  type InterviewBind,
} from "./ai-interview-finalize.ts";
import { rescoreAction, rescoreBaseUrl, rescoreRowEligible, validConversationId } from "./ai-interview-rescore.ts";
import { aiInterviewEnabled } from "./ai-interview-flag.ts";
import { cronAuthorized, readCronSecret } from "./cron-auth.ts";
import { visibleRecommendation } from "./ai-recommendation.ts";

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
      if (id !== "conv_server") {
        return detail({
          conversation_id: id,
          dynamic_variables: { interview_token: "someone-else" },
          transcript: [{ role: "user", message: "OTHER" }],
        });
      }
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

test("finalize lookups expire and the bound path is limited too", async () => {
  const staleAt = 1_000;
  assert.equal(allowFinalizeLookup("tok-stale-key", staleAt), true);
  assert.equal(finalizeLookupHas("tok-stale-key"), true);
  assert.equal(allowFinalizeLookup("tok-fresh-key", staleAt + FINALIZE_LOOKUP_WINDOW_MS + 1), true);
  assert.equal(finalizeLookupHas("tok-stale-key"), false);

  let fetches = 0;
  const bound = { ...interview, token: "tok-bound-limit", conversation_id: "conv_bound" };
  const calls = () =>
    runCandidateFinalize({
      interview: bound,
      body: {},
      fetchConversation: async () => {
        fetches += 1;
        return detail({ status: "in-progress", conversation_id: "conv_bound" });
      },
      markManualReview: async () => {},
      scoreServerTranscript: async () => true,
    });
  for (let i = 0; i < FINALIZE_LOOKUP_MAX; i++) await calls();
  const blocked = await calls();
  assert.equal(fetches, FINALIZE_LOOKUP_MAX);
  assert.equal(blocked.status, 429);
});

test("a verified hint does not replace a conversation id that is already stored", async () => {
  let remembered: string | null = null;
  let scoredId: string | null = null;
  const live = detail({
    conversation_id: "conv_live",
    dynamic_variables: { interview_token: "tok-reload" },
    transcript: [{ role: "user", message: "LIVE" }],
  });
  const result = await runCandidateFinalize({
    interview: { ...interview, token: "tok-reload", conversation_id: "conv_abandoned" },
    body: { conversation_id: "conv_live" },
    fetchConversation: async (id) => (id === "conv_live" ? live : detail({
      conversation_id: id,
      dynamic_variables: { interview_token: "tok-reload" },
      transcript: [{ role: "user", message: "OLD" }],
    })),
    rememberConversation: async (id) => {
      remembered = id;
    },
    markManualReview: async () => {
      throw new Error("review");
    },
    scoreServerTranscript: async (id) => {
      scoredId = id;
      return true;
    },
  });
  assert.equal(remembered, null);
  assert.equal(scoredId, "conv_abandoned");
  assert.deepEqual(result.body, { status: "completed" });
});

test("a fresh scoring claim blocks a second candidate score", async () => {
  let fetches = 0;
  const result = await runCandidateFinalize({
    interview: { ...interview, token: "tok-claimed", conversation_id: "conv_server" },
    body: { conversation_id: "conv_server" },
    scoringClaimActive: true,
    fetchConversation: async () => {
      fetches += 1;
      return detail({ conversation_id: "conv_server" });
    },
    markManualReview: async () => {
      fetches += 1;
    },
    scoreServerTranscript: async () => {
      fetches += 1;
      return true;
    },
  });
  assert.equal(fetches, 0);
  assert.deepEqual(result.body, { status: "in_progress" });
});

test("server rescore still scores a row that holds the claim", async () => {
  let scored = false;
  const result = await runCandidateFinalize({
    interview: { ...interview, token: "tok-server-claim", conversation_id: "conv_server" },
    body: {},
    scoringClaimActive: true,
    lookupBucket: "server",
    fetchConversation: async () => detail({ conversation_id: "conv_server", dynamic_variables: { interview_token: "tok-server-claim" } }),
    markManualReview: async () => {
      throw new Error("review");
    },
    scoreServerTranscript: async () => {
      scored = true;
      return true;
    },
  });
  assert.equal(scored, true);
  assert.deepEqual(result.body, { status: "completed", rescored: true });
});

test("the AI interview flag, cron secret, and rescore url stay closed", () => {
  assert.equal(aiInterviewEnabled(""), false);
  assert.equal(aiInterviewEnabled("on"), true);
  assert.equal(cronAuthorized("short-secret", "short-secret"), false);
  assert.equal(cronAuthorized("a".repeat(16), "b".repeat(16)), false);
  assert.equal(cronAuthorized("a".repeat(16), "a".repeat(16)), true);
  assert.equal(rescoreBaseUrl({ APP_URL: "https://careers.example/" }), "https://careers.example");
  assert.equal(rescoreBaseUrl({ NEXT_PUBLIC_APP_URL: "careers.example" }), null);
  assert.equal(rescoreBaseUrl({ APP_URL: "http://careers.example" }), null);
  assert.equal(rescoreBaseUrl({}), null);
  assert.equal(readCronSecret({ CRON_SECRET: "short" }), null);
  assert.equal(readCronSecret({ CRON_SECRET: "a".repeat(16), ADMIN_SECRET: "a".repeat(16) }), null);
  assert.equal(readCronSecret({ CRON_SECRET: "c".repeat(16), ADMIN_SECRET: "a".repeat(16) }), "c".repeat(16));
  assert.equal(visibleRecommendation("SCORING:1"), null);
  assert.equal(visibleRecommendation("  SCORING:99"), null);
  assert.equal(visibleRecommendation("AVANZA"), "AVANZA");
  assert.equal(rescoreRowEligible({ scoring_attempts: 5 }), "exhausted");
  assert.equal(rescoreRowEligible({ scoring_claimed_at: new Date(0).toISOString(), scoring_attempts: 1 }, 60_000, 2_000), "eligible");
  assert.equal(rescoreRowEligible({ scoring_claimed_at: new Date(50_000).toISOString(), scoring_attempts: 1 }, 60_000, 30_000), "claimed");
  assert.equal(aiInterviewEnabled({ AI_INTERVIEW_ENABLED: "on", ELEVENLABS_API_KEY: "" }), false);
  assert.equal(aiInterviewEnabled({ AI_INTERVIEW_ENABLED: "on", ELEVENLABS_API_KEY: "sk" }), true);
  assert.equal(validConversationId(""), false);
  assert.equal(validConversationId("conv_" + "a".repeat(10)), true);
  assert.equal(validConversationId("not-a-conversation"), false);
  assert.equal(allowFinalizeLookup("tok-bucket", 5_000, "candidate"), true);
  for (let i = 1; i < FINALIZE_LOOKUP_MAX; i++) allowFinalizeLookup("tok-bucket", 5_000, "candidate");
  assert.equal(allowFinalizeLookup("tok-bucket", 5_000, "candidate"), false);
  assert.equal(allowFinalizeLookup("tok-bucket", 5_000, "server"), true);
});

test("cron GET does not accept the admin cookie", () => {
  const src = readFileSync(join(root, "src/app/api/cron/rescore-ai-interviews/route.ts"), "utf8");
  const getFn = src.split("export async function GET")[1]?.split("export async function POST")[0] ?? "";
  const postFn = src.split("export async function POST")[1] ?? "";
  assert.doesNotMatch(getFn, /requireAdmin/);
  assert.match(getFn, /cronOk/);
  assert.match(postFn, /requireAdmin/);
});

test("the disabled interview screen does not say we are still processing", () => {
  const src = readFileSync(join(root, "src/app/entrevista-ia/[token]/page.tsx"), "utf8");
  const disabled = src.split('phase === "disabled"')[1]?.split('phase === "timeout"')[0] ?? "";
  const timeout = src.split('phase === "timeout"')[1]?.split('phase === "ended"')[0] ?? "";
  assert.match(disabled, /Talent Acquisition te contactará/);
  assert.match(disabled, /Talent Acquisition will contact you/);
  assert.doesNotMatch(disabled, /seguimos procesando/i);
  assert.match(timeout, /Talent Acquisition te contactará/);
  assert.match(timeout, /Talent Acquisition will contact you/);
});

test("rescore scores an in-progress interview only after ElevenLabs is done", () => {
  const row = { status: "in_progress", conversation_id: "conv_1", ai_score: null };
  assert.equal(rescoreAction(row, "done"), "score");
  assert.equal(rescoreAction(row, "in-progress"), "wait");
  assert.equal(rescoreAction({ ...row, status: "completed" }, "done"), "score");
  assert.equal(rescoreAction({ ...row, status: "completed" }, "in-progress"), "wait");
  assert.equal(rescoreAction({ ...row, ai_score: 80 }, "done"), "skip");
});
