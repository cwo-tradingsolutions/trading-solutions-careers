/**
 * GET /api/google/callback
 *
 * Recibe el ?code de Google después del consent, lo intercambia por
 * access_token + refresh_token, identifica el email del usuario y guarda
 * el token del ambiente actual (VERCEL_ENV).
 *
 * Producción escribe la fila singleton id=1. preview y development escriben
 * google_oauth_tokens_env y no tocan esa fila.
 *
 * En preview el redirect_uri se calcula del host del request (o VERCEL_URL),
 * el mismo origen con el que se armó /api/google/auth. No usa
 * NEXT_PUBLIC_APP_URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { saveTokens } from "@/lib/gmail";
import { googleOAuthBaseUrl, googleOAuthRedirectUri } from "@/lib/google-oauth-env";

export const runtime = "nodejs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

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
  return NextResponse.redirect(`${baseUrl}/hr-admin?${query}`);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const baseUrl = callbackBase(req);
  if (!baseUrl) {
    return NextResponse.json(
      { error: "No se pudo armar el redirect_uri del preview (falta el host y VERCEL_URL)." },
      { status: 500 }
    );
  }

  if (error) {
    return backToAdmin(baseUrl, `gmail_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return backToAdmin(baseUrl, "gmail_error=no_code");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return backToAdmin(baseUrl, "gmail_error=missing_credentials");
  }

  const redirectUri = googleOAuthRedirectUri(baseUrl);

  try {
    // Exchange code → tokens
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("Token exchange failed:", t);
      return backToAdmin(baseUrl, "gmail_error=token_exchange_failed");
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
      token_type?: string;
    };

    if (!tokens.refresh_token) {
      // Esto pasa si Kelly ya autorizó antes y Google no manda refresh_token de nuevo.
      // La fix es revocar acceso en https://myaccount.google.com/permissions y reintentar.
      console.warn("No refresh_token received — usuario ya había autorizado antes");
      return backToAdmin(baseUrl, "gmail_error=no_refresh_token_revoke_first");
    }

    // Identificar email del usuario
    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) {
      return backToAdmin(baseUrl, "gmail_error=userinfo_failed");
    }
    const user = (await userRes.json()) as { email: string; name?: string };

    await saveTokens({
      email: user.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      scope: tokens.scope ?? "",
    });

    return backToAdmin(baseUrl, `gmail_connected=${encodeURIComponent(user.email)}`);
  } catch (e) {
    console.error("Callback error:", e);
    const message = e instanceof Error ? e.message : "";
    if (message.includes("google_oauth_tokens_env no existe")) {
      return backToAdmin(baseUrl, "gmail_error=preview_token_table_missing");
    }
    return backToAdmin(baseUrl, "gmail_error=internal");
  }
}
