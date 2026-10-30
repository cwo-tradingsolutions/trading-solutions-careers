/**
 * GET /api/hr-admin/login/google
 *
 * Starts the authorization-code flow with PKCE, state, and nonce.
 * The redirect URI comes from NEXT_PUBLIC_APP_URL, not from the request host.
 */
import { NextRequest, NextResponse } from "next/server";
import { safeAdminNext } from "@/lib/hr-admin-access";
import { noStore, setOAuthCookie } from "@/lib/hr-admin-cookies";
import {
  adminOAuthRedirectUri,
  adminPublicOrigin,
  googleAuthorizeUrl,
  HR_ADMIN_OAUTH_MAX_AGE_SEC,
  pkceChallenge,
  randomToken,
  readConfiguredAppUrl,
  signOAuthTransaction,
} from "@/lib/hr-admin-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loginUrl(req: NextRequest, error: string): URL {
  const origin = adminPublicOrigin(readConfiguredAppUrl()) ?? req.nextUrl.origin;
  const url = new URL("/hr-admin/login", origin);
  url.searchParams.set("error", error);
  return url;
}

export async function GET(req: NextRequest) {
  const secret = (process.env.ADMIN_SECRET ?? "").trim();
  const clientId = (process.env.GOOGLE_ADMIN_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_ADMIN_OAUTH_CLIENT_SECRET ?? "").trim();
  const redirectUri = adminOAuthRedirectUri(readConfiguredAppUrl());
  if (!secret || secret.length < 6 || !clientId || !clientSecret || !redirectUri) {
    return noStore(NextResponse.redirect(loginUrl(req, "config")));
  }

  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();
  const next = safeAdminNext(req.nextUrl.searchParams.get("next"));
  const tx = signOAuthTransaction(secret, {
    state,
    nonce,
    verifier,
    next,
    exp: Date.now() + HR_ADMIN_OAUTH_MAX_AGE_SEC * 1000,
  });

  const destination = googleAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    nonce,
    codeChallenge: pkceChallenge(verifier),
  });
  const res = NextResponse.redirect(destination);
  setOAuthCookie(res, tx);
  return noStore(res);
}
