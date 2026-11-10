/**
 * Ambiente del token de Google.
 *
 * Producción (y cualquier VERCEL_ENV que no sea preview ni development,
 * incluido cuando la variable no está) sigue en la fila singleton
 * google_oauth_tokens id = 1. preview y development no leen esa fila.
 */

export type GoogleOAuthEnvironment = "production" | "preview" | "development";

export const PREVIEW_GOOGLE_CONNECT_LABEL = "Conecta Google para preview";

/**
 * Hostname estable del branch feat/ats-invitar-entrevista en Vercel
 * (alias del deployment, no la URL que cambia en cada push).
 * Hay que agregarla tal cual en el cliente OAuth de Google. Esta lista
 * no se manda a la consola desde el código.
 */
export const PREVIEW_OAUTH_REDIRECT_URIS = [
  "https://trading-solutions-careers-git-f-a9e564-kellys-projects-ba26f62b.vercel.app/api/google/callback",
] as const;

const PRODUCTION_APP_FALLBACK = "https://trading-solutions-careers.vercel.app";

export function googleOAuthEnvironment(vercelEnv: string | undefined): GoogleOAuthEnvironment {
  if (vercelEnv === "preview") return "preview";
  if (vercelEnv === "development") return "development";
  return "production";
}

/** true solo para la fila compartida de producción. preview nunca entra acá. */
export function usesProductionGoogleToken(vercelEnv: string | undefined): boolean {
  return googleOAuthEnvironment(vercelEnv) === "production";
}

export type OAuthUrlInput = {
  vercelEnv: string | undefined;
  appUrl?: string | null;
  forwardedHost?: string | null;
  host?: string | null;
  forwardedProto?: string | null;
  vercelUrl?: string | null;
};

function firstHeaderValue(value: string | null | undefined): string {
  return (value || "").split(",")[0].trim();
}

/** Host de un header o de VERCEL_URL. Rechaza cualquier cosa con path o espacios. */
export function safeOAuthHost(value: string | null | undefined): string | null {
  const host = firstHeaderValue(value);
  if (!host) return null;
  if (!/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host)) return null;
  return host;
}

function safeProto(value: string | null | undefined, host: string): "http" | "https" {
  const proto = firstHeaderValue(value).toLowerCase();
  if (proto === "http" || proto === "https") return proto;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return "http";
  return "https";
}

function vercelHost(vercelUrl: string | null | undefined): string | null {
  const raw = (vercelUrl || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return safeOAuthHost(raw);
}

/**
 * Origen del redirect_uri.
 *
 * Producción: NEXT_PUBLIC_APP_URL, o el fallback histórico. No mira el host
 * del request: es el mismo cálculo de antes.
 *
 * preview y development: host del request (x-forwarded-host, después host)
 * y, si no hay, VERCEL_URL. Nunca NEXT_PUBLIC_APP_URL. Si no hay ninguno,
 * devuelve "" para que la ruta no arme el callback de producción.
 */
export function googleOAuthBaseUrl(input: OAuthUrlInput): string {
  if (usesProductionGoogleToken(input.vercelEnv)) {
    return input.appUrl || PRODUCTION_APP_FALLBACK;
  }
  const host = safeOAuthHost(input.forwardedHost) || safeOAuthHost(input.host);
  if (host) return `${safeProto(input.forwardedProto, host)}://${host}`;
  const fromVercel = vercelHost(input.vercelUrl);
  if (fromVercel) return `https://${fromVercel}`;
  return "";
}

export function googleOAuthRedirectUri(baseUrl: string): string {
  return `${baseUrl}/api/google/callback`;
}
