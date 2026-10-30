/**
 * Google Calendar helper · usa el mismo OAuth de Gmail (scope añadido).
 *
 * Funciones:
 *   - queryFreeBusy(emails, start, end) · devuelve los rangos ocupados de cada calendario
 *   - computeAvailableSlots(emails, ...) · encuentra slots donde TODOS están libres
 *   - createMeetEvent(...) · crea evento en Calendar con Google Meet auto-generado
 */
import { getValidAccessToken } from "@/lib/gmail";
import { decideOutboundRecipients, isProductionRuntime, parseOneAddress } from "@/lib/mail-recipient-guard";

const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export type BusyRange = { start: string; end: string };
export type CalendarEmail = string;

/**
 * Consulta los rangos OCUPADOS de cada calendario en el rango dado.
 * Requiere que cada calendar email haya sido compartido con la cuenta autorizada
 * (mínimo "free/busy access").
 */
export async function queryFreeBusy(
  emails: CalendarEmail[],
  timeMin: string,  // ISO timestamp
  timeMax: string,
  timezone = "America/Bogota"
): Promise<{ busy_by_email: Record<string, BusyRange[]>; errors: Record<string, string> }> {
  const valid = await getValidAccessToken();
  if (!valid) {
    throw new Error("Google OAuth no conectado · ve a Settings y conecta Gmail");
  }

  const r = await fetch(FREEBUSY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${valid.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: timezone,
      items: emails.map(email => ({ id: email })),
    }),
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Google FreeBusy API error ${r.status}: ${text.slice(0, 300)}`);
  }

  const data = await r.json();
  const busy_by_email: Record<string, BusyRange[]> = {};
  const errors: Record<string, string> = {};

  for (const email of emails) {
    const cal = data.calendars?.[email];
    if (cal?.errors) {
      errors[email] = cal.errors.map((e: any) => e.reason).join(", ");
      busy_by_email[email] = [];
    } else {
      busy_by_email[email] = (cal?.busy || []) as BusyRange[];
    }
  }

  return { busy_by_email, errors };
}

/**
 * Slots donde TODOS los participantes están libres.
 * Genera slots cada `slotIntervalMinutes` minutos dentro del horario hábil.
 */
export type AvailableSlot = { start: string; end: string };

export async function computeAvailableSlots(opts: {
  emails: CalendarEmail[];
  windowStart: string;  // ISO
  windowEnd: string;
  durationMinutes: number;
  businessHoursStart?: number;  // 0-23 · hora local
  businessHoursEnd?: number;
  bufferMinutes?: number;
  timezone?: string;
  slotIntervalMinutes?: number;  // cada cuánto generar slot · default = duration
}): Promise<{ slots: AvailableSlot[]; errors: Record<string, string> }> {
  const {
    emails,
    windowStart,
    windowEnd,
    durationMinutes,
    businessHoursStart = 8,
    businessHoursEnd = 18,
    bufferMinutes = 15,
    timezone = "America/Bogota",
    slotIntervalMinutes,
  } = opts;

  const { busy_by_email, errors } = await queryFreeBusy(emails, windowStart, windowEnd, timezone);

  // Flatten todas las ocupaciones en un array
  const allBusy: BusyRange[] = [];
  for (const email of emails) {
    allBusy.push(...(busy_by_email[email] || []));
  }

  const interval = slotIntervalMinutes || durationMinutes;
  const slots: AvailableSlot[] = [];
  const start = new Date(windowStart);
  const end = new Date(windowEnd);

  // Iterar día por día dentro de la ventana
  const current = new Date(start);
  while (current < end) {
    // Saltar a businessHoursStart en la timezone local
    const localDate = new Date(current.toLocaleString("en-US", { timeZone: timezone }));
    const dayStart = new Date(current);
    dayStart.setHours(businessHoursStart, 0, 0, 0);
    const dayEnd = new Date(current);
    dayEnd.setHours(businessHoursEnd, 0, 0, 0);

    // Skip weekends
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!isWeekend) {
      // Slotear el día
      const slotStart = new Date(dayStart);
      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);
        if (slotEnd > dayEnd) break;
        if (slotStart < start) {
          slotStart.setTime(slotStart.getTime() + interval * 60_000);
          continue;
        }

        // Chequear conflicto con cualquier busy range (con buffer)
        const slotStartWithBuffer = new Date(slotStart.getTime() - bufferMinutes * 60_000);
        const slotEndWithBuffer = new Date(slotEnd.getTime() + bufferMinutes * 60_000);

        const hasConflict = allBusy.some(b => {
          const busyStart = new Date(b.start);
          const busyEnd = new Date(b.end);
          return slotStartWithBuffer < busyEnd && slotEndWithBuffer > busyStart;
        });

        if (!hasConflict) {
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
          });
        }

        slotStart.setTime(slotStart.getTime() + interval * 60_000);
      }
    }

    // Avanzar al día siguiente
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return { slots, errors };
}

/**
 * Crea un evento en Google Calendar con Google Meet auto-generado.
 * El evento aparece en el calendario de TODOS los attendees.
 */
export async function createMeetEvent(opts: {
  summary: string;
  description: string;
  startISO: string;
  endISO: string;
  attendees: string[];  // emails
  timezone?: string;
}): Promise<{ ok: true; event_id: string; meet_url: string; html_link: string } | { ok: false; error: string }> {
  const valid = await getValidAccessToken();
  if (!valid) {
    return { ok: false, error: "Google OAuth no conectado" };
  }

  const requestId = `joint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const body = {
    summary: opts.summary,
    description: opts.description,
    start: { dateTime: opts.startISO, timeZone: opts.timezone || "America/Bogota" },
    end: { dateTime: opts.endISO, timeZone: opts.timezone || "America/Bogota" },
    attendees: opts.attendees.map(email => ({ email })),
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    reminders: { useDefault: true },
  };

  const r = await fetch(`${EVENTS_URL}?conferenceDataVersion=1&sendUpdates=all`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${valid.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const text = await r.text();
    return { ok: false, error: `Calendar API error ${r.status}: ${text.slice(0, 300)}` };
  }

  const data = await r.json();
  const meet_url = data.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri || data.hangoutLink || "";

  return {
    ok: true,
    event_id: data.id,
    meet_url,
    html_link: data.htmlLink,
  };
}

function calendarAudience(attendees: { email: string }[]): {
  attendees: { email: string }[];
  sendUpdates: "all" | "none";
} {
  const env = {
    MAIL_RECIPIENT_ALLOWLIST: process.env.MAIL_RECIPIENT_ALLOWLIST,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    K_SERVICE: process.env.K_SERVICE,
    STAGING_READ_ONLY: process.env.STAGING_READ_ONLY,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
  if (isProductionRuntime(env)) return { attendees, sendUpdates: "all" };
  const kept: { email: string }[] = [];
  for (const attendee of attendees) {
    const parsed = parseOneAddress(attendee.email || "");
    if (!parsed.ok) continue;
    if (decideOutboundRecipients({ to: parsed.address }, env).send) kept.push({ email: parsed.address });
  }
  return { attendees: kept, sendUpdates: "none" };
}

/**
 * events.insert para la invitación a entrevista.
 * `sendUpdates=all` y `conferenceDataVersion=1` van en el query, que es
 * donde Calendar los lee. El campo sendUpdates del payload de dominio no
 * se reenvía en el body.
 */
export async function insertInterviewEvent(payload: {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees: { email: string }[];
  conferenceData: {
    createRequest: {
      requestId: string;
      conferenceSolutionKey: { type: "hangoutsMeet" };
    };
  };
}): Promise<{ ok: true; event_id: string; meet_url: string; html_link: string } | { ok: false; error: string; status?: number }> {
  const valid = await getValidAccessToken();
  if (!valid) {
    return { ok: false, error: "Google OAuth no conectado" };
  }

  const audience = calendarAudience(payload.attendees);
  const body = {
    summary: payload.summary,
    description: payload.description,
    start: payload.start,
    end: payload.end,
    attendees: audience.attendees,
    conferenceData: payload.conferenceData,
    reminders: { useDefault: true },
  };

  const r = await fetch(`${EVENTS_URL}?conferenceDataVersion=1&sendUpdates=${audience.sendUpdates}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${valid.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const text = await r.text();
    return { ok: false, status: r.status, error: `Calendar API error ${r.status}: ${text.slice(0, 300)}` };
  }

  const data = await r.json();
  const meet =
    data.conferenceData?.entryPoints?.find((e: { entryPointType?: string; uri?: string }) => e.entryPointType === "video")?.uri
    || data.hangoutLink
    || "";

  return { ok: true, event_id: data.id, meet_url: meet, html_link: data.htmlLink || "" };
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!eventId) return;
  const valid = await getValidAccessToken();
  if (!valid) return;
  await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}?sendUpdates=none`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${valid.access_token}` },
  });
}
