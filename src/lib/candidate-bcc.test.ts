import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { candidateMailBcc } from "./candidate-bcc.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SEND_ROUTES = [
  "src/app/api/applications/route.ts",
  "src/app/api/applications/[id]/route.ts",
  "src/app/api/assessments/route.ts",
];

test("candidate mail has no BCC even when the env and the config row are set", () => {
  assert.equal(candidateMailBcc("hello@elevarecareer.com", "jointheteam@tradingsolutions.com"), undefined);
  assert.equal(candidateMailBcc("", "audit@tradingsolutions.com"), undefined);
  assert.equal(candidateMailBcc(undefined, undefined), undefined);
});

test("the candidate send routes do not read EMAIL_BCC or recruiter_config.email_bcc", () => {
  for (const rel of SEND_ROUTES) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.equal(src.includes("EMAIL_BCC"), false, rel);
    assert.equal(src.includes("email_bcc"), false, rel);
    assert.match(src, /candidateMailBcc\(/, rel);
  }
});
