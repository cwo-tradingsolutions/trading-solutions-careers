import { adminSessionEmailAllowed } from "../hr-admin-session-policy";
import { readSessionSecret } from "../hr-admin-secrets";
import { readAdminSession } from "../hr-admin-session";

/** Cookie hr_admin_session signed with HR_ADMIN_SESSION_SECRET and carrying an email still on the allowlist. */
export function isAdminSession(cookieValue: string | undefined): boolean {
  const secret = readSessionSecret();
  if (!secret) return false;
  const email = readAdminSession(cookieValue, secret)?.email;
  if (!email) return false;
  return adminSessionEmailAllowed(email);
}

export function isAdminRequest(req: {
  cookies: { get(n: string): { value: string } | undefined };
  headers: { get(name: string): string | null };
}): boolean {
  return isAdminSession(req.cookies.get("hr_admin_session")?.value);
}
