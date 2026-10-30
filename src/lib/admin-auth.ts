import { NextRequest, NextResponse } from "next/server";
import { adminSessionEmailAllowed } from "./hr-admin-session-policy";
import { HR_ADMIN_SESSION_COOKIE, readAdminSession } from "./hr-admin-session";
import { readSessionSecret } from "./hr-admin-secrets";

/**
 * Browser HR Admin auth is the signed hr_admin_session cookie only.
 * The cookie must carry an email. Bearer ADMIN_SECRET is not accepted.
 * The emergency password is checked only by POST /api/hr-admin/login
 * while HR_ADMIN_PASSWORD_LOGIN_ENABLED is on.
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const secret = readSessionSecret();
  if (!secret) {
    return NextResponse.json({ error: "HR_ADMIN_SESSION_SECRET not configured" }, { status: 500 });
  }

  const session = readAdminSession(req.cookies.get(HR_ADMIN_SESSION_COOKIE)?.value, secret);
  if (session?.email && adminSessionEmailAllowed(session.email)) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Email from a Google, IAP, or break-glass session. Null when there is no signed email claim. */
export function adminSessionEmail(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): string | null {
  const secret = readSessionSecret();
  if (!secret) return null;
  const email = readAdminSession(req.cookies.get(HR_ADMIN_SESSION_COOKIE)?.value, secret)?.email ?? null;
  if (!email || !adminSessionEmailAllowed(email)) return null;
  return email;
}

/** Actor stored on a write. The client does not get to choose it. */
export function sessionActor(email: string | null | undefined): string | null {
  const value = (email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(value)) return null;
  return value;
}
