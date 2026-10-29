/**
 * Correo de invitacion a la bateria.
 *
 * Vive aparte de la ruta a proposito: el mismo texto tiene que servir para la
 * vista previa, para el borrador de Gmail y para el envio real. Si cada uno
 * armara su propio HTML, lo que Kelly aprueba en pantalla no seria lo que le
 * llega al candidato.
 *
 * Alineado a Clara email-03 (Universe): asunto «Siguiente paso: batería TS»,
 * CTA «Abrir batería», plazo {{fecha_limite}} y firma Talent Acquisition.
 * El azul del look solo va en el eyebrow; el boton es ink.
 *
 * Lo que dice el correo tiene que coincidir con lo que dice la pantalla de
 * consentimiento, o el consentimiento deja de ser informado:
 *  - 90 minutos, cinco partes, una sola sesion.
 *  - La modalidad remota exige camara activa. Quien no quiera, presencial.
 *  - Un enlace por persona. No se puede retomar despues de cerrar.
 */
import { stageSla } from '@/lib/stage-labels';

export type DatosCorreo = {
  nombre: string | null;
  vacante: string | null;
  url: string;
  remitente?: string;
  firma?: string;
  /** Si no viene, se calcula con el SLA de la etapa `pruebas`. */
  fechaLimite?: string | null;
};

/** El correo lo firma el equipo, no una persona: quien responda el hilo puede
 *  ser cualquiera de reclutamiento, y el candidato no queda esperando a Kelly. */
export const FIRMA = 'Talent Acquisition Team';

const INK = '#1d1d1f';
const MUTE = '#6e6e73';
const CANVAS = '#F3F4F6';
const AZUL_MARK = '#1747D9';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Primer nombre: "Buenos días, María Fernanda Gómez" suena a base de datos. */
function primerNombre(n: string | null): string {
  const limpio = (n ?? '').trim();
  if (!limpio) return '';
  return limpio.split(/\s+/)[0];
}

/** Plazo para abrir la batería. El número de días es el SLA ya definido
 *  para `pruebas` (gate Batería TS); no es un plazo nuevo. */
export function fechaLimiteBateria(explicita?: string | null, locale: 'es' | 'en' = 'es'): string {
  const dada = (explicita ?? '').trim();
  if (dada) return dada;
  const dias = stageSla('pruebas') ?? 4;
  const f = new Date();
  f.setUTCDate(f.getUTCDate() + dias);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(f);
}

export function asuntoBateria(vacante: string | null): string {
  const v = (vacante ?? '').trim();
  return v ? `Siguiente paso: batería TS — ${v}` : 'Siguiente paso: batería TS';
}

/** Version en texto plano, para clientes de correo que no muestran HTML. */
export function textoBateria(d: DatosCorreo): string {
  const hola = primerNombre(d.nombre) ? `Hola ${primerNombre(d.nombre)},` : 'Hola,';
  const plazo = fechaLimiteBateria(d.fechaLimite, 'es');
  return [
    hola,
    '',
    d.vacante
      ? `El siguiente paso del proceso para ${d.vacante} en Trading Solutions es la batería TS.`
      : 'El siguiente paso del proceso de selección en Trading Solutions es la batería TS.',
    '',
    `Tienes hasta el ${plazo} para completarla.`,
    '',
    `Abrir batería: ${d.url}`,
    '',
    'Antes de empezar, ten en cuenta:',
    '· Toma alrededor de 90 minutos y se responde en una sola sesión. No se puede pausar y retomar después.',
    '· Necesitas computador con internet estable. Desde el celular no se ve bien.',
    '· En modalidad remota la cámara debe estar activa durante toda la prueba. Si prefieres no habilitarla, responde este correo y te agendamos para presentarla presencial en nuestras oficinas.',
    '· Busca un espacio tranquilo y sin interrupciones antes de abrir el enlace.',
    '· El enlace es personal e intransferible, y sirve una sola vez.',
    '· Responde con tu primera reacción. Las respuestas se guardan solas.',
    '',
    'Al abrir el enlace vas a ver primero la autorización de tratamiento de datos (Ley 1581 de 2012). Léela con calma: sin esa autorización la prueba no inicia.',
    '',
    'Cualquier duda, responde este mismo correo.',
    '',
    d.firma ?? FIRMA,
    'Trading Solutions',
  ].join('\n');
}

