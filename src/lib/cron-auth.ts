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

export function cronAuthorized(
  presented: string,
  secret: string | undefined,
): boolean {
  const expected = (secret ?? "").trim();
  if (expected.length < CRON_SECRET_MIN_LENGTH) return false;
  if (!presented) return false;
  return secretsEqual(presented, expected);
}
