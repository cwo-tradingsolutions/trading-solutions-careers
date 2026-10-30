/**
 * Correo de rechazo. Un solo texto por idioma, aprobado por Kelly el 30 oct 2026.
 *
 * La categoría y la nota interna no salen en el correo. Ninguna variante
 * (manual, prefiltro, Ops PA, China, ES) menciona salario, inglés,
 * autorización de trabajo, presencialidad ni experiencia.
 *
 * Envío apagado hasta REJECTION_EMAILS_ENABLED=1. Sin la variable no se
 * crea borrador ni se envía; la decisión en el ATS sí se guarda.
 */

import { ATS_FROM_NAME, ATS_FROM_NAME_EN, candidateSignatureHtml } from "./ats-from";

export type RejectionLang = "es" | "en";

export const REJECTION_SUBJECT: Record<RejectionLang, string> = {
  es: "Trading Solutions · Sobre tu aplicación a {vacancy}",
  en: "Trading Solutions · About your application for {vacancy}",
};

export const REJECTION_BODY: Record<RejectionLang, string> = {
  es: `Hola {firstName},

Gracias por tu interés en la posición de {vacancy} en Trading Solutions y por el tiempo que dedicaste a tu aplicación.

Después de revisar las aplicaciones, decidimos continuar el proceso con otras personas.

Guardamos tu información en nuestra base de datos y te tendremos en cuenta para futuras oportunidades. Puedes seguirnos en LinkedIn para conocer nuevas vacantes: https://www.linkedin.com/company/trading-sol/

Te deseamos muchos éxitos.

Un abrazo,
Talent Acquisition Team
Trading Solutions`,
  en: `Hi {firstName},

Thank you for your interest in the {vacancy} position at Trading Solutions and for the time you put into your application.

After reviewing the applications, we have decided to continue the process with other candidates.

We will keep your information on file and consider you for future opportunities. You can follow us on LinkedIn to hear about new openings: https://www.linkedin.com/company/trading-sol/

We wish you every success.

Best regards,
Talent Acquisition Team
Trading Solutions`,
};

export const REJECTION_FROM_NAME = ATS_FROM_NAME;
export const REJECTION_FROM_NAME_EN = ATS_FROM_NAME_EN;
export const REJECTION_REPLY_TO = "jointheteam@tradingsolutions.com";

/** On only when the flag is 1, true, yes, or on. Missing or empty stays off. */
export function rejectionEmailsEnabled(flag?: string | null): boolean {
  const v = (flag ?? process.env.REJECTION_EMAILS_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Timestamp to store in rejection_sent_at. Null when nothing was sent. */
export function rejectionSentAt(sent: boolean, now = new Date()): string | null {
  return sent ? now.toISOString() : null;
}

export function fillRejection(template: string, firstName: string, vacancy: string): string {
  return template.replaceAll("{firstName}", firstName).replaceAll("{vacancy}", vacancy);
}

export function rejectionSubject(vacancyTitle: string, lang: RejectionLang = "es"): string {
  return fillRejection(REJECTION_SUBJECT[lang], "", vacancyTitle);
}

export function rejectionPlain(firstName: string, vacancyTitle: string, lang: RejectionLang = "es"): string {
  return fillRejection(REJECTION_BODY[lang], firstName, vacancyTitle);
}

/**
 * HTML of the approved text. The plain signature lines are rendered with
 * the shared strong block, once.
 */
export function buildRejectionHtml(
  firstName: string,
  vacancyTitle: string,
  lang: RejectionLang = "es",
): string {
  const text = rejectionPlain(firstName, vacancyTitle, lang)
    .replace(/\n*(?:Un abrazo|Best regards),\nTalent Acquisition Team\nTrading Solutions\s*$/, "")
    .trimEnd();
  const inner = text
    .split(/\n\n/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  a { color: #0a0a0a; text-decoration: underline; }
  p { margin: 0 0 14px; font-size: 14px; }
</style></head><body>
  <div class="container">
    ${inner}
    ${candidateSignatureHtml(lang)}
  </div>
</body></html>`;
}
