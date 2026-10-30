import { scriptsAuthorized } from "../admin-scripts-auth";
import { readSessionSecret } from "../hr-admin-secrets";
import { readAdminSession } from "../hr-admin-session";

/** Cookie hr_admin_session signed with HR_ADMIN_SESSION_SECRET and carrying an email. */
export function isAdminSession(cookieValue: string | undefined): boolean {
  const secret = readSessionSecret();
  if (!secret) return false;
  return Boolean(readAdminSession(cookieValue, secret)?.email);
}

export function isAdminRequest(req: {
  cookies: { get(n: string): { value: string } | undefined };
  headers: { get(name: string): string | null };
}): boolean {
  if (isAdminSession(req.cookies.get("hr_admin_session")?.value)) return true;
  return scriptsAuthorized(req);
}
