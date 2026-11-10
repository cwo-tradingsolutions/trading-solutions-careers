/**
 * Citacion al assessment presencial.
 *
 * Decisiones del texto, que no son de forma:
 *  · Dice QUE hay prueba tecnica escrita y ejercicio de conversacion, pero no
 *    sobre que. Si se anuncia el caso, llegan preparados y uno termina
 *    midiendo quien tuvo tres dias libres para estudiar, no quien tiene
 *    criterio.
 *  · Dice explicitamente que no hay que preparar nada. Sin esa frase unos se
 *    desvelan estudiando y otros llegan tranquilos, y esa diferencia se cuela
 *    en los resultados.
 *  · Avisa lo de la confidencialidad desde el correo, no en la puerta.
 *  · Pide confirmacion el mismo dia: si dos se caen hay que llamar a los
 *    siguientes con tiempo.
 */

import { candidateSignatureHtml, candidateSignatureText } from "./ats-from";

export type DatosCitacion = {
  nombre: string | null;
  vacante: string | null;
  /** Como se le muestra al candidato: "martes 15 de septiembre". */
  fecha: string;
  horaLlegada: string;
  horaFin: string;
  direccion: string;
  /** Opcional: como llegar, parqueadero, piso. */
  referencia?: string | null;
  /** Boton "Agregar a mi calendario". Opcional: sin el, el correo sirve igual. */
  calendarUrl?: string | null;
  firma?: string;
};

/**
 * Colombia no tiene horario de verano: siempre UTC-5. Por eso la hora se puede
 * fijar con el offset literal en vez de arrastrar una libreria de zonas.
 *
 * La fecha y la hora que ve el candidato y las que van al calendario salen de
 * los MISMOS datos. Escribir la fecha a mano en un campo y el evento en otro es
 * como se manda gente el dia equivocado.
 */
export function inicioEnBogota(fechaISO: string, hora24: string): Date {
  return new Date(`${fechaISO}T${hora24}:00-05:00`);
}

