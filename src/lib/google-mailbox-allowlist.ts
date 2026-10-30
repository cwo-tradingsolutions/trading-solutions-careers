/**
 * Mailbox that may replace the ATS Google token (row id = 1 in production).
 * GOOGLE_MAILBOX_ALLOWED_EMAILS is comma-separated. Unset, empty, or unverified
 * email fails closed and must not overwrite the stored token.
 * Expected production value: jointheteam@tradingsolutions.com
 */

export function mailboxAllowlistDecision(
  email: string | undefined,
  verified: boolean,
  raw: string | undefined,
): "ok" | "rejected" {
  if (!verified || !email || !email.trim()) return "rejected";
  if (raw == null || raw.trim() === "") return "rejected";
  const allowed = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return "rejected";
  return allowed.includes(email.trim().toLowerCase()) ? "ok" : "rejected";
}

export function userInfoEmailVerified(user: {
  verified_email?: boolean;
  email_verified?: boolean;
}): boolean {
  return user.verified_email === true || user.email_verified === true;
}
