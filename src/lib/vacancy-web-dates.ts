import { neon } from "@/lib/sql";
import { validarFechasVacante } from "@/lib/vacancy-dates";

let cierreCache: boolean | null = null;

/** vacancies.target_close_date existe solo después del archivo de migración. */
export async function columnaCierreWebExiste(): Promise<boolean> {
  if (cierreCache !== null) return cierreCache;
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'vacancies' AND column_name = 'target_close_date'
     LIMIT 1`,
  );
  cierreCache = Array.isArray(rows) && rows.length > 0;
  return cierreCache;
}

export async function validarFechasWeb(opening: unknown, target: unknown) {
  return validarFechasVacante(opening, target, await columnaCierreWebExiste());
}
