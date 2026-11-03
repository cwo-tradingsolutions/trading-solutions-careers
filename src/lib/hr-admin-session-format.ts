/**
 * Cookie hr_admin_session, shared by the Node verifier and the Edge middleware.
 *
 * Legacy (password / scripts): `<issuedAt>.<hmac>`
 * Google and IAP: `<issuedAt>.<base64url(email)>.<hmac>`
 *
 * The HMAC covers the whole prefix, so the email cannot be swapped.
 */

export const HR_ADMIN_SESSION_COOKIE = "hr_admin_session";
export const HR_ADMIN_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
export const HR_ADMIN_SESSION_MAX_AGE_SEC = 8 * 60 * 60;

const HEX = /^[0-9a-f]+$/i;
const B64URL = /^[A-Za-z0-9_-]+$/;

export type SessionSigningInput = {
  payload: string;
  signature: string;
  issuedAt: number;
  emailToken: string | null;
};

export function sessionSigningInput(token: string): SessionSigningInput | null {
  const parts = token.split(".");
  if (parts.length === 2) {
    const [ts, signature] = parts;
    if (!/^\d+$/.test(ts) || !HEX.test(signature)) return null;
    return { payload: ts, signature, issuedAt: Number(ts), emailToken: null };
  }
  if (parts.length === 3) {
    const [ts, emailToken, signature] = parts;
    if (!/^\d+$/.test(ts) || !B64URL.test(emailToken) || !HEX.test(signature)) return null;
    return { payload: `${ts}.${emailToken}`, signature, issuedAt: Number(ts), emailToken };
  }
  return null;
}

/** Inclusive of the 8h boundary. A future timestamp is rejected. */
export function sessionIssuedAtOk(issuedAt: number, now: number): boolean {
  if (!Number.isFinite(issuedAt) || !Number.isFinite(now)) return false;
  const age = now - issuedAt;
  return age >= 0 && age <= HR_ADMIN_SESSION_MAX_AGE_MS;
}

export function emailToToken(email: string): string {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function emailFromToken(emailToken: string): string | null {
  try {
    const pad = emailToken.length % 4 === 0 ? "" : "=".repeat(4 - (emailToken.length % 4));
    const b64 = emailToken.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const email = new TextDecoder().decode(bytes).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null;
    return email;
  } catch {
    return null;
  }
}
