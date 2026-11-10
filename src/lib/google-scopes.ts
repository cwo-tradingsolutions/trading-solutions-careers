/**
 * Scopes de /api/google/auth.
 *
 * Hallazgo (release/prod-c-hotfixes @ 98de47c): el consentimiento pedía
 * `calendar` (calendario completo) y NO pedía `calendar.events`. El scope
 * amplio alcanza para events.insert, pero la invitación a entrevista pide
 * el scope explícito y, si el token guardado no tiene ninguno de los dos,
 * la UI muestra reconectar en vez de fallar contra Calendar.
 */
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

const CALENDAR_WRITE = new Set([
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
]);

/** True si el scope otorgado puede crear eventos (calendar o calendar.events). */
export function hasCalendarWriteScope(scope: string | null | undefined): boolean {
  const parts = (scope || "").split(/\s+/).filter(Boolean);
  return parts.some((part) => CALENDAR_WRITE.has(part));
}
