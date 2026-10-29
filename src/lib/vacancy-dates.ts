/**
 * Fechas de una vacante.
 *
 * Apertura (ya existe):
 *   - ATS: ht_vacancy_milestones.hr_request_date
 *   - Página de empleo: vacancies.posted_at
 * Cierre objetivo (no existe): archivo de migración, no aplicado.
 *   - ATS: ht_vacancy_milestones.target_fill_date
 *   - Página de empleo: vacancies.target_close_date
 * El cierre solo se exige cuando esa columna ya está en la base.
 */

export const MSG_FECHA_APERTURA = "Falta la fecha de apertura de la vacante.";
export const MSG_FECHA_OBJETIVO = "Falta la fecha de cierre objetivo de la vacante.";
export const MSG_FECHA_FORMATO = "Las fechas tienen que ir en formato AAAA-MM-DD.";
export const MSG_OBJETIVO_SIN_COLUMNA =
  "La fecha de cierre objetivo no se puede guardar todavía: falta aplicar en staging el archivo de migración (target_fill_date / target_close_date). No se aplicó ninguna migración desde aquí. La fecha de apertura sí quedó pedida.";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function fechaIso(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const day = raw.slice(0, 10);
  if (!ISO_DATE.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== day) return null;
  return day;
}

export type FechasOk = {
  ok: true;
  apertura: string;
  objetivo: string | null;
  aviso: string | null;
};
export type FechasError = { ok: false; error: string };

export function validarFechasVacante(
  opening: unknown,
  target: unknown,
  exigirObjetivo: boolean,
): FechasOk | FechasError {
  const apertura = fechaIso(opening);
  if (!String(opening || "").trim()) return { ok: false, error: MSG_FECHA_APERTURA };
  if (!apertura) return { ok: false, error: MSG_FECHA_FORMATO };

  if (!exigirObjetivo) {
    const objetivo = fechaIso(target);
    return {
      ok: true,
      apertura,
      objetivo,
      aviso: MSG_OBJETIVO_SIN_COLUMNA,
    };
  }

  if (!String(target || "").trim()) return { ok: false, error: MSG_FECHA_OBJETIVO };
  const objetivo = fechaIso(target);
  if (!objetivo) return { ok: false, error: MSG_FECHA_FORMATO };
  return { ok: true, apertura, objetivo, aviso: null };
}
