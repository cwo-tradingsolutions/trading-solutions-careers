import assert from "node:assert/strict";
import test from "node:test";
import {
  STEP_EN,
  STEP_ES,
  SURVEY_LOAD_EN,
  SURVEY_LOAD_ES,
  publicStepBody,
  shouldDropVacancyId,
  surveyLoadBody,
} from "./candidate-public-error.ts";

test("survey load copy is the approved ES and EN pair", () => {
  const body = surveyLoadBody();
  assert.equal(body.error, SURVEY_LOAD_ES);
  assert.equal(body.error_en, SURVEY_LOAD_EN);
  assert.equal(body.error, "No pudimos cargar la encuesta. Escríbenos a jointheteam@tradingsolutions.com");
  assert.equal(body.error_en, "We couldn't load the survey. Write to us at jointheteam@tradingsolutions.com");
  assert.equal(body.error.includes("column"), false);
});

test("other public failures use the team step message", () => {
  const body = publicStepBody();
  assert.equal(body.error, STEP_ES);
  assert.equal(body.error_en, STEP_EN);
});

test("a missing vacancy_id is dropped and other errors are not", () => {
  assert.equal(
    shouldDropVacancyId({
      code: "42703",
      message: 'column ts_candidate_experience.vacancy_id does not exist',
    }),
    true,
  );
  assert.equal(
    shouldDropVacancyId({
      message: 'column ts_candidate_experience.vacancy_id does not exist',
    }),
    true,
  );
  assert.equal(
    shouldDropVacancyId({
      code: "PGRST204",
      message: "Could not find the 'vacancy_id' column of 'ts_candidate_experience' in the schema cache",
    }),
    true,
  );
  assert.equal(shouldDropVacancyId({ code: "23505", message: "duplicate key value" }), false);
  assert.equal(shouldDropVacancyId({ message: "Encuesta no encontrada" }), false);
});
