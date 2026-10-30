import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assessmentCandidateWrite, publicAssessmentView } from "./assessment-token-public.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("public assessment view is only what the candidate page renders", () => {
  const view = publicAssessmentView({
    token: "tok",
    candidate_name: "Ana",
    candidate_email: "ana@example.com",
    vacancy_slug: "ops",
    vacancy_title_es: "Operaciones",
    vacancy_title_en: "Operations",
    assessment_ids: "factor_x_ts",
    language: "es",
    status: "sent",
    score: 99,
    results: { disc: "D" },
    source: "manual",
    id: 4,
  } as never);
  assert.deepEqual(view, {
    token: "tok",
    candidate_name: "Ana",
    vacancy_slug: "ops",
    vacancy_title_es: "Operaciones",
    vacancy_title_en: "Operations",
    assessment_ids: "factor_x_ts",
    language: "es",
    status: "sent",
  });
  assert.equal("score" in view, false);
  assert.equal("results" in view, false);
  assert.equal("candidate_email" in view, false);
});

test("PATCH score and status payload is ignored", () => {
  const write = assessmentCandidateWrite(
    { status: "sent" },
    { status: "completed", score: 100, results: { hacked: true }, started_at: "2000-01-01", completed_at: "2000-01-01" },
  );
  assert.equal(write?.status, "in_progress");
  assert.equal("score" in (write ?? {}), false);
  assert.equal("results" in (write ?? {}), false);

  assert.equal(
    assessmentCandidateWrite(
      { status: "completed" },
      { status: "sent", score: 0, results: { hacked: true } },
    ),
    null,
  );
  assert.equal(
    assessmentCandidateWrite({ status: "in_progress" }, { status: "completed", score: 100 }),
    null,
  );
});

test("assessment token route does not select or return the whole row", () => {
  const src = readFileSync(join(root, "src/app/api/assessments/[token]/route.ts"), "utf8");
  assert.equal(src.includes("a.*"), false);
  assert.equal(src.includes("RETURNING *"), false);
  assert.equal(src.includes("body.score"), false);
  assert.equal(src.includes("body.status"), false);
});
