/**
 * Borradores automáticos al mover etapa. Apagados salvo
 * STAGE_DRAFTS_ENABLED=1 (también true, yes, on). Vacío o ausente no crea
 * borrador. No controla la batería ni los correos de PATCH /api/applications.
 *
 * Cubre el draft de assessment al pasar a assessment_invitado y el draft
 * de bienvenida al pasar a contratado.
 */

export function stageDraftsEnabled(flag?: string | null): boolean {
  const v = (flag ?? process.env.STAGE_DRAFTS_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
