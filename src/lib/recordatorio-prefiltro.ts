/**
 * Recordatorio del prefiltro.
 *
 * Es un correo distinto al de invitacion, no el mismo reenviado. Quien no ha
 * llenado el formulario en varios dias no necesita que le repitan la
 * explicacion completa: necesita el enlace a la mano, saber cuanto le toma y
 * saber hasta cuando sirve. Y no necesita sentirse regañado: la mayoria no
 * respondio porque se le paso, no porque perdio el interes.
 */

import { candidateSignatureHtml, candidateSignatureText } from "./ats-from";

export type DatosRecordatorio = {
  nombre: string | null;
  vacante: string | null;
  url: string;
  /** Dias desde que se le envio el prefiltro. Si no se sabe, se omite. */
  dias?: number | null;
  vence?: string | null;
  firma?: string;
};

const AZUL = '#2C64ED';
export const FIRMA_RECORDATORIO = 'Talent Acquisition Team';

function primerNombre(n: string | null): string {
  const limpio = (n ?? '').trim();
  return limpio ? limpio.split(/\s+/)[0] : '';
}

export function asuntoRecordatorio(vacante: string | null): string {
  return vacante
    ? `Recordatorio · cuestionario inicial para ${vacante}`
    : 'Recordatorio · cuestionario inicial de Trading Solutions';
}

export function textoRecordatorio(d: DatosRecordatorio): string {
  const hola = primerNombre(d.nombre) ? `Hola ${primerNombre(d.nombre)},` : 'Hola,';
  return [
    hola,
    '',
    d.vacante
      ? `Te escribimos por el cuestionario inicial del proceso para ${d.vacante}. Todavía no lo tenemos.`
      : 'Te escribimos por el cuestionario inicial del proceso. Todavía no lo tenemos.',
    '',
    'Sabemos que la semana se va volando, así que te dejamos el enlace otra vez a la mano:',
    d.url,
    '',
    'Son 7 a 10 minutos y se guarda solo, así que puedes dejarlo a medias y volver.',
    d.vence ? `El enlace queda activo hasta el ${d.vence}.` : '',
    '',
    'Si ya no te interesa la vacante o cambiaste de planes, respóndenos con una línea y cerramos tu proceso sin problema. Saberlo nos ayuda tanto como el cuestionario.',
    '',
    candidateSignatureText("es"),
  ].filter((l) => l !== '').join('\n');
}

