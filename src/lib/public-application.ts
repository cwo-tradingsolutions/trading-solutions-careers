/** Applicant acknowledgement. Score and prefilter stay in the database. */
export function publicApplicationCreated(row: {
  id: number;
  created_at: unknown;
  status: unknown;
  score?: unknown;
  prefilter?: unknown;
  prefilter_data?: unknown;
}, portalToken: string) {
  return {
    success: true as const,
    id: row.id,
    created_at: row.created_at,
    status: row.status,
    portal_token: portalToken,
  };
}
