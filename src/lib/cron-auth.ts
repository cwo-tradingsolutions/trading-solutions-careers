import { secretsEqual } from "./secret-compare";

export const CRON_SECRET_MIN_LENGTH = 16;

/**
 * Minimal readCronSecret for this branch. #29 does not land cron-auth.ts.
 * The single source after integration is readCronSecret in hr-admin-secrets.ts.
 * That list already has ADMIN_SECRET, ADMIN_SCRIPTS_SECRET, HR_ADMIN_SESSION_SECRET,
 * and PORTAL_TOKEN_SECRET. Add WXM_SERVICE_SECRET there, then import
 * readCronSecret from hr-admin-secrets instead of this file.
 * HTTP helpers live in cron-request-auth.ts so this file stays free of the Next server runtime.
 */
const DISTINCT_FROM = [
  "ADMIN_SECRET",
  "ADMIN_SCRIPTS_SECRET",
  "HR_ADMIN_SESSION_SECRET",
  "PORTAL_TOKEN_SECRET",
  "WXM_SERVICE_SECRET",
] as const;

/** True when value is not the same string as any other configured secret. */
export function secretIsDistinct(value: string, others: string[]): boolean {
  for (const other of others) {
    const candidate = other.trim();
    if (!candidate || candidate.length !== value.length) continue;
    if (secretsEqual(candidate, value)) return false;
  }
  return true;
}

/** Null when missing, shorter than 16 characters, or equal to another auth secret. */
export function readCronSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = (env.CRON_SECRET ?? "").trim();
  if (value.length < CRON_SECRET_MIN_LENGTH) return null;
  const others = DISTINCT_FROM.map((name) => env[name] ?? "");
  if (!secretIsDistinct(value, others)) return null;
  return value;
}
