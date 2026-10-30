import { NextRequest, NextResponse } from 'next/server';
import { HR_ADMIN_SESSION_COOKIE, readAdminSession } from './hr-admin-session';

/**
 * Admin auth — acepta DOS modos:
 *  (a) Authorization: Bearer <ADMIN_SECRET>     ← scripts / curl externos
 *  (b) Cookie hr_admin_session                  ← navegador HR Admin (8h)
 *
 * La cookie la setean la clave compartida (si el flag está prendido),
 * Google y IAP. Google e IAP incluyen el email. El Bearer no tiene email.
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const secret = (process.env.ADMIN_SECRET ?? '').trim();
  if (!secret) {
    return NextResponse.json({ error: 'ADMIN_SECRET not configured' }, { status: 500 });
  }

  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (bearer && bearer === secret) return null;

  const sessionToken = req.cookies.get(HR_ADMIN_SESSION_COOKIE)?.value;
  if (readAdminSession(sessionToken, secret)) return null;

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** Email from a Google or IAP session. Null for the shared password and for Bearer. */
export function adminSessionEmail(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): string | null {
  const secret = (process.env.ADMIN_SECRET ?? '').trim();
  return readAdminSession(req.cookies.get(HR_ADMIN_SESSION_COOKIE)?.value, secret)?.email ?? null;
}
