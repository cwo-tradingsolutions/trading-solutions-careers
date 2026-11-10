/**
 * Canal de un candidato: ht_candidates.source (texto, sin enum en la base).
 *
 * Valores que el código ya escribe o acepta. No se agregan orígenes nuevos.
 * La postulación pública no pasa por esta validación: queda en public_form
 * (o public_form_internal si llega con ?ref=interno).
 */

export const CANDIDATE_SOURCE_VALUES = [
  "linkedin",
  "linkedin_recruiter",
  "organic",
  "referral",
  "referido",
  "careers_page",
  "public_form",
  "public_form_internal",
  "cv_proceso_anterior",
  "email_manual",
  "manual",
] as const;

export type CandidateSource = (typeof CANDIDATE_SOURCE_VALUES)[number];

/** Lo que el reclutador elige al crear, importar o editar. */
export const RECRUITER_SOURCE_OPTIONS: { value: CandidateSource; label: string }[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "linkedin_recruiter", label: "LinkedIn Recruiter" },
  { value: "referido", label: "Referido" },
  { value: "referral", label: "Referral" },
  { value: "email_manual", label: "Email" },
  { value: "manual", label: "Manual" },
  { value: "organic", label: "Orgánico" },
  { value: "cv_proceso_anterior", label: "CV de proceso anterior" },
  { value: "careers_page", label: "Página de empleo" },
  { value: "public_form", label: "Formulario público" },
];

export const MSG_CANAL_OBLIGATORIO =
  "El canal de origen es obligatorio. Elegí de dónde llegó el candidato.";

export const MSG_CANAL_INVALIDO =
  "Ese canal no está en la lista. Elegí uno de los orígenes que ya usa el ATS.";

export const ETIQUETA_SIN_CANAL = "Sin canal";

const SOURCE_SET = new Set<string>(CANDIDATE_SOURCE_VALUES);

export function canalVacio(value: string | null | undefined): boolean {
  return !String(value || "").trim();
}

export function etiquetaCanal(value: string | null | undefined): string {
  if (canalVacio(value)) return ETIQUETA_SIN_CANAL;
  return RECRUITER_SOURCE_OPTIONS.find((o) => o.value === value)?.label || String(value);
}

export type CanalOk = { ok: true; source: CandidateSource };
export type CanalError = { ok: false; error: string };

/** Alta, importación o edición hecha por alguien de HR. El público no usa esto. */
export function validarCanalReclutador(source: unknown): CanalOk | CanalError {
  const src = String(source || "").trim().toLowerCase();
  if (!src) return { ok: false, error: MSG_CANAL_OBLIGATORIO };
  if (!SOURCE_SET.has(src)) return { ok: false, error: MSG_CANAL_INVALIDO };
  return { ok: true, source: src as CandidateSource };
}

/**
 * Postulación pública. Nunca falla y no pide canal al candidato.
 * Sin señal queda en public_form, que es lo que el formulario ya guardaba.
 */
export function canalPostulacionPublica(input: {
  ref?: string | null;
  interno?: boolean;
}): CandidateSource {
  const ref = String(input.ref || "").trim().toLowerCase();
  if (input.interno || ref === "interno") return "public_form_internal";
  return "public_form";
}
