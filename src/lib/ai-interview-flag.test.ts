import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AI_INTERVIEW_OFF_NOTE,
  AI_INTERVIEW_UNAVAILABLE_EN,
  AI_INTERVIEW_UNAVAILABLE_ES,
  aiInterviewEnabled,
  aiInterviewReady,
} from "./ai-interview-flag.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const FLAG_GUARDED = [
  "src/app/api/headhunting/candidates/[candidateId]/send-ai-interview/route.ts",
  "src/app/api/headhunting/ai-interview/[token]/audio/route.ts",
  "src/app/api/admin/rescore-ai-interviews/route.ts",
  "src/app/api/cron/rescore-ai-interviews/route.ts",
  "src/app/api/admin/diag/audio/route.ts",
  "src/app/api/admin/diag/auto-fix-audio/route.ts",
  "src/app/api/admin/diag/fix-conversation/route.ts",
  "src/app/api/admin/diag/identify-session/route.ts",
  "src/app/api/admin/diag/revert-vianny/route.ts",
  "src/app/api/admin/diag/sessions/route.ts",
];

const READY_GUARDED = [
  "src/app/api/headhunting/ai-interview/[token]/route.ts",
  "src/app/api/headhunting/ai-interview/[token]/finalize/route.ts",
];

test("the AI interview stays off until AI_INTERVIEW_ENABLED is on", () => {
  const previousFlag = process.env.AI_INTERVIEW_ENABLED;
  const previousKey = process.env.ELEVENLABS_API_KEY;
  delete process.env.AI_INTERVIEW_ENABLED;
  delete process.env.ELEVENLABS_API_KEY;
  try {
    assert.equal(aiInterviewEnabled(undefined), false);
    assert.equal(aiInterviewEnabled(""), false);
    assert.equal(aiInterviewEnabled("0"), false);
    assert.equal(aiInterviewEnabled("false"), false);
    assert.equal(aiInterviewEnabled("1"), true);
    assert.equal(aiInterviewEnabled("true"), true);
    assert.equal(aiInterviewEnabled("yes"), true);
    assert.equal(aiInterviewEnabled("on"), true);
    assert.equal(aiInterviewEnabled({ AI_INTERVIEW_ENABLED: "on", ELEVENLABS_API_KEY: "" }), false);
    assert.equal(aiInterviewEnabled({ AI_INTERVIEW_ENABLED: "off", ELEVENLABS_API_KEY: "sk" }), false);
    assert.equal(aiInterviewEnabled({ AI_INTERVIEW_ENABLED: "on", ELEVENLABS_API_KEY: "sk" }), true);
    process.env.AI_INTERVIEW_ENABLED = "on";
    assert.equal(aiInterviewEnabled(), false);
    process.env.ELEVENLABS_API_KEY = "sk";
    assert.equal(aiInterviewEnabled(), true);
    assert.equal(aiInterviewReady(null), true);
    delete process.env.ELEVENLABS_API_KEY;
    assert.equal(aiInterviewReady(null), false);
    assert.equal(aiInterviewReady({ flag: "1" }), false);
    assert.equal(aiInterviewReady({ flag: "on", apiKey: "" }), false);
    assert.equal(aiInterviewReady({ flag: "", apiKey: "key" }), false);
    assert.equal(aiInterviewReady({ flag: "1", apiKey: "key" }), true);
    assert.equal(AI_INTERVIEW_OFF_NOTE, "Entrevista IA desactivada");
  } finally {
    if (previousFlag === undefined) delete process.env.AI_INTERVIEW_ENABLED;
    else process.env.AI_INTERVIEW_ENABLED = previousFlag;
    if (previousKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = previousKey;
  }
});

test("interview routes return disabled before any ElevenLabs call and do not delete rows", () => {
  for (const rel of FLAG_GUARDED) {
    const src = readFileSync(join(root, rel), "utf8");
    const guard = src.indexOf("if (!aiInterviewEnabled())");
    assert.ok(guard > 0, rel);
    assert.match(src, /status:\s*"disabled"/, rel);
    assert.equal(src.includes(".delete("), false, rel);
    const upstream = src.indexOf("api.elevenlabs.io");
    if (upstream >= 0) assert.ok(guard < upstream, rel);
  }
  for (const rel of READY_GUARDED) {
    const src = readFileSync(join(root, rel), "utf8");
    const guard = src.indexOf("if (!aiInterviewReady())");
    assert.ok(guard > 0, rel);
    assert.match(src, /status:\s*"disabled"/, rel);
    const upstream = src.indexOf("api.elevenlabs.io");
    if (upstream >= 0) assert.ok(guard < upstream, rel);
  }
  const send = readFileSync(join(root, FLAG_GUARDED[0]), "utf8");
  assert.ok(send.indexOf("if (!aiInterviewEnabled())") < send.indexOf(".insert("));
  const bind = readFileSync(join(root, READY_GUARDED[0]), "utf8");
  assert.ok(bind.indexOf("if (!aiInterviewReady())") < bind.indexOf("if (!aiInterviewEnabled())"));
});

test("the candidate page says the interview is not available and names the mailbox", () => {
  const layout = readFileSync(join(root, "src/app/entrevista-ia/[token]/layout.tsx"), "utf8");
  const page = readFileSync(join(root, "src/app/entrevista-ia/[token]/page.tsx"), "utf8");
  const view = readFileSync(join(root, "src/components/ai-interview-unavailable.tsx"), "utf8");
  const banner = readFileSync(join(root, "src/components/MailboxBanner.tsx"), "utf8");
  const funnel = readFileSync(join(root, "src/components/PipelineFunnel.tsx"), "utf8");
  assert.match(layout, /aiInterviewEnabled\(/);
  assert.match(layout, /AiInterviewUnavailable/);
  assert.match(page, /phase === "disabled"/);
  assert.ok(page.indexOf('phase === "disabled"') < page.indexOf("unpkg.com/@elevenlabs"));
  assert.match(view, /no disponible/);
  assert.match(view, /AI_INTERVIEW_UNAVAILABLE_ES/);
  assert.match(view, /AI_INTERVIEW_UNAVAILABLE_EN/);
  assert.match(view, /ATS_FROM_EMAIL/);
  assert.match(AI_INTERVIEW_UNAVAILABLE_ES, /no está disponible/);
  assert.match(AI_INTERVIEW_UNAVAILABLE_EN, /not available/);
  assert.equal(readFileSync(join(root, "src/lib/ats-from.ts"), "utf8").includes("jointheteam@tradingsolutions.com"), true);
  assert.match(banner, /AI_INTERVIEW_OFF_NOTE/);
  assert.equal(AI_INTERVIEW_OFF_NOTE, "Entrevista IA desactivada");
  assert.match(funnel, /Entrevista IA desactivada/);
});
