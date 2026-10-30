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
} from "./ai-interview-flag.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const GUARDED = [
  "src/app/api/headhunting/candidates/[candidateId]/send-ai-interview/route.ts",
  "src/app/api/headhunting/ai-interview/[token]/route.ts",
  "src/app/api/headhunting/ai-interview/[token]/finalize/route.ts",
  "src/app/api/headhunting/ai-interview/[token]/audio/route.ts",
  "src/app/api/admin/rescore-ai-interviews/route.ts",
  "src/app/api/admin/diag/audio/route.ts",
  "src/app/api/admin/diag/auto-fix-audio/route.ts",
  "src/app/api/admin/diag/fix-conversation/route.ts",
  "src/app/api/admin/diag/identify-session/route.ts",
  "src/app/api/admin/diag/revert-vianny/route.ts",
  "src/app/api/admin/diag/sessions/route.ts",
];

test("the AI interview is off by default and off without an ElevenLabs key", () => {
  assert.equal(aiInterviewEnabled({}), false);
  assert.equal(aiInterviewEnabled({ AI_INTERVIEW_ENABLED: "" }), false);
  assert.equal(aiInterviewEnabled({ AI_INTERVIEW_ENABLED: "0" }), false);
  assert.equal(aiInterviewEnabled({ AI_INTERVIEW_ENABLED: "false" }), false);
  assert.equal(aiInterviewEnabled({ AI_INTERVIEW_ENABLED: "1" }), false);
  assert.equal(aiInterviewEnabled({ AI_INTERVIEW_ENABLED: "true", ELEVENLABS_API_KEY: "" }), false);
  assert.equal(aiInterviewEnabled({ AI_INTERVIEW_ENABLED: "1", ELEVENLABS_API_KEY: "key" }), true);
  assert.equal(aiInterviewEnabled({ AI_INTERVIEW_ENABLED: "true", ELEVENLABS_API_KEY: "key" }), true);
  assert.equal(AI_INTERVIEW_OFF_NOTE, "Entrevista IA desactivada");
});

test("interview routes return disabled before any ElevenLabs call and do not delete rows", () => {
  for (const rel of GUARDED) {
    const src = readFileSync(join(root, rel), "utf8");
    const guard = src.indexOf("if (!aiInterviewEnabled())");
    assert.ok(guard > 0, rel);
    assert.match(src, /status:\s*"disabled"/, rel);
    assert.equal(src.includes(".delete("), false, rel);
    const upstream = src.indexOf("api.elevenlabs.io");
    if (upstream >= 0) assert.ok(guard < upstream, rel);
  }
  const send = readFileSync(join(root, GUARDED[0]), "utf8");
  assert.ok(send.indexOf("if (!aiInterviewEnabled())") < send.indexOf(".insert("));
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
