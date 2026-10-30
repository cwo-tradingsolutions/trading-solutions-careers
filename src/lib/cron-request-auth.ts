/**
 * Cron request checks. No Next.js types: callers pass the headers they have.
 * Bearer and X-Cron-Secret. The secret itself comes from hr-admin-secrets.
 */
import { readCronSecret } from "./hr-admin-secrets";
import { secretsEqual } from "./secret-compare";

export function timingSafeEqual(left: string, right: string): boolean {
  return secretsEqual(left, right);
}

/** X-Cron-Secret wins when IAP occupies Authorization. Otherwise Bearer. */
export function cronPresentedSecret(authorization: string | null, cronHeader: string | null): string {
  const custom = (cronHeader ?? "").trim();
  if (custom) return custom;
  const auth = authorization ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return "";
}

export function cronAuthorized(presented: string, secret: string | null): boolean {
  if (!secret || secret.length < 16 || !presented) return false;
  return timingSafeEqual(presented, secret);
}

export function cronRequestAuthorized(
  headers: { get(name: string): string | null },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const presented = cronPresentedSecret(headers.get("authorization"), headers.get("x-cron-secret"));
  return cronAuthorized(presented, readCronSecret(env));
}
