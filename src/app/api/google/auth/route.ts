/**
 * GET /api/google/auth
 *
 * Inicia el flujo OAuth con Google. Redirige a la pantalla de consentimiento
 * de Google donde Kelly autoriza al ATS a enviar correos en su nombre.
 *
 * Scopes solicitados:
 *   - gmail.compose: crear drafts (incluye gmail.send implícito) — para que HR
 *     pueda revisar el correo antes de enviar
 *   - email: identificar su correo (jointheteam@tradingsolutions.com)
 *   - calendar + calendar.events: crear el evento con Google Meet
 *     (calendar.events se sumó para la invitación a entrevista; el token
 *     viejo no lo trae hasta que jointheteam@ vuelva a pasar por aquí)
 *
 * Después del consent, Google redirige a /api/google/callback?code=...
 */
import { NextResponse } from "next/server";
import { GOOGLE_OAUTH_SCOPES } from "@/lib/google-scopes";

export const runtime = "nodejs";

const SCOPES = GOOGLE_OAUTH_SCOPES;

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID no configurado en Vercel" },
      { status: 500 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";
  const redirectUri = `${baseUrl}/api/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // crítico — sin esto no recibimos refresh_token
    prompt: "consent", // forzar pantalla consent para garantizar refresh_token nuevo
    include_granted_scopes: "true",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}
