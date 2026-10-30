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

export function logSessionSecretFailure(env: NodeJS.ProcessEnv = process.env): string | null {
  const problem = sessionSecretFailure(env);
  if (!problem) return null;
  console.error(`${SESSION_SECRET_FATAL_LOG}: ${problem}`);
  return problem;
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

/** Cloud Run sets K_SERVICE. Vercel sets VERCEL and VERCEL_ENV. IAP stays off on Vercel. */
export function iapAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.VERCEL ?? "").trim() || (env.VERCEL_ENV ?? "").trim()) return false;
  return Boolean((env.K_SERVICE ?? "").trim());
}

