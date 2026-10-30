/**
 * HR Admin secrets are not interchangeable.
 *
 * This is the single readCronSecret (#29). WXM_SERVICE_SECRET is in the
 * distinctness list. Unset names do not fail the check.
 */

export const MIN_AUTH_SECRET_LENGTH = 16;

export const AUTH_SECRET_NAMES = [
  "HR_ADMIN_SESSION_SECRET",
  "ADMIN_SECRET",
  "ADMIN_SCRIPTS_SECRET",
  "PORTAL_TOKEN_SECRET",
  "WXM_SERVICE_SECRET",
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

/** Null when unset, shorter than 16 characters, or equal to another auth secret. */
export function readCronSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = (env.CRON_SECRET ?? "").trim();
  if (value.length < MIN_AUTH_SECRET_LENGTH) return null;
  if (!secretIsDistinct("CRON_SECRET", env)) return null;
  return value;
}
