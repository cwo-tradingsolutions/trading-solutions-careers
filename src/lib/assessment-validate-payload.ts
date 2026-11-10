/**
 * Public shape of GET /api/headhunting/assessment/validate.
 *
 * The assessment page reads only these fields. The candidate row is queried
 * with VALIDATE_CANDIDATE_COLUMNS, and this builder drops everything else
 * (email, phone, notes, prefilter, salary, scores, rubrics).
 */

export const VALIDATE_CANDIDATE_COLUMNS =
  "id, name, status, stage, vacancy_id, client_id, token_expires_at" as const;

export const VALIDATE_VACANCY_COLUMNS = "id, title, model_id" as const;
export const VALIDATE_CLIENT_COLUMNS = "name, logo_url" as const;
export const VALIDATE_SCENARIO_COLUMNS =
  "id, block, scenario_type, scenario_text, competency_key, order_index, time_limit_seconds" as const;
export const VALIDATE_RESPONSE_COLUMNS =
  "scenario_id, response_text, response_data, is_final" as const;

export type PublicScenario = {
  id: string;
  block: string;
  scenario_type: string;
  scenario_text: string;
  options: string[];
  time_limit_seconds: number | null;
};

export type PublicSavedResponse = {
  scenario_id: string;
  response_text: string | null;
  response_data: unknown;
  is_final: boolean | null;
};

export type AssessmentValidateBody = {
  candidate: { name: string | null };
  vacancy: { title: string } | null;
  client: { name: string; logo_url: string | null };
  scenarios: PublicScenario[];
  existing_responses: PublicSavedResponse[];
};

export function assessmentValidateBody(input: {
  candidateName: string | null;
  vacancyTitle: string | null;
  clientName: string | null;
  clientLogoUrl: string | null;
  scenarios: PublicScenario[];
  existingResponses: PublicSavedResponse[];
}): AssessmentValidateBody {
  return {
    candidate: { name: input.candidateName },
    vacancy: input.vacancyTitle ? { title: input.vacancyTitle } : null,
    client: {
      name: input.clientName || "Trading Solutions",
      logo_url: input.clientLogoUrl,
    },
    scenarios: input.scenarios.map((scenario) => ({
      id: scenario.id,
      block: scenario.block,
      scenario_type: scenario.scenario_type,
      scenario_text: scenario.scenario_text,
      options: scenario.options,
      time_limit_seconds: scenario.time_limit_seconds,
    })),
    existing_responses: input.existingResponses.map((row) => ({
      scenario_id: row.scenario_id,
      response_text: row.response_text,
      response_data: row.response_data,
      is_final: row.is_final,
    })),
  };
}
