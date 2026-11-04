/**
 * Texto de consentimiento de la batería · qué versión ve cada candidato.
 *
 * DECISIÓN (4-nov-2026, GO Kelly)
 * El texto SÍ depende de la vacante: la sesión de la batería está amarrada al
 * candidato y por él a la vacante (form_template_key, country), así que se
 * puede saber quién está en China sin preguntarle nada.
 *   - Vacante de China (form_template_key = 'china' o country en China)
 *       → texto PIPL en inglés, versión `pipl-2026-09-18` (sin cambios).
 *   - Todos los demás (Panamá Ops, Colombia, pilotos sin candidato)
 *       → texto NEUTRO, versión `consent-neutral-2026-11-04`, en inglés o en
 *         español según candidate-lang.ts.
 * El idioma del texto neutro ya queda en battery_version (sufijo `-en`), por
 * eso la versión neutra es la misma para los dos idiomas.
 *
 * Las versiones viejas (`hd-2026-09-08`, `pipl-2026-09-18`) se conservan en
 * KNOWN_CONSENT_VERSIONS: las sesiones que ya aceptaron siguen mostrando lo que
 * aceptaron y un navegador con la página vieja abierta registra el texto que
 * de verdad leyó.
 */
import { CONSENT_TEXT_VERSION } from './items';
import { CONSENT_TEXT_VERSION_EN, type BatLang } from './i18n';

export type ConsentVariant = 'neutral' | 'pipl';

export const CONSENT_VERSION_NEUTRAL = 'consent-neutral-2026-11-04';
export const CONSENT_VERSION_PIPL = CONSENT_TEXT_VERSION_EN; // 'pipl-2026-09-18'

/** Versiones que alguna vez se mostraron. Cualquier otra cosa se ignora. */
export const KNOWN_CONSENT_VERSIONS = new Set<string>([
  CONSENT_VERSION_NEUTRAL,
  CONSENT_VERSION_PIPL,
  CONSENT_TEXT_VERSION, // 'hd-2026-09-08' · habeas data, páginas viejas
]);

export function consentVersionForVariant(variant: ConsentVariant): string {
  return variant === 'pipl' ? CONSENT_VERSION_PIPL : CONSENT_VERSION_NEUTRAL;
}

/**
 * Qué versión se registra al aceptar.
 *  1. La que la pantalla dice haber mostrado, si es una versión conocida.
 *  2. Si no viene (página cargada antes del deploy), la que esa página vieja
 *     mostraba: PIPL en inglés, habeas data en español.
 */
export function consentVersionToRecord(shown: unknown, lang: BatLang): string {
  const v = String(shown ?? '').trim();
  if (KNOWN_CONSENT_VERSIONS.has(v)) return v;
  return lang === 'en' ? CONSENT_VERSION_PIPL : CONSENT_TEXT_VERSION;
}
