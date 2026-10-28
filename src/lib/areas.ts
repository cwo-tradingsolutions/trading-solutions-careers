/**
 * Los tres equipos que muestra el portal público (Operations, Corporate,
 * Commercial) a partir del departamento de cada vacante.
 *
 * La base guarda departamentos más finos (Tecnología, Finanzas, Talento…).
 * Antes la home tenía los conteos escritos a mano ("4 open positions") y no
 * cuadraban con la lista. Ahora salen de las vacantes abiertas.
 */
export type AreaKey = "operations" | "corporate" | "commercial";

export const AREAS: AreaKey[] = ["operations", "corporate", "commercial"];

const OPERATIONS = ["operaciones", "operations", "operación", "logística", "logistics"];
const COMMERCIAL = ["comercial", "commercial", "ventas", "sales", "pricing"];

/** Todo lo que no es operación ni comercial cae en Corporate. */
export function areaOf(dept: string): AreaKey {
  const d = (dept || "").trim().toLowerCase();
  if (OPERATIONS.includes(d)) return "operations";
  if (COMMERCIAL.includes(d)) return "commercial";
  return "corporate";
}

export function isAreaKey(v: string | null | undefined): v is AreaKey {
  return !!v && (AREAS as string[]).includes(v);
}
