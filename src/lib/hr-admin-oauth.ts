import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import {
  assertGoogleIdClaims,
  HR_ADMIN_HOSTED_DOMAIN,
  safeAdminNext,
  type IdentityClaims,
  type IdentityDecision,
} from "./hr-admin-access";

export const HR_ADMIN_OAUTH_COOKIE = "hr_admin_oauth";
export const HR_ADMIN_OAUTH_MAX_AGE_SEC = 10 * 60;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export type OAuthTransaction = {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
  exp: number;
};

export function readConfiguredAppUrl(): string | undefined {
  const key = "NEXT_PUBLIC_APP_URL";
  const fromRuntime = process.env[key];
  if (typeof fromRuntime === "string" && fromRuntime.trim()) return fromRuntime.trim();
  // Webpack inlines the member access from the build. Cloud Run images get the
  // value that way (build-arg), Vercel from the project env at build and runtime.
  const inlined = process.env.NEXT_PUBLIC_APP_URL;
  if (typeof inlined === "string" && inlined.trim()) return inlined.trim();
  return undefined;
}

/** `${NEXT_PUBLIC_APP_URL}/api/hr-admin/login/google/callback`, or null if the URL is unusable. */
export function adminOAuthRedirectUri(appUrl: string | undefined | null): string | null {
  const raw = (appUrl ?? "").trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  return `${url.origin}/api/hr-admin/login/google/callback`;
}

export function adminPublicOrigin(appUrl: string | undefined | null): string | null {
  const redirectUri = adminOAuthRedirectUri(appUrl);
  if (!redirectUri) return null;
  return new URL(redirectUri).origin;
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function googleAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    nonce: opts.nonce,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    hd: HR_ADMIN_HOSTED_DOMAIN,
    prompt: "select_account",
    access_type: "online",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function signOAuthTransaction(secret: string, tx: OAuthTransaction): string {
  const body = Buffer.from(JSON.stringify(tx), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function readOAuthTransaction(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): OAuthTransaction | null {
  if (!token || !secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(sig);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isTransaction(parsed) || parsed.exp <= now) return null;
  return { ...parsed, next: safeAdminNext(parsed.next) };
}

export async function exchangeAuthCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  verifier: string;
}): Promise<string> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
    code_verifier: opts.verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as { id_token?: unknown } | null;
  if (!res.ok || !json || typeof json.id_token !== "string" || json.id_token.length === 0) {
    throw new Error("token_exchange_failed");
  }
  return json.id_token;
}

/** Signature, iss, aud, and exp against Google's certificates. Callers still apply our policy. */
export async function verifyGoogleIdToken(idToken: string, audience: string): Promise<IdentityClaims> {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("empty_id_token");
  return {
    iss: payload.iss,
    aud: payload.aud,
    exp: payload.exp,
    email: payload.email,
    email_verified: payload.email_verified,
    hd: payload.hd,
    nonce: payload.nonce,
  };
}

export function decideGoogleAdmin(
  claims: IdentityClaims,
  opts: { audience: string; allowlist: readonly string[]; now: number; nonce: string },
): IdentityDecision {
  return assertGoogleIdClaims(claims, opts);
}

function isTransaction(value: unknown): value is OAuthTransaction {
  if (!value || typeof value !== "object") return false;
  const tx = value as OAuthTransaction;
  return (
    typeof tx.state === "string" &&
    tx.state.length >= 20 &&
    typeof tx.nonce === "string" &&
    tx.nonce.length >= 20 &&
    typeof tx.verifier === "string" &&
    tx.verifier.length >= 43 &&
    tx.verifier.length <= 128 &&
    typeof tx.next === "string" &&
    typeof tx.exp === "number" &&
    Number.isFinite(tx.exp)
  );
}
