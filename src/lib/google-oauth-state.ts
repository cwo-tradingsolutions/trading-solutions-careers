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

export function sealOAuthState(state: string, key: string): string {
  const mac = crypto.createHmac("sha256", key).update(state).digest("base64url");
  return `${state}.${mac}`;
}

export function openOAuthState(sealed: string | undefined, key: string): string | null {
  if (!sealed || !key) return null;
  const dot = sealed.lastIndexOf(".");
  if (dot <= 0) return null;
  const state = sealed.slice(0, dot);
  const mac = sealed.slice(dot + 1);
  const expected = crypto.createHmac("sha256", key).update(state).digest("base64url");
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
