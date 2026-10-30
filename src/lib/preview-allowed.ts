/**
 * ¿Se puede abrir una página /preview/*?
 *
 * Prod se muda a Cloud Run (servicio prd-careers). Ahí VERCEL_ENV no existe,
 * así que un guard que solo mira VERCEL_ENV === "production" deja la página
 * pública. Acá se permite solo un entorno conocido de no-producción.
 *
 * Permite si:
 *   - VERCEL_ENV es preview o development, o
 *   - K_SERVICE empieza con "stg-", o
 *   - NODE_ENV es development.
 * Cualquier otro caso niega: prd-*, VERCEL_ENV=production, y un entorno
 * desconocido (variables vacías).
 */
export function isPreviewAllowed(env: {
  VERCEL_ENV?: string;
  K_SERVICE?: string;
  NODE_ENV?: string;
} = process.env): boolean {
  if (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development") return true;
  if (typeof env.K_SERVICE === "string" && env.K_SERVICE.startsWith("stg-")) return true;
  if (env.NODE_ENV === "development") return true;
  return false;
}