export function htmlRecordatorio(d: DatosRecordatorio): string {
  const nombre = primerNombre(d.nombre);
  const hola = nombre ? `Hola <strong>${nombre}</strong>,` : 'Hola,';
  const intro = d.vacante
    ? `Te escribimos por el cuestionario inicial del proceso para <strong>${d.vacante}</strong>. Todavía no lo tenemos.`
    : 'Te escribimos por el cuestionario inicial del proceso. Todavía no lo tenemos.';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#0A0A0A">
  <div style="max-width:600px;margin:0 auto;background:#ffffff">

    <div style="background:${AZUL};padding:22px 32px">
      <p style="margin:0;color:#ffffff;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700">Trading Solutions</p>
      <p style="margin:6px 0 0;color:#ffffff;font-size:18px;font-weight:600">Cuestionario inicial · recordatorio</p>
    </div>

    <div style="padding:28px 32px">
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${hola}</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${intro}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
        Sabemos que la semana se va volando, así que te dejamos el enlace otra vez a la mano.
      </p>

      <p style="margin:0 0 22px;text-align:center">
        <a href="${d.url}" style="display:inline-block;background:${AZUL};color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:600;font-size:16px">Completar el cuestionario</a>
      </p>

      <div style="background:#EEF3FE;border:1px solid #C7D9FB;border-radius:8px;padding:14px 18px;margin:0 0 20px">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6">
          Son <strong>7 a 10 minutos</strong> y se guarda solo, así que puedes dejarlo a medias y volver.${
            d.vence ? ` El enlace queda activo hasta el <strong>${d.vence}</strong>.` : ''
          }
        </p>
      </div>

      <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#374151">
        Y si ya no te interesa la vacante o cambiaste de planes, respóndenos con una línea y cerramos tu
        proceso sin problema. Saberlo nos ayuda tanto como el cuestionario.
      </p>

      ${candidateSignatureHtml("es")}
    </div>

    <div style="padding:16px 32px 24px;border-top:1px solid #E5E7EB">
      <p style="margin:0;font-size:11.5px;color:#9CA3AF;line-height:1.6">
        Si el botón no abre, copia esta dirección en tu navegador:<br>
        <span style="color:#6B7280;word-break:break-all">${d.url}</span>
      </p>
    </div>

  </div>
</body></html>`;
}

/* ─── Versión en inglés · procesos que corren en inglés (China) ───────────── */

export const EN_REMINDER_SIGNATURE = 'Talent Acquisition Team';

export function asuntoRecordatorioEn(vacante: string | null): string {
  return vacante
    ? `Reminder · pre-screening questionnaire for ${vacante}`
    : 'Reminder · Trading Solutions pre-screening questionnaire';
}

export function textoRecordatorioEn(d: DatosRecordatorio): string {
  const hi = primerNombre(d.nombre) ? `Hi ${primerNombre(d.nombre)},` : 'Hi,';
  return [
    hi,
    '',
    d.vacante
      ? `We're writing about the pre-screening questionnaire for the ${d.vacante} process. We haven't received it yet.`
      : "We're writing about the pre-screening questionnaire for your process. We haven't received it yet.",
    '',
    'We know the week goes by fast, so here is the link again:',
    d.url,
    '',
    'It takes 7 to 10 minutes and saves automatically, so you can stop halfway and come back.',
    d.vence ? `The link stays active until ${d.vence}.` : '',
    '',
    "If you're no longer interested or your plans changed, just reply with one line and we'll close your process. Knowing helps us as much as the questionnaire does.",
    '',
    candidateSignatureText("en"),
  ].filter((l) => l !== '').join('\n');
}

export function htmlRecordatorioEn(d: DatosRecordatorio): string {
  const nombre = primerNombre(d.nombre);
  const hi = nombre ? `Hi <strong>${nombre}</strong>,` : 'Hi,';
  const intro = d.vacante
    ? `We're writing about the pre-screening questionnaire for the <strong>${d.vacante}</strong> process. We haven't received it yet.`
    : "We're writing about the pre-screening questionnaire for your process. We haven't received it yet.";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#0A0A0A">
  <div style="max-width:600px;margin:0 auto;background:#ffffff">

    <div style="background:${AZUL};padding:22px 32px">
      <p style="margin:0;color:#ffffff;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700">Trading Solutions</p>
      <p style="margin:6px 0 0;color:#ffffff;font-size:18px;font-weight:600">Pre-screening questionnaire · reminder</p>
    </div>

    <div style="padding:28px 32px">
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${hi}</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${intro}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
        We know the week goes by fast, so here is the link again.
      </p>

      <p style="margin:0 0 22px;text-align:center">
        <a href="${d.url}" style="display:inline-block;background:${AZUL};color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:600;font-size:16px">Complete the questionnaire</a>
      </p>

      <div style="background:#EEF3FE;border:1px solid #C7D9FB;border-radius:8px;padding:14px 18px;margin:0 0 20px">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6">
          It takes <strong>7 to 10 minutes</strong> and saves automatically, so you can stop halfway and come back.${
            d.vence ? ` The link stays active until <strong>${d.vence}</strong>.` : ''
          }
        </p>
      </div>

      <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#374151">
        And if you're no longer interested or your plans changed, just reply with one line and we'll close your
        process. Knowing helps us as much as the questionnaire does.
      </p>

      ${candidateSignatureHtml("en")}
    </div>

    <div style="padding:16px 32px 24px;border-top:1px solid #E5E7EB">
      <p style="margin:0;font-size:11.5px;color:#9CA3AF;line-height:1.6">
        If the button doesn't work, copy this address into your browser:<br>
        <span style="color:#6B7280;word-break:break-all">${d.url}</span>
      </p>
    </div>

  </div>
</body></html>`;
}
