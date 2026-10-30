/**
 * HR Admin secrets are not interchangeable.
 *
 * HR_ADMIN_SESSION_SECRET signs the browser session and the OAuth state cookie.
 * ADMIN_SECRET is only the vault password for POST /api/hr-admin/login when the
 * break-glass flag is on. ADMIN_SCRIPTS_SECRET is only for the one-shot scripts.
 */

export const HR_ADMIN_BREAK_GLASS_EMAIL = "break-glass@tradingsolutions.com";

export const MIN_AUTH_SECRET_LENGTH = 16;
export const MIN_PORTAL_SECRET_LENGTH = 32;

export const SESSION_SECRET_FATAL_LOG = "[hr-admin] FATAL";

export const AUTH_SECRET_NAMES = [
  "HR_ADMIN_SESSION_SECRET",
  "ADMIN_SECRET",
  "ADMIN_SCRIPTS_SECRET",
  "PORTAL_TOKEN_SECRET",
  "WXM_SERVICE_SECRET",
  // Optional. Unset does not fail startup. When set it must be 16+ characters
  // and different from the other names, or readCronSecret() refuses it.
  "CRON_SECRET",
] as const;

export type AuthSecretName = (typeof AUTH_SECRET_NAMES)[number];

export function collidingAuthSecrets(env: NodeJS.ProcessEnv = process.env): Array<[AuthSecretName, AuthSecretName]> {
  const entries = AUTH_SECRET_NAMES.map((name) => [name, (env[name] ?? "").trim()] as const).filter(([, value]) => value.length > 0);
  const hits: Array<[AuthSecretName, AuthSecretName]> = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[i][1] === entries[j][1]) hits.push([entries[i][0], entries[j][0]]);
    }
  }
  return hits;
}

export function secretIsDistinct(name: AuthSecretName, env: NodeJS.ProcessEnv = process.env): boolean {
  return !collidingAuthSecrets(env).some(([left, right]) => left === name || right === name);
}

/** Missing, too short, or equal to another auth secret. */
export function sessionSecretFailure(env: NodeJS.ProcessEnv = process.env): string | null {
  const session = (env.HR_ADMIN_SESSION_SECRET ?? "").trim();
  const admin = (env.ADMIN_SECRET ?? "").trim();
  if (session.length < MIN_AUTH_SECRET_LENGTH) {
    return "HR_ADMIN_SESSION_SECRET is missing or shorter than 16 characters";
  }
  if (admin.length > 0 && session === admin) {
    return "HR_ADMIN_SESSION_SECRET must not equal ADMIN_SECRET";
  }
  const collisions = collidingAuthSecrets(env).filter(([left, right]) => left === "HR_ADMIN_SESSION_SECRET" || right === "HR_ADMIN_SESSION_SECRET");
  if (collisions.length > 0) {
    return `Auth secrets must be distinct: ${collisions.map(([left, right]) => `${left} equals ${right}`).join("; ")}`;
  }
  return null;
}

export function portalSecretFailure(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = (env.PORTAL_TOKEN_SECRET ?? "").trim();
  if (value.length < MIN_PORTAL_SECRET_LENGTH) {
    return "PORTAL_TOKEN_SECRET is missing or shorter than 32 characters";
  }
  if (!secretIsDistinct("PORTAL_TOKEN_SECRET", env)) {
    return "PORTAL_TOKEN_SECRET must not equal another auth secret";
  }
  return null;
}

/**
 * Fixed cutover midnight. The legacy date cap is 14 days after this, not
 * "now", so a date past the cap never becomes valid on a later request.
 * The stored day ends at 23:59:59.999Z, so the last date that fits is 13
 * days after the reference (2026-11-12).
 */
export const PORTAL_LEGACY_REFERENCE_UTC = "2026-10-30";
export const PORTAL_LEGACY_MAX_DAYS = 14;
const PORTAL_LEGACY_CAP_MS =
  Date.parse(`${PORTAL_LEGACY_REFERENCE_UTC}T00:00:00.000Z`) + PORTAL_LEGACY_MAX_DAYS * 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function legacyPortalUntilMs(raw: string | undefined | null): number | null {
  const value = (raw ?? "").trim();
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const end = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  const check = new Date(end);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  if (end > PORTAL_LEGACY_CAP_MS) return null;
  return end;
}

