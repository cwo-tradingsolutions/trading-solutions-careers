/**
 * Idioma del candidato — un solo lugar.
 *
 * POR QUÉ EXISTE
 * Los correos automáticos estaban todos en español. Para China eso significaba
 * escribirle en un idioma que el candidato no habla: el formulario de prefiltro
 * ya estaba en inglés, pero la invitación, el recordatorio, la citación y el
 * descarte salían en español.
 *
 * La regla vive acá para que no haya que acordarse de ella en cada ruta:
 *   - Vacantes con form_template_key = 'china' o 'panama_ops' → inglés.
 *   - Aplicaciones de la web a un job_id de China → inglés.
 *   - Cualquier candidato marcado con preferred_language = 'en' → inglés.
 * Todo lo demás sigue en español.
 */

export type CandidateLang = "es" | "en";

/** Plantillas de prefiltro cuyo proceso es en inglés. */
const ENGLISH_TEMPLATES = new Set(["china", "panama_ops"]);

/**
 * job_id de la web (tabla `vacancies` en Neon) que corresponden a vacantes de
 * China. Se usa en el flujo público de aplicaciones, donde todavía no hay
 * candidato en Supabase con su plantilla.
 */
// 6-9: Builder Team de China (ver VACANCY_MAP en vacancy-map.ts).
// 17: Administration & Office Setup Lead — China · verificado en /api/vacancies
//     el 17-sep-2026 (status open, location Shenzhen).
export const ENGLISH_JOB_IDS = new Set([6, 7, 8, 9, 17]);

export function isEnglishTemplate(formTemplateKey?: string | null): boolean {
  return ENGLISH_TEMPLATES.has(String(formTemplateKey || "").toLowerCase());
}

export function isEnglishJobId(jobId?: number | string | null): boolean {
  const n = Number(jobId);
  return Number.isFinite(n) && ENGLISH_JOB_IDS.has(n);
}

type LangInput = {
  formTemplateKey?: string | null;
  preferredLanguage?: string | null;
  jobId?: number | string | null;
  jobTitle?: string | null;
  /** `country` de ht_vacancies, o la ubicación de la vacante en la web. */
  country?: string | null;
};

/**
 * El país o la ubicación son de China. El campo autoritativo es `country` de
 * ht_vacancies (o `location` de la vacante web); el título solo se mira cuando
 * dice China de forma explícita, para no arrastrar cosas como
 * "Pricing Analyst · China Trade Lane", que es un cargo en Colombia.
 */
function isChinaLocation(country?: string | null): boolean {
  return /\b(china|shenzhen|shanghai|guangzhou)\b/i.test(String(country || ""));
}

function titleSaysChina(jobTitle?: string | null): boolean {
  return /\bchina\b/i.test(String(jobTitle || ""));
}

function isPanamaOpsRole(input: LangInput): boolean {
  if (String(input.formTemplateKey || "").toLowerCase() === "panama_ops") return true;
  const title = String(input.jobTitle || "");
  const place = String(input.country || "");
  const ops = /operations specialist|especialista de operaciones/i.test(title);
  return ops && /\bpanam[aá]\b/i.test(`${title} ${place}`);
}

export function resolveCandidateLang(input: LangInput): CandidateLang {
  if (String(input.preferredLanguage || "").toLowerCase() === "en") return "en";
  if (isEnglishTemplate(input.formTemplateKey)) return "en";
  if (isPanamaOpsRole(input)) return "en";
  if (input.jobId !== undefined && isEnglishJobId(input.jobId)) return "en";
  // Respaldo por país o título · una vacante nueva de China no debería quedar
  // en español solo porque nadie se acordó de agregar su id a la lista.
  if (isChinaLocation(input.country) || titleSaysChina(input.jobTitle)) return "en";
  return "es";
}

/** ¿El proceso corre en huso horario de China? Para fechas y horas. */
export function isChinaProcess(input: LangInput): boolean {
  // panama_ops is English, but it is not on China time.
  const key = String(input.formTemplateKey || "").toLowerCase();
  return (
    key === "china" ||
    (input.jobId !== undefined && isEnglishJobId(input.jobId)) ||
    isChinaLocation(input.country) ||
    titleSaysChina(input.jobTitle)
  );
}

/** Firma de los correos en inglés · el equipo, no una persona. */
export const EN_SIGNATURE_NAME = "Trading Solutions Talent Team";
