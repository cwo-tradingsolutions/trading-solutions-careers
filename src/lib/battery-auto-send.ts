/**
 * Envío automático de la Batería TS, y nada más.
 * Apagado salvo BATTERY_AUTO_SEND_ENABLED=1 (también true, yes, on).
 * Vacío o ausente no envía. Los drafts de etapa usan STAGE_DRAFTS_ENABLED.
 */
export const NOTA_BATERIA_PENDIENTE = "batería pendiente de envío";

export function batteryAutoSendEnabled(flag?: string | null): boolean {
  const v = (flag ?? process.env.BATTERY_AUTO_SEND_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
