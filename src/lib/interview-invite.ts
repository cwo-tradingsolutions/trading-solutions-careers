/**
 * Invitación a entrevista (Wellness → Hiring Manager).
 *
 * Lógica pura: orden de rondas, allowlist de preview, From, correo EN/ES
 * y el cuerpo del evento de Calendar con Google Meet. La ruta HTTP aplica
 * los efectos (Gmail send, Calendar, fila en ht_interviews).
 */
import { ATS_FROM_NAME, candidateSignatureHtml } from "./ats-from";
import { isChinaProcess, resolveCandidateLang, type CandidateLang } from "./candidate-lang";
import {
  PREVIEW_GOOGLE_CONNECT_LABEL,
  type GoogleOAuthEnvironment,
} from "./google-oauth-env";

export const INTERVIEW_FROM_EMAIL = "jointheteam@tradingsolutions.com";
export const DEFAULT_TZ = "America/Bogota";
export const DEFAULT_DURATION_MIN = 45;
export const DEFAULT_HM_NAME = "Jaime";
export const DEFAULT_HM_EMAIL = "coo@tradingsolutions.com";
export const DEFAULT_WELLNESS_INTERVIEWER_NAME = "Talent Acquisition Team";
export const DEFAULT_WELLNESS_INTERVIEWER_EMAIL = INTERVIEW_FROM_EMAIL;

/**
 * Techo del preview. Aunque INTERVIEW_TEST_RECIPIENTS traiga otras
 * direcciones (incluido coo@), solo estas dos pueden recibir algo.
 */
export const PREVIEW_ALLOWLIST = [
  "cwo@tradingsolutions.com",
  "jointheteam@tradingsolutions.com",
] as const;

export const RECONNECT_CALENDAR_LABEL = "Reconectar Google (falta permiso de Calendar)";
export const RECONNECT_CALENDAR_PATH = "/api/google/auth";

export { PREVIEW_GOOGLE_CONNECT_LABEL };

/**
 * Banner de Google en la invitación.
 * Preview sin token propio: "Conecta Google para preview".
 * Token presente sin calendar: el aviso de reconectar de siempre.
 * Producción sin token sigue mostrando el aviso de Calendar (igual que antes,
 * porque calendar_scope_ok queda en false).
 */
export function googleReconnectBanner(input: {
  environment: GoogleOAuthEnvironment;
  connected: boolean;
  calendarScopeOk: boolean;
}): { label: string; href: string } | null {
  if (input.environment === "preview" && !input.connected) {
    return { label: PREVIEW_GOOGLE_CONNECT_LABEL, href: RECONNECT_CALENDAR_PATH };
  }
  if (!input.calendarScopeOk) {
    return { label: RECONNECT_CALENDAR_LABEL, href: RECONNECT_CALENDAR_PATH };
  }
  return null;
}

export type InterviewRound = "wellness" | "hm";

