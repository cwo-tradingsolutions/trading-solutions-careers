/**
 * Guard de previews de Vercel. El preview puede apuntar a la base de
 * producción: ahí no se escribe, no se dispara un cron y no se inicia OAuth.
 * En producción y en local (VERCEL_ENV ausente) no hace nada.
 */

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function clean(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function previewReadOnlyBlock(
  env: string | undefined,
  method: string,
  pathname: string,
): { error: "preview read-only" } | null {
  if (env !== "preview") return null;
  const path = clean(pathname);
  const m = method.toUpperCase();

  if (path === "/api/cron" || path.startsWith("/api/cron/")) {
    return { error: "preview read-only" };
  }
  if (/^\/api\/google\/(auth|callback)$/.test(path)) {
    return { error: "preview read-only" };
  }
  if (/^\/api\/linkedin\/(auth|callback|webhook)$/.test(path)) {
    return { error: "preview read-only" };
  }

  if (!path.startsWith("/api")) return null;
  if (!WRITES.has(m)) return null;
  if (path === "/api/hr-admin/login" && (m === "POST" || m === "DELETE")) return null;
  return { error: "preview read-only" };
}
