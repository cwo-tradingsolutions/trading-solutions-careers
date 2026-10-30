import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "./admin-auth";
import { googleOAuthBaseUrl, googleOAuthRedirectUri } from "./google-oauth-env";
import { mailboxAllowlistDecision, userInfoEmailVerified } from "./google-mailbox-allowlist";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  oauthStateCookieOptions,
  oauthStateKey,
  oauthStatesMatch,
  openOAuthState,
} from "./google-oauth-state";

const GENERIC_ERROR = "gmail_error=denied";

export type GoogleTokenBundle = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

export type GoogleUserInfo = {
  email?: string;
  verified_email?: boolean;
  email_verified?: boolean;
};

export type GoogleOAuthCallbackDeps = {
  saveTokens: (tokens: {
    email: string;
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  }) => Promise<void>;
  exchangeCode: (args: { code: string; redirectUri: string }) => Promise<GoogleTokenBundle>;
  fetchUserInfo: (accessToken: string) => Promise<GoogleUserInfo>;
};

function callbackBase(req: NextRequest): string {
  return googleOAuthBaseUrl({
    vercelEnv: process.env.VERCEL_ENV,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    forwardedHost: req.headers.get("x-forwarded-host"),
    host: req.headers.get("host"),
    forwardedProto: req.headers.get("x-forwarded-proto"),
    vercelUrl: process.env.VERCEL_URL,
  });
}

function backToAdmin(baseUrl: string, query: string) {
  const res = NextResponse.redirect(`${baseUrl}/hr-admin?${query}`);
  res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", oauthStateCookieOptions(0));
  return res;
}

export async function handleGoogleOAuthCallback(
  req: NextRequest,
  deps: GoogleOAuthCallbackDeps,
): Promise<NextResponse> {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const baseUrl = callbackBase(req);
  if (!baseUrl) {
    return NextResponse.json(
      { error: "No se pudo armar el redirect_uri del preview (falta el host y VERCEL_URL)." },
      { status: 500 },
    );
  }

  const secret = (process.env.ADMIN_SECRET ?? "").trim();
  const sessionToken = req.cookies.get("hr_admin_session")?.value;
  const sealed = req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const provided = req.nextUrl.searchParams.get("state");
  const expected = openOAuthState(sealed, oauthStateKey(sessionToken, secret));
  if (!oauthStatesMatch(expected, provided)) {
    return backToAdmin(baseUrl, GENERIC_ERROR);
  }

  const code = req.nextUrl.searchParams.get("code");
  if (req.nextUrl.searchParams.get("error") || !code) {
    return backToAdmin(baseUrl, GENERIC_ERROR);
  }

  const redirectUri = googleOAuthRedirectUri(baseUrl);

  try {
    const tokens = await deps.exchangeCode({ code, redirectUri });
    if (!tokens.refresh_token || !tokens.access_token) {
      return backToAdmin(baseUrl, GENERIC_ERROR);
    }

    const user = await deps.fetchUserInfo(tokens.access_token);
    const allowed = mailboxAllowlistDecision(
      user.email,
      userInfoEmailVerified(user),
      process.env.GOOGLE_MAILBOX_ALLOWED_EMAILS,
    );
    if (allowed !== "ok" || !user.email) {
      return backToAdmin(baseUrl, GENERIC_ERROR);
    }

    await deps.saveTokens({
      email: user.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      scope: tokens.scope ?? "",
    });

    return backToAdmin(baseUrl, "gmail_connected=1");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("google_oauth_tokens_env no existe")) {
      console.error("google oauth callback: preview token table missing");
    } else {
      console.error("google oauth callback failed");
    }
    return backToAdmin(baseUrl, GENERIC_ERROR);
  }
}
