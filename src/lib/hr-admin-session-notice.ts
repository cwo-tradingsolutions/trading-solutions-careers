/** Fetch URLs that should raise the HR Admin session-expired notice on 401. */
export const HR_ADMIN_SESSION_API_PREFIXES = [
  "/api/headhunting",
  "/api/admin",
  "/api/dashboard",
  "/api/applications",
  "/api/assessments",
  "/api/talent-pool",
  "/api/recruiter-config",
  "/api/matching",
  "/api/google",
  "/api/assessment-preview",
  "/api/vacancies",
  "/api/requisitions",
  "/api/candidates",
  "/api/referrals",
  "/api/ranking",
  "/api/agents",
  "/api/bateria",
] as const;

export function isHrAdminSessionApi(url: string): boolean {
  return HR_ADMIN_SESSION_API_PREFIXES.some((prefix) => url.includes(prefix));
}