export type LangFields = {
  formTemplateKey?: string | null;
  preferredLanguage?: string | null;
  jobId?: number | string | null;
  jobTitle?: string | null;
  country?: string | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function interviewFromHeader(fromEmail = INTERVIEW_FROM_EMAIL): string {
  return `${ATS_FROM_NAME} <${fromEmail}>`;
}

export function invitesFlagOn(flag: string | undefined): boolean {
  const v = (flag || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** null = variable ausente. [] = presente pero sin ninguna dirección permitida. */
export function effectiveAllowlist(raw: string | undefined | null): string[] | null {
  if (raw == null || raw.trim() === "") return null;
  const ceiling = new Set<string>(PREVIEW_ALLOWLIST.map((e) => normalizeEmail(e)));
  const kept: string[] = [];
  for (const part of raw.split(",")) {
    const email = normalizeEmail(part);
    if (email && ceiling.has(email) && !kept.includes(email)) kept.push(email);
  }
  return kept;
}

export type SuppressedAddress = { email: string; role: "candidate" | "interviewer" };

export type Delivery =
  | { action: "refuse"; error: string }
  | {
      action: "dry_run" | "send";
      emailTo: string[];
      calendarAttendees: string[];
      suppressed: SuppressedAddress[];
      persist: boolean;
    };

export function decideDelivery(input: {
  vercelEnv: string | undefined;
  invitesEnabledFlag: string | undefined;
  /** INTERVIEW_INVITES_UNRESTRICTED=1 is the only way to mail real candidates. */
  unrestrictedFlag?: string | undefined;
  allowlistRaw: string | undefined;
  candidateEmail: string;
  interviewerEmail: string;
}): Delivery {
  const candidate = normalizeEmail(input.candidateEmail);
  const interviewer = normalizeEmail(input.interviewerEmail);

  if (invitesFlagOn(input.unrestrictedFlag)) {
    return {
      action: "send",
      emailTo: candidate ? [candidate] : [],
      calendarAttendees: unique([candidate, interviewer]),
      suppressed: [],
      persist: true,
    };
  }

  const allow = effectiveAllowlist(input.allowlistRaw);
  if (allow == null || allow.length === 0) {
    return {
      action: "refuse",
      error:
        "INTERVIEW_TEST_RECIPIENTS no está configurado o está vacío. No se envía a candidatos reales. Definilo como cwo@tradingsolutions.com,jointheteam@tradingsolutions.com",
    };
  }

  const allowSet = new Set(allow);
  const suppressed: SuppressedAddress[] = [];
  if (candidate && !allowSet.has(candidate)) suppressed.push({ email: candidate, role: "candidate" });
  if (interviewer && interviewer !== candidate && !allowSet.has(interviewer)) {
    suppressed.push({ email: interviewer, role: "interviewer" });
  }

  const onList = unique([candidate, interviewer].filter((e) => allowSet.has(e)));
  const persist = Boolean(candidate) && allowSet.has(candidate);
  // Someone on the list receives the mail. A real candidate is redirected to the allowlist.
  const emailTo = onList.length > 0 ? onList : allow;
  const calendarAttendees = onList.length > 0 ? onList : allow;
  return {
    action: "send",
    emailTo,
    calendarAttendees,
    suppressed,
    persist,
  };
}

export type PriorInterview = {
  round: string;
  status: string;
  deleted_at?: string | null;
};

export function wellnessHeld(prior: PriorInterview[]): boolean {
  return prior.some(
    (row) =>
      row.round === "wellness" &&
      !row.deleted_at &&
      (row.status === "scheduled" || row.status === "done"),
  );
}

export function assertRoundOrder(
  round: InterviewRound,
  prior: PriorInterview[],
): { ok: true } | { ok: false; error: string } {
  if (round !== "hm") return { ok: true };
  if (!wellnessHeld(prior)) {
    return {
      ok: false,
      error:
        "La entrevista con el Hiring Manager solo se puede invitar después de que exista la entrevista de Wellness (agendada o realizada).",
    };
  }
  return { ok: true };
}

export type InviteForm = {
  round: InterviewRound;
  date: string;
  time: string;
  tz: string;
  durationMin: number;
  interviewerName: string;
  interviewerEmail: string;
  scheduledAt: Date;
};

export function validateInviteForm(body: {
  round?: unknown;
  date?: unknown;
  time?: unknown;
  tz?: unknown;
  duration_min?: unknown;
  interviewer_name?: unknown;
  interviewer_email?: unknown;
}): { ok: true; value: InviteForm } | { ok: false; error: string } {
  if (body.round !== "wellness" && body.round !== "hm") {
    return { ok: false, error: "La ronda debe ser wellness o hm." };
  }
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return { ok: false, error: "La fecha de la entrevista es obligatoria." };
  }
  if (typeof body.time !== "string" || !/^\d{2}:\d{2}$/.test(body.time)) {
    return { ok: false, error: "La hora de la entrevista es obligatoria." };
  }
  const tz = typeof body.tz === "string" ? body.tz.trim() : "";
  if (!tz) return { ok: false, error: "La zona horaria es obligatoria." };
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
  } catch {
    return { ok: false, error: "La zona horaria no es válida." };
  }
  const durationMin = typeof body.duration_min === "number" ? body.duration_min : Number(body.duration_min);
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 240) {
    return { ok: false, error: "La duración es obligatoria (entre 15 y 240 minutos)." };
  }
  const interviewerName = typeof body.interviewer_name === "string" ? body.interviewer_name.trim() : "";
  if (!interviewerName) return { ok: false, error: "El entrevistador es obligatorio." };
  const interviewerEmail = normalizeEmail(typeof body.interviewer_email === "string" ? body.interviewer_email : "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(interviewerEmail)) {
    return { ok: false, error: "El correo del entrevistador es obligatorio." };
  }
  const scheduledAt = zonedWallTimeToUtc(body.date, body.time, tz);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, error: "La fecha y la hora no se pudieron interpretar." };
  }
  return {
    ok: true,
    value: {
      round: body.round,
      date: body.date,
      time: body.time,
      tz,
      durationMin,
      interviewerName,
      interviewerEmail,
      scheduledAt,
    },
  };
}

