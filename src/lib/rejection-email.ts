/**
 * El correo de rechazo, en un solo lugar.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * El cuerpo del correo vivía dentro de la ruta que rechaza al candidato. Eso
 * significaba que el correo solo se podía armar en el instante del rechazo: si
 * Gmail estaba caído, si el permiso de Google había expirado, o si simplemente
 * el borrador nunca se envió, no quedaba forma de volver a generarlo. La única
 * salida era rechazar de nuevo a alguien que ya estaba rechazado.
 *
 * Al sacarlo acá, la ruta de rechazo y la de reenvío arman exactamente el mismo
 * correo. Si mañana cambia la firma o el pie, cambia en un solo sitio.
 */

import { ATS_FROM_NAME, ATS_FROM_NAME_EN } from "@/lib/ats-from";

const TS_LINKEDIN_URL = "https://www.linkedin.com/company/trading-sol/";

export type RejectionLang = "es" | "en";

export function buildRejectionHtml(
  firstName: string,
  vacancyTitle: string,
  body: string,
  lang: RejectionLang = "es",
): string {
  const renderedBody = body
    .replace(/\{firstName\}/g, firstName)
    .replace(/\{vacancy\}/g, vacancyTitle)
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  a { color: #0a0a0a; text-decoration: underline; }
  p { margin: 0 0 14px; font-size: 14px; }
</style></head><body>
  <div class="container">
    <p>${renderedBody}</p>
    <p>${lang === "en"
      ? `Your information stays in our database in case a position that fits you better opens up. If you'd like to keep in touch, you can follow us on <a href="${TS_LINKEDIN_URL}">LinkedIn</a>.`
      : `Tu información queda en nuestra base por si se abre una posición que te calce mejor. Si querés mantenerte cerca, podés seguirnos en <a href="${TS_LINKEDIN_URL}">LinkedIn</a>.`}</p>
    <p>${lang === "en"
      ? "Best regards,<br><strong>Talent Team</strong><br>Trading Solutions"
      : `Un abrazo,<br><strong>${ATS_FROM_NAME}</strong><br>Trading Solutions`}</p>
  </div>
</body></html>`;
}

export function rejectionSubject(vacancyTitle: string, lang: RejectionLang = "es"): string {
  return lang === "en"
    ? `Trading Solutions · About your application for ${vacancyTitle}`
    : `Trading Solutions · Sobre tu aplicación a ${vacancyTitle}`;
}

/**
 * Cuerpo genérico en inglés · se usa cuando el proceso corre en inglés y nadie
 * escribió un mensaje para esa persona. Las plantillas de categoría están en
 * español, así que en inglés no sirven: mejor un texto correcto que uno que el
 * candidato no puede leer.
 */
export const EN_REJECTION_BODY =
  "Hi {firstName},\n\nThank you for taking the time to apply for the {vacancy} position at Trading Solutions. After reviewing your application, we have decided to move forward with other candidates whose profile is a closer match at this time.";

export const REJECTION_FROM_NAME = ATS_FROM_NAME;
export const REJECTION_FROM_NAME_EN = ATS_FROM_NAME_EN;
export const REJECTION_REPLY_TO = "jointheteam@tradingsolutions.com";
