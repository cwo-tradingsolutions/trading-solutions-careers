import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Candidate-facing writes. Each file must refuse the write when
 * VERCEL_ENV=preview or STAGING_READ_ONLY=1.
 * There is no public unsubscribe route in this app.
 */
const ROUTES = [
  "src/app/api/talent-pool/public/route.ts",
  "src/app/api/applications/route.ts",
  "src/app/api/headhunting/prefilter/[token]/route.ts",
  "src/app/api/referrals/route.ts",
  "src/app/api/bateria/answer/route.ts",
  "src/app/api/bateria/complete/route.ts",
  "src/app/api/bateria/consent/route.ts",
  "src/app/api/bateria/event/route.ts",
  "src/app/api/bateria/snapshot/route.ts",
  "src/app/api/assessments/[token]/route.ts",
  "src/app/api/assessment-preview/route.ts",
  "src/app/api/headhunting/assessment/save/route.ts",
  "src/app/api/headhunting/assessment/complete/route.ts",
  "src/app/api/headhunting/assessment/snapshot/route.ts",
  "src/app/api/headhunting/assessment/validate/route.ts",
  "src/app/api/headhunting/ai-interview/[token]/route.ts",
  "src/app/api/headhunting/ai-interview/[token]/finalize/route.ts",
  "src/app/api/decision/[token]/route.ts",
  "src/app/api/candidate-experience/[token]/route.ts",
  "src/app/api/joint-schedulings/[token]/book/route.ts",
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

for (const rel of ROUTES) {
  const src = readFileSync(join(root, rel), "utf8");
  assert.match(src, /isPreviewTestMode\(/, `${rel} missing preview gate`);
  const returnsMock = /previewTestJson\(/.test(src);
  const skipsWrite = /!isPreviewTestMode\(\)/.test(src);
  assert.ok(returnsMock || skipsWrite, `${rel} neither mocks success nor skips the write`);
}

const pool = readFileSync(join(root, "src/app/api/talent-pool/public/route.ts"), "utf8");
const mockAt = pool.indexOf('previewTestJson("POST /api/talent-pool/public")');
const writeAt = pool.indexOf("neon(");
assert.ok(mockAt > 0 && writeAt > mockAt, "talent-pool mock must run before neon()");
const helper = readFileSync(join(root, "src/lib/preview-mode.ts"), "utf8");
assert.match(helper, /preview_test_mode:\s*true/);

const apps = readFileSync(join(root, "src/app/api/applications/route.ts"), "utf8");
assert.ok(apps.indexOf('previewTestJson("POST /api/applications")') < apps.indexOf("await ensureDB("));

console.log("preview public-write checks passed");
console.log(ROUTES.join("\n"));
