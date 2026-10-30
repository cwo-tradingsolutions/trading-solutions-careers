/**
 * Categorías de rechazo que ya viven en ts_rejection_categories.
 * No se inventan valores: son las del seed
 * (20260508_rejection_reasons.sql + 20260509_idioma_rejection_category.sql).
 *
 * La nota es opcional. Sin categoría no se escribe stage = 'rechazado'.
 */

export const REJECTION_CATEGORIES: { key: string; label: string }[] = [
  { key: "experiencia_insuficiente", label: "Experiencia insuficiente" },
  { key: "match_cultural", label: "Match cultural · soft skills" },
  { key: "pretension_salarial", label: "Pretensión salarial fuera de rango" },
  { key: "disponibilidad_movilidad", label: "Disponibilidad · movilidad" },
  { key: "idioma_insuficiente", label: "Idioma · nivel insuficiente" },
  { key: "resultado_evaluacion", label: "Resultado de evaluación" },
  { key: "comunicacion_proceso", label: "Comunicación · proceso" },
  { key: "decision_candidato", label: "Decisión del candidato" },
];

export const REJECTION_CATEGORY_KEYS = REJECTION_CATEGORIES.map((c) => c.key);

const KEY_SET = new Set(REJECTION_CATEGORY_KEYS);

export const MSG_RECHAZO_CATEGORIA =
  "Elegí una categoría de rechazo. La nota es opcional.";

export const MSG_RECHAZO_CATEGORIA_INVALIDA =
  "Esa categoría de rechazo no existe. Elegí una de la lista.";

export const MSG_RECHAZO_SILENCIOSO =
  "No se puede pasar a Rechazado sin categoría. La nota es opcional.";

export type RechazoOk = { ok: true; category_key: string; note: string | null };
export type RechazoError = { ok: false; error: string };

export function validarRechazo(input: {
  category_key?: unknown;
  note?: unknown;
  /** Si se pasa, manda sobre la lista fija (catálogo activo de la base). */
  catalog?: readonly string[] | null;
}): RechazoOk | RechazoError {
  const key = String(input.category_key || "").trim();
  if (!key) return { ok: false, error: MSG_RECHAZO_CATEGORIA };
  const permitidas = input.catalog && input.catalog.length > 0
    ? new Set(input.catalog)
    : KEY_SET;
  if (!permitidas.has(key)) return { ok: false, error: MSG_RECHAZO_CATEGORIA_INVALIDA };
  const note = String(input.note || "").trim();
  return { ok: true, category_key: key, note: note ? note.slice(0, 4000) : null };
}
