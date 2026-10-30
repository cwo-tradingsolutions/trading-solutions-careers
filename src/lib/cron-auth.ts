import { secretsEqual } from "./secret-compare";

export const CRON_SECRET_MIN_LENGTH = 16;

/** Bearer CRON_SECRET, or X-Cron-Secret when IAP occupies Authorization. */
export function cronPresentedSecret(header: string | null, customHeader: string | null): string {
  const custom = (customHeader ?? "").trim();
  if (custom) return custom;
  const auth = header ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return "";
}

const OTHER_SECRETS = ["ADMIN_SECRET", "HR_ADMIN_SESSION_SECRET", "ADMIN_SCRIPTS_SECRET", "WXM_SERVICE_SECRET"] as const;

/** True when value is not the same string as any other configured secret. */
export function secretIsDistinct(value: string, others: string[]): boolean {
  for (const other of others) {
    const candidate = other.trim();
    if (!candidate || candidate.length !== value.length) continue;
    if (secretsEqual(candidate, value)) return false;
  }
  return true;
}

/**
 * CRON_SECRET for this app. Null when it is missing, shorter than 16 characters,
 * or equal to another auth secret. hr-admin-secrets.ts is left for the #29 integration.
 */
export function readCronSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = (env.CRON_SECRET ?? "").trim();
  if (value.length < CRON_SECRET_MIN_LENGTH) return null;
  const others = OTHER_SECRETS.map((name) => env[name] ?? "");
  if (!secretIsDistinct(value, others)) return null;
  return value;
}

export function cronAuthorized(presented: string, secret: string | null): boolean {
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH || !presented) return false;
  return secretsEqual(presented, secret);
}
