import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Admin auth — acepta DOS modos:
 *  (a) Authorization: Bearer <ADMIN_SECRET>     ← scripts / curl externos
 *  (b) Cookie hr_admin_session: <ts>.<hmac>    ← navegador HR Admin (12h)
 *
 * La cookie es la misma que setea /api/hr-admin/login y valida middleware.ts.
 */
const SESSION_COOKIE = 'hr_admin_session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12;

function isValidSessionCookie(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [ts, sig] = parts;
  const ageMs = Date.now() - parseInt(ts, 10);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > SESSION_MAX_AGE_MS) return false;
  const expected = crypto.createHmac('sha256', secret).update(ts).digest('hex');
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  const secret = (process.env.ADMIN_SECRET ?? '').trim();
  if (!secret) {
    return NextResponse.json({ error: 'ADMIN_SECRET not configured' }, { status: 500 });
  }

  // (a) Bearer token
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (bearer && bearer === secret) return null;

  // (b) HR Admin session cookie
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
  if (isValidSessionCookie(sessionToken, secret)) return null;

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