/** "2026-09-15" -> "martes 15 de septiembre" */
export function fechaLegible(fechaISO: string): string {
  const d = inicioEnBogota(fechaISO, '12:00');
  const partes = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota',
  }).formatToParts(d);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} de ${get('month')}`;
}

/** "08:00" -> "8:00 a. m." */
export function horaLegible(hora24: string): string {
  const d = inicioEnBogota('2026-01-01', hora24);
  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Bogota',
  }).format(d);
}

/** Minutos entre dos horas del mismo dia. */
export function duracionMinutos(hIni: string, hFin: string): number {
  const [a, b] = [hIni, hFin].map((h) => {
    const [hh, mm] = h.split(':').map(Number);
    return hh * 60 + (mm || 0);
  });
  return Math.max(30, b - a);
}

const AZUL = '#2C64ED';
export const FIRMA_CITACION = 'Talent Acquisition Team';

function primerNombre(n: string | null): string {
  const limpio = (n ?? '').trim();
  return limpio ? limpio.split(/\s+/)[0] : '';
}

export function asuntoCitacion(d: DatosCitacion): string {
  return `Trading Solutions · Assessment presencial el ${d.fecha}`;
}

export function textoCitacion(d: DatosCitacion): string {
  const hola = primerNombre(d.nombre) ? `Hola ${primerNombre(d.nombre)},` : 'Hola,';
  return [
    hola,
    '',
    `Gracias por el tiempo que le dedicaste a la prueba en línea. Avanzaste a la siguiente etapa del proceso${d.vacante ? ` para ${d.vacante}` : ''}, y es presencial.`,
    '',
    'Es una sesión de una mañana, con un grupo pequeño de candidatos y tres personas de Trading Solutions. Queremos verte trabajar en cosas parecidas a las que harías en el cargo.',
    '',
    'CUÁNDO Y DÓNDE',
    d.fecha,
    `Llegada ${d.horaLlegada} · terminamos cerca de las ${d.horaFin}`,
    d.direccion,
    d.referencia ?? '',
    '',
    'QUÉ VA A PASAR',
    '· Una evaluación técnica escrita sobre situaciones reales de un sistema integrado de gestión.',
    '· Un ejercicio práctico de conversación, uno a uno, sobre una situación de operación.',
    '· Todo se hace ahí mismo. No tienes que preparar ni estudiar nada.',
    '',
    'QUÉ LLEVAR',
    '· Documento de identidad y un lapicero.',
    '· No necesitas computador. Nosotros ponemos el material.',
    '· Vas a ver documentos internos de la empresa, sin datos de personas. Te pediremos firmar un acuerdo de confidencialidad al llegar.',
    '',
    'Reserva la mañana completa, por favor. Es una sola sesión grupal y no podemos repetirla individualmente. Si ese día no te queda posible, respóndenos hoy mismo y conversamos qué alternativa hay.',
    '',
    'Confírmanos tu asistencia respondiendo este correo.',
    '',
    candidateSignatureText("es"),
  ].filter((l) => l !== '').join('\n');
}

export function htmlCitacion(d: DatosCitacion): string {
  const nombre = primerNombre(d.nombre);
  const hola = nombre ? `Hola <strong>${nombre}</strong>,` : 'Hola,';
  const punto = (t: string) => `<li style="margin:0 0 9px;line-height:1.55">${t}</li>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#0A0A0A">
  <div style="max-width:600px;margin:0 auto;background:#ffffff">

    <div style="background:${AZUL};padding:26px 32px">
      <p style="margin:0;color:#ffffff;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700">Trading Solutions</p>
      <p style="margin:6px 0 0;color:#ffffff;font-size:19px;font-weight:600">Citación · assessment presencial</p>
    </div>

    <div style="padding:30px 32px">
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${hola}</p>

      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">
        Gracias por el tiempo que le dedicaste a la prueba en línea. <strong>Avanzaste a la siguiente
        etapa</strong> del proceso${d.vacante ? ` para ${d.vacante}` : ''}, y es presencial.
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
        Es una sesión de una mañana, con un grupo pequeño de candidatos y tres personas de Trading
        Solutions. Queremos verte trabajar en cosas parecidas a las que harías en el cargo.
      </p>

      <div style="background:#EEF3FE;border:1px solid #C7D9FB;border-radius:8px;padding:18px 20px;margin:0 0 22px">
        <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${AZUL};font-weight:700">Cuándo y dónde</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6">
          <strong>${d.fecha}</strong><br>
          Llegada <strong>${d.horaLlegada}</strong> · terminamos cerca de las <strong>${d.horaFin}</strong>
        </p>
        <p style="margin:0;font-size:15px;line-height:1.6">
          <strong>${d.direccion}</strong>${d.referencia ? `<br><span style="color:#6B7280;font-size:13.5px">${d.referencia}</span>` : ''}
        </p>
      </div>

      ${d.calendarUrl ? `<p style="margin:0 0 22px;text-align:center">
        <a href="${d.calendarUrl}" style="display:inline-block;background:#ffffff;color:${AZUL};text-decoration:none;padding:11px 26px;border-radius:8px;font-weight:600;font-size:14.5px;border:1px solid #C7D9FB">Agregar a mi calendario</a>
      </p>` : ''}

      <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${AZUL};font-weight:700">Qué va a pasar</p>
      <ul style="margin:0 0 20px;padding-left:18px;font-size:14.5px;color:#374151">
        ${punto('Una <strong>evaluación técnica escrita</strong> sobre situaciones reales de un sistema integrado de gestión.')}
        ${punto('Un <strong>ejercicio práctico</strong> de conversación, uno a uno, sobre una situación de operación.')}
        ${punto('Todo se hace ahí mismo. <strong>No tienes que preparar ni estudiar nada.</strong>')}
      </ul>

      <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${AZUL};font-weight:700">Qué llevar</p>
      <ul style="margin:0 0 20px;padding-left:18px;font-size:14.5px;color:#374151">
        ${punto('Documento de identidad y un lapicero.')}
        ${punto('No necesitas computador. Nosotros ponemos el material.')}
        ${punto('Vas a ver documentos internos de la empresa, sin datos de personas. Te pediremos firmar un acuerdo de confidencialidad al llegar.')}
      </ul>

      <p style="margin:0 0 20px;font-size:14.5px;line-height:1.6;color:#374151">
        Reserva la mañana completa, por favor. Es una sola sesión grupal y no podemos repetirla
        individualmente. <strong>Si ese día no te queda posible, respóndenos hoy mismo</strong> y
        conversamos qué alternativa hay.
      </p>

      <p style="margin:0 0 22px;font-size:15px;line-height:1.6">
        <strong>Confírmanos tu asistencia respondiendo este correo.</strong>
      </p>

      ${candidateSignatureHtml("es")}
    </div>

    <div style="padding:18px 32px 26px;border-top:1px solid #E5E7EB">
      <p style="margin:0;font-size:11.5px;color:#9CA3AF;line-height:1.6">
        Esta citación es personal. Si surge cualquier cosa el mismo día, escríbenos a este correo.
      </p>
    </div>

  </div>
</body></html>`;
}
