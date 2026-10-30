/**
 * Public shape of /api/assessments/[token].
 * The candidate page renders these fields and nothing else.
 * score, results, status transitions, and evaluator columns stay off the wire
 * and off the PATCH write.
 */

export const PUBLIC_ASSESSMENT_FIELDS = [
  "token",
  "candidate_name",
  "vacancy_slug",
  "vacancy_title_es",
  "vacancy_title_en",
  "assessment_ids",
  "language",
  "status",
] as const;

export type PublicAssessment = {
  token: string;
  candidate_name: string | null;
  vacancy_slug: string | null;
  vacancy_title_es: string | null;
  vacancy_title_en: string | null;
  assessment_ids: string | null;
  language: string | null;
  status: string | null;
};

type AssessmentRow = {
  token?: string | null;
  candidate_name?: string | null;
  vacancy_slug?: string | null;
  vacancy_title_es?: string | null;
  vacancy_title_en?: string | null;
  assessment_ids?: string | null;
  language?: string | null;
  status?: string | null;
};

export function publicAssessmentView(row: AssessmentRow): PublicAssessment {
  return {
    token: row.token ?? "",
    candidate_name: row.candidate_name ?? null,
    vacancy_slug: row.vacancy_slug ?? null,
    vacancy_title_es: row.vacancy_title_es ?? null,
    vacancy_title_en: row.vacancy_title_en ?? null,
    assessment_ids: row.assessment_ids ?? null,
    language: row.language ?? null,
    status: row.status ?? null,
  };
}

/**
 * The candidate page sends `{ status: "in_progress" }` when the link is opened.
 * That value is not trusted. Opening a still-unstarted token moves it to
 * in_progress. completed and any other status do not move, so a score or
 * status payload cannot complete or regress the row.
 */
export function assessmentCandidateWrite(
  current: { status?: string | null },
  _body: unknown,
): { status: "in_progress"; startedAt: string } | null {
  if (current.status !== "sent") return null;
  return { status: "in_progress", startedAt: new Date().toISOString() };
}
