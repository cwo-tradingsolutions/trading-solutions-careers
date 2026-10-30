/**
 * GET /api/hr-admin/login/google/callback
 *
 * Exchanges the code, verifies the ID token, then sets hr_admin_session.
 * The browser is sent only to a relative /hr-admin path on NEXT_PUBLIC_APP_URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { parseAllowlist, safeAdminNext } from "@/lib/hr-admin-access";
import { clearOAuthCookie, cookieIsSecure, noStore, setSessionCookie } from "@/lib/hr-admin-cookies";
import {
  adminPublicOrigin,
  decideGoogleAdmin,
  exchangeAuthCode,
  HR_ADMIN_OAUTH_COOKIE,
  readConfiguredAppUrl,
  readOAuthTransaction,
  verifyGoogleIdToken,
  adminOAuthRedirectUri,
} from "@/lib/hr-admin-oauth";
import { signAdminSession } from "@/lib/hr-admin-session";
import { readSessionSecret } from "@/lib/hr-admin-secrets";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function finish(req: NextRequest, error: string | null, nextPath: string, session: string | null): NextResponse {
  const origin = adminPublicOrigin(readConfiguredAppUrl()) ?? req.nextUrl.origin;
  const safeNext = safeAdminNext(nextPath);
  const dest = new URL(error ? "/hr-admin/login" : safeNext, origin);
  if (dest.origin !== origin) {
    dest.pathname = "/hr-admin";
    dest.search = "";
  }
  if (error) {
    dest.searchParams.set("error", error);
    if (safeNext !== "/hr-admin") dest.searchParams.set("next", safeNext);
  }
  const secure = cookieIsSecure(req);
  const res = NextResponse.redirect(dest);
  clearOAuthCookie(res, secure);
  if (session) setSessionCookie(res, session, secure);
  return noStore(res);
}

export async function GET(req: NextRequest) {
  const secret = readSessionSecret();
  if (!secret) return finish(req, "config", "/hr-admin", null);

  if (req.nextUrl.searchParams.get("error")) return finish(req, "google", "/hr-admin", null);

  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const tx = readOAuthTransaction(req.cookies.get(HR_ADMIN_OAUTH_COOKIE)?.value, secret);
  if (!tx || !code || !state || !sameToken(state, tx.state)) {
    return finish(req, "state", tx?.next ?? "/hr-admin", null);
  }

  const clientId = (process.env.GOOGLE_ADMIN_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_ADMIN_OAUTH_CLIENT_SECRET ?? "").trim();
  const redirectUri = adminOAuthRedirectUri(readConfiguredAppUrl());
  if (!clientId || !clientSecret || !redirectUri) return finish(req, "config", tx.next, null);

  try {
    const idToken = await exchangeAuthCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
      verifier: tx.verifier,
    });
    const claims = await verifyGoogleIdToken(idToken, clientId);
    const decision = decideGoogleAdmin(claims, {
      audience: clientId,
      allowlist: parseAllowlist(process.env.HR_ADMIN_ALLOWED_EMAILS),
      now: Date.now(),
      nonce: tx.nonce,
    });
    if (!decision.ok) {
      console.warn(`[hr-admin] google sign-in denied: ${decision.reason}`);
      return finish(req, "not_allowed", tx.next, null);
    }
    return finish(req, null, tx.next, signAdminSession(secret, decision.email));
  } catch {
    console.warn("[hr-admin] google sign-in failed");
    return finish(req, "google", tx.next, null);
  }
}