export function htmlBateria(d: DatosCorreo): string {
  const nombre = primerNombre(d.nombre);
  const hola = nombre ? `Hola <strong>${esc(nombre)}</strong>,` : 'Hola,';
  const vacante = (d.vacante ?? '').trim();
  const intro = vacante
    ? `El siguiente paso del proceso para <strong>${esc(vacante)}</strong> en Trading Solutions es la batería TS.`
    : 'El siguiente paso del proceso de selección en Trading Solutions es la batería TS.';
  const plazo = esc(fechaLimiteBateria(d.fechaLimite, 'es'));
  const url = esc(d.url);
  const firma = esc(d.firma ?? FIRMA);

  const punto = (txt: string) =>
    `<li style="margin:0 0 9px;line-height:1.55">${txt}</li>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:${CANVAS};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${INK}">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid rgba(0,0,0,.06)">

    <div style="padding:28px 32px 0">
      <p style="margin:0;color:${AZUL_MARK};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700">Talent Acquisition</p>
      <p style="margin:8px 0 0;color:${INK};font-size:22px;font-weight:650;letter-spacing:-0.02em">Siguiente paso: batería TS</p>
    </div>

    <div style="padding:18px 32px 28px">
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${hola}</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${intro}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
        Tienes hasta el <strong>${plazo}</strong> para completarla.
      </p>

      <p style="margin:0 0 24px;text-align:center">
        <a href="${url}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:650;font-size:15px">Abrir batería</a>
      </p>

      <div style="background:${CANVAS};border-radius:12px;padding:16px 18px;margin:0 0 20px">
        <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTE};font-weight:700">Antes de empezar</p>
        <ul style="margin:0;padding-left:18px;font-size:14px;color:${INK}">
          ${punto('Toma alrededor de <strong>90 minutos</strong> y se responde en <strong>una sola sesión</strong>. No se puede pausar y retomar después.')}
          ${punto('Necesitas <strong>computador</strong> con internet estable. Desde el celular no se ve bien.')}
          ${punto('En modalidad remota <strong>la cámara debe estar activa</strong> durante toda la prueba. Si prefieres no habilitarla, responde este correo y te agendamos para presentarla <strong>presencial</strong> en nuestras oficinas.')}
          ${punto('Busca un espacio tranquilo y sin interrupciones <em>antes</em> de abrir el enlace.')}
          ${punto('El enlace es <strong>personal e intransferible</strong> y sirve una sola vez.')}
          ${punto('Responde con tu primera reacción. Las respuestas se guardan solas.')}
        </ul>
      </div>

      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${INK}">
        Al abrir el enlace vas a ver primero la <strong>autorización de tratamiento de datos</strong>
        (Ley 1581 de 2012). Léela con calma: sin esa autorización la prueba no inicia.
      </p>
      <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:${MUTE}">
        Cualquier duda, responde este mismo correo.
      </p>

      <p style="margin:0;font-size:15px;line-height:1.6;color:${INK}">
        ${firma}<br>
        <span style="color:${MUTE};font-size:13.5px">Trading Solutions</span>
      </p>
    </div>

    <div style="padding:16px 32px 22px;border-top:1px solid rgba(0,0,0,.06)">
      <p style="margin:0;font-size:11.5px;color:${MUTE};line-height:1.6">
        Enlace personal, generado para ti. Si no eres ${esc(nombre || 'la persona destinataria')}, por favor ignora este correo.<br>
        Si el botón no abre, copia esta dirección en tu navegador:<br>
        <span style="word-break:break-all">${url}</span>
      </p>
    </div>

  </div>
</body></html>`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Version en ingles · procesos de China y Panamá.
 *
 * Gemela de la version en espanol: mismos datos, misma estructura, mismos
 * tokens. La Ley 1581 de 2012 es colombiana, asi que el correo en ingles
 * anuncia la pantalla de consentimiento sin citar la ley.
 * ───────────────────────────────────────────────────────────────────────── */

/** El correo en ingles tambien lo firma el equipo, no una persona. */
export const FIRMA_EN = 'Talent Acquisition Team';

export function asuntoBateriaEn(vacante: string | null): string {
  const v = (vacante ?? '').trim();
  return v ? `Next step: TS battery — ${v}` : 'Next step: TS battery';
}

/** Version en texto plano, para clientes de correo que no muestran HTML. */
export function textoBateriaEn(d: DatosCorreo): string {
  const hola = primerNombre(d.nombre) ? `Hi ${primerNombre(d.nombre)},` : 'Hi,';
  const plazo = fechaLimiteBateria(d.fechaLimite, 'en');
  return [
    hola,
    '',
    d.vacante
      ? `The next step in the process for ${d.vacante} at Trading Solutions is the TS battery.`
      : 'The next step in the selection process at Trading Solutions is the TS battery.',
    '',
    `Please complete it by ${plazo}.`,
    '',
    `Open battery: ${d.url}`,
    '',
    'Before you start, please note:',
    '· It takes around 90 minutes and is completed in a single session. You cannot pause it and resume later.',
    '· You need a computer with a stable internet connection. It does not display properly on a phone.',
    '· In remote mode your camera must stay on during the whole assessment. If you prefer not to turn it on, reply to this email and we will schedule you to take it on-site at our offices.',
    '· Find a quiet space with no interruptions before you open the link.',
    '· The link is personal, non-transferable, and works only once.',
    '· Answer with your first reaction. Your answers are saved automatically.',
    '',
    'When you open the link you will first see the data processing consent screen. Read it carefully: the assessment does not start without your consent.',
    '',
    'If you have any questions, just reply to this email.',
    '',
    d.firma ?? FIRMA_EN,
    'Trading Solutions',
  ].join('\n');
}

export function htmlBateriaEn(d: DatosCorreo): string {
  const nombre = primerNombre(d.nombre);
  const hola = nombre ? `Hi <strong>${esc(nombre)}</strong>,` : 'Hi,';
  const vacante = (d.vacante ?? '').trim();
  const intro = vacante
    ? `The next step in the process for <strong>${esc(vacante)}</strong> at Trading Solutions is the TS battery.`
    : 'The next step in the selection process at Trading Solutions is the TS battery.';
  const plazo = esc(fechaLimiteBateria(d.fechaLimite, 'en'));
  const url = esc(d.url);
  const firma = esc(d.firma ?? FIRMA_EN);

  const punto = (txt: string) =>
    `<li style="margin:0 0 9px;line-height:1.55">${txt}</li>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:${CANVAS};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${INK}">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid rgba(0,0,0,.06)">

    <div style="padding:28px 32px 0">
      <p style="margin:0;color:${AZUL_MARK};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700">Talent Acquisition</p>
      <p style="margin:8px 0 0;color:${INK};font-size:22px;font-weight:650;letter-spacing:-0.02em">Next step: TS battery</p>
    </div>

    <div style="padding:18px 32px 28px">
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${hola}</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${intro}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
        Please complete it by <strong>${plazo}</strong>.
      </p>

      <p style="margin:0 0 24px;text-align:center">
        <a href="${url}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:650;font-size:15px">Open battery</a>
      </p>

      <div style="background:${CANVAS};border-radius:12px;padding:16px 18px;margin:0 0 20px">
        <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTE};font-weight:700">Before you start</p>
        <ul style="margin:0;padding-left:18px;font-size:14px;color:${INK}">
          ${punto('It takes around <strong>90 minutes</strong> and is completed in <strong>a single session</strong>. You cannot pause it and resume later.')}
          ${punto('You need a <strong>computer</strong> with a stable internet connection. It does not display properly on a phone.')}
          ${punto('In remote mode <strong>your camera must stay on</strong> during the whole assessment. If you prefer not to turn it on, reply to this email and we will schedule you to take it <strong>on-site</strong> at our offices.')}
          ${punto('Find a quiet space with no interruptions <em>before</em> you open the link.')}
          ${punto('The link is <strong>personal and non-transferable</strong>, and works only once.')}
          ${punto('Answer with your first reaction. Your answers are saved automatically.')}
        </ul>
      </div>

      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${INK}">
        When you open the link you will first see the <strong>data processing consent</strong> screen.
        Read it carefully: the assessment does not start without your consent.
      </p>
      <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:${MUTE}">
        If you have any questions, just reply to this email.
      </p>

      <p style="margin:0;font-size:15px;line-height:1.6;color:${INK}">
        ${firma}<br>
        <span style="color:${MUTE};font-size:13.5px">Trading Solutions</span>
      </p>
    </div>

    <div style="padding:16px 32px 22px;border-top:1px solid rgba(0,0,0,.06)">
      <p style="margin:0;font-size:11.5px;color:${MUTE};line-height:1.6">
        Personal link, generated for you. If you are not ${esc(nombre || 'the intended recipient')}, please ignore this email.<br>
        If the button does not open, copy this address into your browser:<br>
        <span style="word-break:break-all">${url}</span>
      </p>
    </div>

  </div>
</body></html>`;
}
