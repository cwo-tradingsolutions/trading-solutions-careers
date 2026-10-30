/**
 * GET /api/google/callback
 *
 * Recibe el ?code de Google después del consent. Exige la sesión de HR Admin
 * y el state de /api/google/auth. Intercambia el code, lee el email verificado
 * y solo guarda el token si el email está en GOOGLE_MAILBOX_ALLOWED_EMAILS.
 * Si el env no está, o el email no coincide, no toca la fila id=1.
 *
 * Producción escribe la fila singleton id=1. preview y development escriben
 * google_oauth_tokens_env y no tocan esa fila.
 */
import { NextRequest } from "next/server";
import { saveTokens } from "@/lib/gmail";
import {
  handleGoogleOAuthCallback,
  type GoogleTokenBundle,
  type GoogleUserInfo,
} from "@/lib/google-oauth-flow";

export const runtime = "nodejs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

async function exchangeCode(args: { code: string; redirectUri: string }): Promise<GoogleTokenBundle> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("missing_credentials");
  }
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: args.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: args.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error("token_exchange_failed");
  }
  const tokens = (await tokenRes.json()) as GoogleTokenBundle;
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    scope: tokens.scope,
  };
}

async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const userRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) {
    throw new Error("userinfo_failed");
  }
  const user = (await userRes.json()) as GoogleUserInfo;
  return {
    email: user.email,
    verified_email: user.verified_email,
    email_verified: user.email_verified,
  };
}

export async function GET(req: NextRequest) {
  return handleGoogleOAuthCallback(req, {
    saveTokens,
    exchangeCode,
    fetchUserInfo,
  });
}
