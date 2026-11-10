/**
 * Correos de entrevista, oferta y contratación que dispara
 * PATCH /api/applications/[id]. Apagados salvo
 * APPLICATION_STATUS_EMAILS_ENABLED=1 (también true, yes, on).
 * El rechazo de esa misma ruta no usa esta bandera.
 */

export function applicationStatusEmailsEnabled(flag?: string | null): boolean {
  const v = (flag ?? process.env.APPLICATION_STATUS_EMAILS_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
