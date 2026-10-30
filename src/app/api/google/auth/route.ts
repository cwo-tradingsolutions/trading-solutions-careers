/**
 * GET /api/google/auth
 *
 * Inicia el flujo OAuth con Google. Solo una sesión de HR Admin puede
 * empezarlo. El state viaja en la URL y en una cookie httpOnly de 10 minutos
 * atada a esa sesión. El callback lo compara en tiempo constante.
 *
 * Scopes solicitados:
 *   - gmail.compose: crear drafts (incluye gmail.send implícito) — para que HR
 *     pueda revisar el correo antes de enviar
 *   - email: identificar su correo (jointheteam@tradingsolutions.com)
 *   - calendar + calendar.events: crear el evento con Google Meet
 *
 * Después del consent, Google redirige a /api/google/callback?code=...&state=...
 *
 * En preview el redirect_uri sale del host del request (o de VERCEL_URL).
 * No usa NEXT_PUBLIC_APP_URL, que apunta a producción.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { GOOGLE_OAUTH_SCOPES } from "@/lib/google-scopes";
import { googleOAuthBaseUrl, googleOAuthRedirectUri } from "@/lib/google-oauth-env";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  createOAuthState,
  oauthStateCookieOptions,
  oauthStateKey,
  sealOAuthState,
} from "@/lib/google-oauth-state";

export const runtime = "nodejs";

const SCOPES = GOOGLE_OAUTH_SCOPES;

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID no configurado en Vercel" },
      { status: 500 }
    );
  }

  const baseUrl = googleOAuthBaseUrl({
    vercelEnv: process.env.VERCEL_ENV,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    forwardedHost: req.headers.get("x-forwarded-host"),
    host: req.headers.get("host"),
    forwardedProto: req.headers.get("x-forwarded-proto"),
    vercelUrl: process.env.VERCEL_URL,
  });
  if (!baseUrl) {
    return NextResponse.json(
      { error: "No se pudo armar el redirect_uri del preview (falta el host y VERCEL_URL)." },
      { status: 500 }
    );
  }
  const redirectUri = googleOAuthRedirectUri(baseUrl);
  const state = createOAuthState();
  const secret = (process.env.ADMIN_SECRET ?? "").trim();
  const sessionToken = req.cookies.get("hr_admin_session")?.value;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const res = NextResponse.redirect(authUrl);
  res.cookies.set(
    GOOGLE_OAUTH_STATE_COOKIE,
    sealOAuthState(state, oauthStateKey(sessionToken, secret)),
    oauthStateCookieOptions(),
  );
  return res;
}
