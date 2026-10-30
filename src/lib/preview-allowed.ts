/**
 * ¿Se puede abrir una página /preview/*?
 *
 * Prod se muda a Cloud Run (servicio prd-careers). Ahí VERCEL_ENV no existe,
 * así que un guard que solo mira VERCEL_ENV === "production" deja la página
 * pública. Acá se permite solo un entorno conocido de no-producción.
 *
 * Niega primero producción: VERCEL_ENV=production o K_SERVICE prd-*.
 * Eso gana sobre NODE_ENV=development, para que un build local mal
 * etiquetado no abra la página en prod.
 *
 * Después permite solo:
 *   - VERCEL_ENV preview o development, o
 *   - K_SERVICE que empieza con "stg-", o
 *   - NODE_ENV development.
 * Cualquier otro caso niega, incluido un entorno desconocido.
 */
export function isPreviewAllowed(env: {
  VERCEL_ENV?: string;
  K_SERVICE?: string;
  NODE_ENV?: string;
} = process.env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (typeof env.K_SERVICE === "string" && env.K_SERVICE.startsWith("prd-")) return false;
  if (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development") return true;
  if (typeof env.K_SERVICE === "string" && env.K_SERVICE.startsWith("stg-")) return true;
  if (env.NODE_ENV === "development") return true;
  return false;
}
