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
function limpio(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isPreviewAllowed(env: {
  VERCEL_ENV?: string;
  K_SERVICE?: string;
  NODE_ENV?: string;
} = process.env): boolean {
  const vercel = limpio(env.VERCEL_ENV);
  const servicio = limpio(env.K_SERVICE);
  const nodeEnv = limpio(env.NODE_ENV);
  if (vercel === "production") return false;
  if (servicio.startsWith("prd-")) return false;
  if (vercel === "preview" || vercel === "development") return true;
  if (servicio.startsWith("stg-")) return true;
  if (nodeEnv === "development") return true;
  return false;
}
