/**
 * ¿Se puede abrir una página /preview/*?
 *
 * Prod se muda a Cloud Run (servicio prd-careers). Ahí VERCEL_ENV no existe,
 * así que un guard que solo mira VERCEL_ENV === "production" deja la página
 * pública. Acá se permite solo un entorno conocido de no-producción.
 *
 * Niega primero producción, en cualquier entorno: VERCEL_ENV=production,
 * K_SERVICE vacío (está seteado y no nombra un servicio) o K_SERVICE prd / prd-*.
 * Eso gana sobre NODE_ENV=development y sobre VERCEL_ENV=preview.
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
  const servicioSeteado = Object.prototype.hasOwnProperty.call(env, "K_SERVICE");
  if (vercel === "production") return false;
  if (servicioSeteado && servicio === "") return false;
  if (servicio === "prd" || servicio.startsWith("prd-")) return false;
  if (vercel === "preview" || vercel === "development") return true;
  if (servicio.startsWith("stg-")) return true;
  if (nodeEnv === "development") return true;
  return false;
}
