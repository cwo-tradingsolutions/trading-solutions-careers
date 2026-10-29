/**
 * Preview de solo lectura (rama preview/pr7-readonly).
 *
 * El middleware rechaza cualquier escritura HTTP en esta rama.
 * Correo, calendario y el cliente de Supabase también se niegan, salvo que
 * PREVIEW_READ_ONLY sea exactamente "0". En el preview esa variable no se
 * define, así que el bloqueo queda activo.
 */

export function previewLibraryBlocked(): boolean {
  return process.env.PREVIEW_READ_ONLY !== "0";
}

export function assertPreviewReadOnly(op: string): void {
  if (previewLibraryBlocked()) {
    throw new Error(`Preview solo lectura (${op})`);
  }
}

/** Únicas escrituras HTTP: login (POST) y logout (DELETE) de la cookie de sesión. */
export function isPreviewAuthWrite(method: string, pathname: string): boolean {
  if (pathname !== "/api/hr-admin/login") return false;
  return method === "POST" || method === "DELETE";
}

/**
 * GET/HEAD con efecto: correo, Gmail/Calendar, sync, cron o escritura.
 * El historial de contactos con ?sync=0 solo lee; sin eso llama a Gmail y escribe.
 */
export function isSideEffectGet(pathname: string, searchParams?: { get(name: string): string | null }): boolean {
  if (pathname.startsWith("/api/cron/")) return true;
  if (pathname === "/api/admin/sync-jobs-to-web") return true;
  if (pathname === "/api/headhunting/candidates/recordatorio-prefiltro") return true;
  if (pathname === "/api/init-db") return true;
  if (pathname === "/api/google/auth" || pathname === "/api/google/callback") return true;
  if (pathname === "/api/linkedin/auth" || pathname === "/api/linkedin/callback") return true;
  if (pathname === "/api/headhunting/assessment/validate") return true;
  if (/^\/api\/headhunting\/prefilter\/[^/]+$/.test(pathname)) return true;
  if (/^\/api\/headhunting\/ai-interview\/[^/]+$/.test(pathname)) return true;
  if (/^\/api\/bateria\/diag\//.test(pathname)) return true;
  if (/^\/api\/admin\/candidates\/[^/]+\/contactos$/.test(pathname)) {
    return searchParams?.get("sync") !== "0";
  }
  return false;
}
