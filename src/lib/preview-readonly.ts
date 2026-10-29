/**
 * Preview deployments of this branch talk to the production Supabase.
 * Mutating HR Admin routes must refuse before any write, draft, or send.
 * Production (and local, where VERCEL_ENV is unset) is unchanged.
 *
 * Login is the only mutating exception: it sets or clears the session
 * cookie and does not touch candidate data or Gmail.
 */

export const PREVIEW_READONLY_ERROR = "preview read-only" as const;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** GET handlers that send mail, sync Gmail, or start OAuth. */
const BLOCKED_GET_PREFIXES = [
  "/api/cron/",
  "/api/google/auth",
  "/api/google/callback",
  "/api/linkedin/auth",
  "/api/linkedin/callback",
  "/api/linkedin/webhook",
];

function normalizePath(pathname: string): string {
  const path = pathname.split("?")[0] || "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const withSlash = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return pathname === base || pathname.startsWith(withSlash);
}

export function isPreviewMutationBlocked(
  vercelEnv: string | undefined = process.env.VERCEL_ENV,
): boolean {
  return vercelEnv === "preview";
}

export function isPreviewReadonlyBlocked(input: {
  vercelEnv: string | undefined;
  method: string;
  pathname: string;
}): boolean {
  if (input.vercelEnv !== "preview") return false;
  const method = input.method.toUpperCase();
  const pathname = normalizePath(input.pathname);

  if (pathname === "/api/hr-admin/login" && (method === "POST" || method === "DELETE")) {
    return false;
  }

  if (method === "GET" && BLOCKED_GET_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return true;
  }

  if (!MUTATING_METHODS.has(method)) return false;
  return pathname === "/api" || pathname.startsWith("/api/");
}