/** Interpreta fecha y hora de pared en una zona IANA y devuelve el instante UTC. */
export function zonedWallTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(utcGuess)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return new Date(utcGuess - (asUtc - utcGuess));
}

export function resolveInviteLang(input: LangFields): CandidateLang {
  return resolveCandidateLang(input);
}

/** Zona local del candidato cuando el proceso la conoce. Si no, null. */
export function candidateLocalTz(input: LangFields): string | null {
  if (isChinaProcess(input)) return "Asia/Shanghai";
  if (/\bpanama\b|panamá/i.test(String(input.country || ""))) return "America/Panama";
  return null;
}

export function formatInterviewWhen(
  instant: Date,
  tz: string,
  lang: CandidateLang,
  candidateTz?: string | null,
): { primary: string; candidateLocal: string | null } {
  const locale = lang === "en" ? "en-US" : "es-CO";
  const fmt = (zone: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    }).format(instant);
  return {
    primary: `${fmt(tz)} · ${tz}`,
    candidateLocal: candidateTz && candidateTz !== tz ? `${fmt(candidateTz)} · ${candidateTz}` : null,
  };
}

export function roundLabel(round: InterviewRound, lang: CandidateLang): string {
  if (round === "wellness") {
    return lang === "en"
      ? "Wellness interview (Talent Acquisition and English)"
      : "Entrevista de Wellness (Talent Acquisition e inglés)";
  }
  return lang === "en" ? "Hiring Manager interview" : "Entrevista con el Hiring Manager";
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

export type MeetEventPayload = {
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
  sendUpdates: "all";
};

export function buildMeetEventPayload(opts: {
  summary: string;
  description: string;
  start: Date;
  durationMin: number;
  tz: string;
  attendees: string[];
  requestId: string;
}): MeetEventPayload {
  const end = new Date(opts.start.getTime() + opts.durationMin * 60_000);
  return {
    summary: opts.summary,
    description: opts.description,
    start: { dateTime: opts.start.toISOString(), timeZone: opts.tz },
    end: { dateTime: end.toISOString(), timeZone: opts.tz },
    attendees: opts.attendees.filter(Boolean).map((email) => ({ email: normalizeEmail(email) })),
    conferenceData: {
      createRequest: {
        requestId: opts.requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    sendUpdates: "all",
  };
}

export function renderInterviewEmail(opts: {
  lang: CandidateLang;
  firstName: string;
  vacancyTitle: string;
  round: InterviewRound;
  when: Date;
  tz: string;
  durationMin: number;
  interviewerName: string;
  meetUrl: string | null;
  candidateTz?: string | null;
}): { subject: string; html: string; fromName: string } {
  const lang = opts.lang;
  const label = roundLabel(opts.round, lang);
  const when = formatInterviewWhen(opts.when, opts.tz, lang, opts.candidateTz);
  const first = escapeHtml(opts.firstName || (lang === "en" ? "there" : "hola"));
  const vacancy = escapeHtml(opts.vacancyTitle || (lang === "en" ? "the position" : "la vacante"));
  const interviewer = escapeHtml(opts.interviewerName);
  const duration = String(opts.durationMin);
  const meet = opts.meetUrl
    ? `<a href="${escapeHtml(opts.meetUrl)}" style="color:#2C64ED;">${escapeHtml(opts.meetUrl)}</a>`
    : lang === "en"
      ? "The Google Meet link is added when the calendar event is created."
      : "El enlace de Google Meet se agrega al crear el evento de calendario.";

  const subject =
    lang === "en"
      ? `Trading Solutions · ${label} — ${opts.vacancyTitle || "the position"}`
      : `Trading Solutions · ${label} — ${opts.vacancyTitle || "la vacante"}`;

  const localBlock = when.candidateLocal
    ? lang === "en"
      ? `<br/><strong>Your local time:</strong> ${escapeHtml(when.candidateLocal)}`
      : `<br/><strong>Hora en tu zona:</strong> ${escapeHtml(when.candidateLocal)}`
    : "";

  const html =
    lang === "en"
      ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
<div style="background:#000;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;font-weight:800;letter-spacing:2px;font-size:14px;">TRADING SOLUTIONS</div>
<div style="border:1px solid #e5e5e5;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
<p>Hi ${first},</p>
<p>Your <strong>${escapeHtml(label)}</strong> for the <strong>${vacancy}</strong> position is confirmed.</p>
<div style="background:#f5f5f5;border-left:4px solid #000;padding:14px 16px;margin:16px 0;">
<strong>Date and time:</strong> ${escapeHtml(when.primary)}${localBlock}<br/>
<strong>Duration:</strong> ${duration} minutes<br/>
<strong>Google Meet:</strong> ${meet}<br/>
<strong>Interviewer:</strong> ${interviewer}
</div>
<p>If you need to reschedule, reply to this email.</p>
${candidateSignatureHtml("en")}
</div></div>`
      : `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
<div style="background:#000;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;font-weight:800;letter-spacing:2px;font-size:14px;">TRADING SOLUTIONS</div>
<div style="border:1px solid #e5e5e5;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
<p>Hola ${first},</p>
<p>Te confirmamos tu <strong>${escapeHtml(label)}</strong> para la posición de <strong>${vacancy}</strong>.</p>
<div style="background:#f5f5f5;border-left:4px solid #000;padding:14px 16px;margin:16px 0;">
<strong>Fecha y hora:</strong> ${escapeHtml(when.primary)}${localBlock}<br/>
<strong>Duración:</strong> ${duration} minutos<br/>
<strong>Google Meet:</strong> ${meet}<br/>
<strong>Entrevistador:</strong> ${interviewer}
</div>
<p>Si necesitas reagendar, responde a este correo.</p>
${candidateSignatureHtml("es")}
</div></div>`;

  return { subject, html, fromName: ATS_FROM_NAME };
}

export function buildInviteArtifacts(opts: {
  lang: CandidateLang;
  firstName: string;
  vacancyTitle: string;
  round: InterviewRound;
  when: Date;
  tz: string;
  durationMin: number;
  interviewerName: string;
  meetUrl: string | null;
  candidateTz?: string | null;
  attendees: string[];
  requestId: string;
}): { subject: string; html: string; fromName: string; from: string; event: MeetEventPayload } {
  const email = renderInterviewEmail(opts);
  const label = roundLabel(opts.round, opts.lang);
  const when = formatInterviewWhen(opts.when, opts.tz, opts.lang, opts.candidateTz);
  const description = [
    `${label} · ${opts.vacancyTitle}`,
    when.primary,
    when.candidateLocal ? `Local: ${when.candidateLocal}` : "",
    `${opts.durationMin} min`,
    opts.meetUrl ? `Meet: ${opts.meetUrl}` : "Meet: se crea con conferenceData.createRequest",
    `Interviewer: ${opts.interviewerName}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    ...email,
    from: interviewFromHeader(),
    event: buildMeetEventPayload({
      summary: `${label} · ${opts.vacancyTitle} · Trading Solutions`,
      description,
      start: opts.when,
      durationMin: opts.durationMin,
      tz: opts.tz,
      attendees: opts.attendees,
      requestId: opts.requestId,
    }),
  };
}

function unique(emails: string[]): string[] {
  const out: string[] = [];
  for (const email of emails) {
    const n = normalizeEmail(email);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}
