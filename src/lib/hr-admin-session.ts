import crypto from "crypto";
import {
  emailFromToken,
  emailToToken,
  HR_ADMIN_SESSION_COOKIE,
  HR_ADMIN_SESSION_MAX_AGE_MS,
  HR_ADMIN_SESSION_MAX_AGE_SEC,
  sessionIssuedAtOk,
  sessionSigningInput,
} from "./hr-admin-session-format";

export {
  HR_ADMIN_SESSION_COOKIE,
  HR_ADMIN_SESSION_MAX_AGE_MS,
  HR_ADMIN_SESSION_MAX_AGE_SEC,
};

export type AdminSession = { issuedAt: number; email: string | null };

function hmacHex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function signatureMatches(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** Every session carries an email. A cookie without one is not signed here. */
export function signAdminSession(secret: string, email: string, now = Date.now()): string {
  const emailToken = emailToToken(email);
  if (!emailToken) throw new Error("hr admin session requires an email");
  const ts = String(now);
  const payload = `${ts}.${emailToken}`;
  return `${payload}.${hmacHex(secret, payload)}`;
}

export function readAdminSession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): AdminSession | null {
  if (!token || !secret) return null;
  const parsed = sessionSigningInput(token);
  if (!parsed || !sessionIssuedAtOk(parsed.issuedAt, now)) return null;
  if (!signatureMatches(hmacHex(secret, parsed.payload), parsed.signature)) return null;
  if (!parsed.emailToken) return null;
  const email = emailFromToken(parsed.emailToken);
  if (!email) return null;
  return { issuedAt: parsed.issuedAt, email };
}
