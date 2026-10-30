import { isPasswordLoginEnabled, parseAllowlist } from "./hr-admin-access";
import { HR_ADMIN_BREAK_GLASS_EMAIL } from "./hr-admin-secrets";

/**
 * Checked on every admin request. Removing an address from
 * HR_ADMIN_ALLOWED_EMAILS ends that session immediately.
 * The break-glass email is not on the list; it works only while the password flag is on.
 */
export function adminSessionEmailAllowed(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === HR_ADMIN_BREAK_GLASS_EMAIL) {
    return isPasswordLoginEnabled(env.HR_ADMIN_PASSWORD_LOGIN_ENABLED);
  }
  return parseAllowlist(env.HR_ADMIN_ALLOWED_EMAILS).includes(normalized);
}
