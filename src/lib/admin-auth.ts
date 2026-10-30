import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { secretsEqual } from './secret-compare';

/**
 * Admin auth — acepta DOS modos:
 *  (a) Authorization: Bearer <ADMIN_SECRET>     ← scripts / curl externos
 *  (b) Cookie hr_admin_session: <ts>.<hmac>    ← navegador HR Admin (12h)
 *
 * La cookie es la misma que setea /api/hr-admin/login y valida middleware.ts.
 */
const SESSION_COOKIE = 'hr_admin_session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12;

export type AdminAuthDecision = 'ok' | 'missing_secret' | 'unauthorized';

function isValidSessionCookie(token: string | undefined, secret: string, now: number): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [ts, sig] = parts;
  const issued = parseInt(ts, 10);
  const ageMs = now - issued;
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > SESSION_MAX_AGE_MS) return false;
  const expected = crypto.createHmac('sha256', secret).update(ts).digest('hex');
  return secretsEqual(expected, sig);
}

export function adminSessionDecision(input: {
  secret: string;
  authorizationHeader: string | null;
  sessionToken: string | undefined;
  now?: number;
}): AdminAuthDecision {
  const secret = input.secret.trim();
  if (!secret) return 'missing_secret';
  const now = input.now ?? Date.now();
  const auth = input.authorizationHeader;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (bearer && secretsEqual(bearer, secret)) return 'ok';
  if (isValidSessionCookie(input.sessionToken, secret, now)) return 'ok';
  return 'unauthorized';
}

export function adminAuthResponse(decision: AdminAuthDecision): NextResponse | null {
  if (decision === 'ok') return null;
  if (decision === 'missing_secret') {
    return NextResponse.json({ error: 'ADMIN_SECRET not configured' }, { status: 500 });
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  return adminAuthResponse(adminSessionDecision({
    secret: process.env.ADMIN_SECRET ?? '',
    authorizationHeader: req.headers.get('authorization'),
    sessionToken: req.cookies.get(SESSION_COOKIE)?.value,
  }));
}
