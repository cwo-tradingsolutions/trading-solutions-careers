import crypto from "crypto";
import { secretsEqual } from "./secret-compare";

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_OAUTH_STATE_TTL_SECONDS = 10 * 60;

export function createOAuthState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Bind the random state to this admin session. Bearer-only callers use ADMIN_SECRET. */
export function oauthStateKey(sessionToken: string | undefined, adminSecret: string): string {
  if (sessionToken) return sessionToken;
  return adminSecret;
}

export function sealOAuthState(state: string, key: string, now = Date.now()): string {
  const exp = String(now + GOOGLE_OAUTH_STATE_TTL_SECONDS * 1000);
  const payload = `${state}.${exp}`;
  const mac = crypto.createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function openOAuthState(sealed: string | undefined, key: string, now = Date.now()): string | null {
  if (!sealed || !key) return null;
  const parts = sealed.split(".");
  if (parts.length !== 3) return null;
  const [state, exp, mac] = parts;
  const expiresAt = Number(exp);
  if (!state || !Number.isFinite(expiresAt) || now >= expiresAt) return null;
  const expected = crypto.createHmac("sha256", key).update(`${state}.${exp}`).digest("base64url");
  if (!secretsEqual(mac, expected)) return null;
  return state;
}

export function oauthStatesMatch(expected: string | null, provided: string | null): boolean {
  if (!expected || !provided) return false;
  return secretsEqual(expected, provided);
}

export function oauthStateCookieOptions(maxAge = GOOGLE_OAUTH_STATE_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/api/google",
    maxAge,
  };
}