/** A real calendar date past the cap, or an impossible ISO date. Placeholders and empty values are not fatal. */
export function legacyPortalDateFailure(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = (env.PORTAL_TOKEN_LEGACY_UNTIL ?? "").trim();
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return `PORTAL_TOKEN_LEGACY_UNTIL is not a real calendar date: ${value}`;
  }
  if (legacyPortalUntilMs(value) !== null) return null;
  return `PORTAL_TOKEN_LEGACY_UNTIL is more than 14 days after ${PORTAL_LEGACY_REFERENCE_UTC}`;
}

/**
 * Deploy check for the scheduled cron routes.
 * 500 when the value equals the session or portal secret.
 * 401 when it is missing, shorter than 16 characters, or equal to ADMIN_SECRET, the scripts secret, or WXM_SERVICE_SECRET.
 * Null when a cron bearer may be accepted.
 */
export function cronSecretHttpStatus(env: NodeJS.ProcessEnv = process.env): 401 | 500 | null {
  const value = (env.CRON_SECRET ?? "").trim();
  const session = (env.HR_ADMIN_SESSION_SECRET ?? "").trim();
  const portal = (env.PORTAL_TOKEN_SECRET ?? "").trim();
  if (value && ((session && value === session) || (portal && value === portal))) return 500;
  if (!readCronSecret(env)) return 401;
  return null;
}

/** Session signer, portal signer, or a legacy date past the cap. Unset cron does not. */
export function startupSecretFailure(env: NodeJS.ProcessEnv = process.env): string | null {
  return sessionSecretFailure(env) || portalSecretFailure(env) || legacyPortalDateFailure(env);
}

export function logStartupSecretFailure(env: NodeJS.ProcessEnv = process.env): string | null {
  const problem = startupSecretFailure(env);
  if (!problem) return null;
  console.error(`${SESSION_SECRET_FATAL_LOG}: ${problem}`);
  return problem;
}

/** True only for a live candidate-facing server. Never during `next build`. */
export function shouldExitOnStartupFailure(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NEXT_PHASE === "phase-production-build") return false;
  if (env.npm_lifecycle_event === "build") return false;
  return Boolean((env.K_SERVICE ?? "").trim()) || env.VERCEL_ENV === "production";
}

export function readSessionSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  if (sessionSecretFailure(env)) return null;
  return (env.HR_ADMIN_SESSION_SECRET ?? "").trim();
}

export function readScriptsSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = (env.ADMIN_SCRIPTS_SECRET ?? "").trim();
  if (value.length < MIN_AUTH_SECRET_LENGTH) return null;
  if (!secretIsDistinct("ADMIN_SCRIPTS_SECRET", env)) return null;
  return value;
}

export function readPortalSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = (env.PORTAL_TOKEN_SECRET ?? "").trim();
  if (value.length < MIN_PORTAL_SECRET_LENGTH) return null;
  if (!secretIsDistinct("PORTAL_TOKEN_SECRET", env)) return null;
  return value;
}

/**
 * Single source for CRON_SECRET. Null when unset, shorter than 16 characters,
 * or equal to ADMIN_SECRET, ADMIN_SCRIPTS_SECRET, HR_ADMIN_SESSION_SECRET,
 * PORTAL_TOKEN_SECRET, or WXM_SERVICE_SECRET. #30 and #32 import this.
 */
export function readCronSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = (env.CRON_SECRET ?? "").trim();
  if (value.length < MIN_AUTH_SECRET_LENGTH) return null;
  if (!secretIsDistinct("CRON_SECRET", env)) return null;
  return value;
}

/** Cloud Run sets K_SERVICE. Vercel sets VERCEL and VERCEL_ENV. IAP stays off on Vercel. */
export function iapAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.VERCEL ?? "").trim() || (env.VERCEL_ENV ?? "").trim()) return false;
  return Boolean((env.K_SERVICE ?? "").trim());
}

