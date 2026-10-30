import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  VALIDATE_CANDIDATE_COLUMNS,
  assessmentValidateBody,
} from "./assessment-validate-payload.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const FORBIDDEN = [
  "email",
  "phone",
  "notes",
  "salary",
  "prefilter",
  "score",
  "scoring_rubric",
  "target_columns",
];

test("assessment validate response keys are exactly the page whitelist", () => {
  const body = assessmentValidateBody({
    candidateName: "Ana López",
    vacancyTitle: "Analista de operaciones",
    clientName: "Trading Solutions",
    clientLogoUrl: null,
    scenarios: [
      {
        id: "s1",
        block: "cognitivo",
        scenario_type: "role_play_mc",
        scenario_text: "¿Qué haces?",
        options: ["A", "B"],
        time_limit_seconds: 120,
        scoring_rubric: { instructions: "secret rubric" },
        email: "ana@example.com",
      } as never,
    ],
    existingResponses: [
      {
        scenario_id: "s1",
        response_text: "A",
        response_data: { selected_option: 0 },
        is_final: false,
        time_spent_seconds: 40,
        notes: "internal",
      } as never,
    ],
  });

  assert.deepEqual(Object.keys(body).sort(), [
    "candidate",
    "client",
    "existing_responses",
    "scenarios",
    "vacancy",
  ]);
  assert.deepEqual(Object.keys(body.candidate), ["name"]);
  assert.deepEqual(Object.keys(body.vacancy || {}), ["title"]);
  assert.deepEqual(Object.keys(body.client).sort(), ["logo_url", "name"]);
  assert.deepEqual(Object.keys(body.scenarios[0]).sort(), [
    "block",
    "id",
    "options",
    "scenario_text",
    "scenario_type",
    "time_limit_seconds",
  ]);
  assert.deepEqual(Object.keys(body.existing_responses[0]).sort(), [
    "is_final",
    "response_data",
    "response_text",
    "scenario_id",
  ]);

  const serialized = JSON.stringify(body);
  for (const key of FORBIDDEN) {
    assert.equal(serialized.includes(`"${key}"`), false, key);
  }
  assert.equal(serialized.includes("secret rubric"), false);
  assert.equal(serialized.includes("ana@example.com"), false);
  assert.equal(serialized.includes("internal"), false);
});

test("the validate query does not select the whole candidate row", () => {
  assert.deepEqual(VALIDATE_CANDIDATE_COLUMNS.split(", ").sort(), [
    "client_id",
    "id",
    "name",
    "stage",
    "status",
    "token_expires_at",
    "vacancy_id",
  ]);
  for (const key of ["email", "phone", "notes", "salary", "prefilter", "score"]) {
    assert.equal(VALIDATE_CANDIDATE_COLUMNS.split(", ").includes(key), false, key);
  }

  const src = readFileSync(
    join(root, "src/app/api/headhunting/assessment/validate/route.ts"),
    "utf8",
  );
  assert.match(src, /VALIDATE_CANDIDATE_COLUMNS/);
  assert.equal(src.includes(".select('*')"), false);
  assert.equal(src.includes('.select("*")'), false);
});
