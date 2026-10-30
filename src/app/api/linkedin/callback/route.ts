/**
 * GET /api/linkedin/callback
 * LinkedIn redirige aquí después del consentimiento.
 * Intercambia el code por un access_token.
 * El CSRF state es auto-verificable vía HMAC (no depende de cookies).
 */
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForToken } from "@/lib/linkedin";
import { verifyState } from "@/lib/linkedin-state";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.json(
      { error, description: url.searchParams.get("error_description") },
      { status: 400 }
    );
  }
  if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 500 });
  }

  const check = verifyState(state);
  if (!check.ok) {
    return NextResponse.json(
      {
        error: "state_invalid",
        reason: check.reason,
        hint:
          "Vuelve a iniciar en /api/linkedin/auth. El state es válido por 10 minutos.",
      },
      { status: 400 }
    );
  }

  const origin = `${url.protocol}//${url.host}`;
  try {
    const token = await exchangeCodeForToken(
      {
        clientId,
        clientSecret,
        redirectUri: `${origin}/api/linkedin/callback`,
        companyId: process.env.LINKEDIN_COMPANY_ID ?? "",
        scope: [],
      },
      code
    );

    const res = NextResponse.redirect(`${origin}/hr-admin?li=connected`);
    // Guardar el access token en cookie httpOnly.
    const isHttps = url.protocol === "https:";
    res.headers.append(
      "Set-Cookie",
      [
        `li_access_token=${encodeURIComponent(token.accessToken)}`,
        "Path=/",
        "HttpOnly",
        isHttps ? "Secure" : "",
        "SameSite=Lax",
        `Max-Age=${Math.min(token.expiresIn, 60 * 60 * 24 * 30)}`,
      ]
        .filter(Boolean)
        .join("; ")
    );
    return res;
  } catch (e: unknown) {
    console.error("linkedin callback", e);
    return NextResponse.json({ error: "token_exchange_failed" }, { status: 500 });
  }
}
