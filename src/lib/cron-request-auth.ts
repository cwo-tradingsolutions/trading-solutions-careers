import { CRON_SECRET_MIN_LENGTH } from "./cron-auth";
import { secretsEqual } from "./secret-compare";

/** Bearer CRON_SECRET, or X-Cron-Secret when IAP occupies Authorization. */
export function cronPresentedSecret(header: string | null, customHeader: string | null): string {
  const custom = (customHeader ?? "").trim();
  if (custom) return custom;
  const auth = header ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return "";
}

export function cronAuthorized(presented: string, secret: string | null): boolean {
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH || !presented) return false;
  return secretsEqual(presented, secret);
}
