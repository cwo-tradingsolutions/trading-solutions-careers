import crypto from 'crypto';
import { secretsEqual } from '../secret-compare';

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12;

/** Valida la cookie hr_admin_session con el mismo HMAC del middleware. */
export function isAdminSession(cookieValue: string | undefined): boolean {
  const secret = (process.env.ADMIN_SECRET ?? '').trim();
  if (!cookieValue || !secret) return false;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return false;
  const [ts, sig] = parts;
  const age = Date.now() - parseInt(ts, 10);
  if (!Number.isFinite(age) || age < 0 || age > SESSION_MAX_AGE_MS) return false;
  const expected = crypto.createHmac('sha256', secret).update(ts).digest('hex');
  return secretsEqual(expected, sig);
}

export function isAdminRequest(req: { cookies: { get(n: string): { value: string } | undefined }; headers: Headers }): boolean {
  if (isAdminSession(req.cookies.get('hr_admin_session')?.value)) return true;
  const header = (req.headers.get('x-admin-secret') ?? '').trim();
  const secret = (process.env.ADMIN_SECRET ?? '').trim();
  return !!header && !!secret && secretsEqual(header, secret);
}
