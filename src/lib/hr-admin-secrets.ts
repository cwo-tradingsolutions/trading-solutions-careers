/**
 * HR Admin secrets are not interchangeable.
 *
 * HR_ADMIN_SESSION_SECRET signs the browser session and the OAuth state cookie.
 * ADMIN_SECRET is only the vault password for POST /api/hr-admin/login when the
 * break-glass flag is on. ADMIN_SCRIPTS_SECRET is only for the one-shot scripts.
 */

export const HR_ADMIN_BREAK_GLASS_EMAIL = "break-glass@tradingsolutions.com";

export const MIN_AUTH_SECRET_LENGTH = 16;

export function readSessionSecret(): string | null {
  return readLongSecret(process.env.HR_ADMIN_SESSION_SECRET);
}

export function readScriptsSecret(): string | null {
  return readLongSecret(process.env.ADMIN_SCRIPTS_SECRET);
}

/** Cloud Run sets K_SERVICE. Vercel sets VERCEL and VERCEL_ENV. IAP stays off on Vercel. */
export function iapAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.VERCEL ?? "").trim() || (env.VERCEL_ENV ?? "").trim()) return false;
  return Boolean((env.K_SERVICE ?? "").trim());
}

function readLongSecret(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (value.length < MIN_AUTH_SECRET_LENGTH) return null;
  return value;
}
