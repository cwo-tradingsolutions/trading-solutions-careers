import { readAdminSession } from '../hr-admin-session';

/** Valida la cookie hr_admin_session con el mismo HMAC y las mismas 8h que requireAdmin. */
export function isAdminSession(cookieValue: string | undefined): boolean {
  const secret = (process.env.ADMIN_SECRET ?? '').trim();
  return readAdminSession(cookieValue, secret) !== null;
}

export function isAdminRequest(req: { cookies: { get(n: string): { value: string } | undefined }; headers: Headers }): boolean {
  if (isAdminSession(req.cookies.get('hr_admin_session')?.value)) return true;
  const header = (req.headers.get('x-admin-secret') ?? '').trim();
  const secret = (process.env.ADMIN_SECRET ?? '').trim();
  return !!header && !!secret && header === secret;
}
