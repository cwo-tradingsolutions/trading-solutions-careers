/**
 * GET/POST /api/headhunting/candidates/[candidateId]/interview-invite
 *
 * Invitación a entrevista desde la ficha del candidato. El correo sale por
 * sendCandidateMail (no draft), From "Talent Acquisition Team", y el evento se
 * crea en el calendario de jointheteam@ con Google Meet.
 *
 * Fuera de producción (stg-*, VERCEL_ENV preview o development, o un
 * entorno desconocido): solo cwo@ y jointheteam@ pueden recibir correo o
 * quedar como asistentes. Cloud Run prd-* y VERCEL_ENV=production no entran
 * en ese modo. Si el correo del candidato no está en la lista de prueba,
 * no se escribe ht_interviews ni se llama a Google: la respuesta trae el
 * correo renderizado y el payload del evento.
 * Producción: no hace nada salvo que INTERVIEW_INVITES_ENABLED esté activo.
 *
 * La tabla ht_interviews vive solo como archivo de migración. No se aplica
 * desde esta ruta.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getStoredTokens } from "@/lib/gmail";
import { sendCandidateMail } from "@/lib/ats-mail-store";
import { googleOAuthEnvironment } from "@/lib/google-oauth-env";
import { hasCalendarWriteScope } from "@/lib/google-scopes";
import { deleteCalendarEvent, insertInterviewEvent } from "@/lib/google-calendar";
import { recordStageEvent } from "@/lib/stage-events";
import {
  assertRoundOrder,
  buildInviteArtifacts,
  candidateLocalTz,
  decideDelivery,
  DEFAULT_DURATION_MIN,
  DEFAULT_HM_EMAIL,
  DEFAULT_HM_NAME,
  DEFAULT_TZ,
  DEFAULT_WELLNESS_INTERVIEWER_EMAIL,
  DEFAULT_WELLNESS_INTERVIEWER_NAME,
  effectiveAllowlist,
  interviewFromHeader,
  normalizeEmail,
  RECONNECT_CALENDAR_LABEL,
  RECONNECT_CALENDAR_PATH,
  googleReconnectBanner,
  interviewInviteGuarded,
  invitesFlagOn,
  PREVIEW_GOOGLE_CONNECT_LABEL,
  resolveInviteLang,
  type PriorInterview,
  validateInviteForm,
} from "@/lib/interview-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWLIST_DOC = "cwo@tradingsolutions.com,jointheteam@tradingsolutions.com";

function inviteIsGuarded(): boolean {
  return interviewInviteGuarded({
    K_SERVICE: process.env.K_SERVICE,
    STAGING_READ_ONLY: process.env.STAGING_READ_ONLY,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
}

function missingInterviewsTable(message: string | undefined): boolean {
  if (!message) return false;
  return /ht_interviews/i.test(message) && /does not exist|schema cache|could not find|not find/i.test(message);
}

async function loadCandidate(candidateId: string) {
  const { data, error } = await supabaseAdmin
    .from("ht_candidates")
    .select("id, name, email, stage, vacancy_id, preferred_language, ht_vacancies(title, form_template_key, country)")
    .eq("id", candidateId)
    .single();
  return { candidate: data, error };
}

async function loadPrior(candidateId: string): Promise<{ prior: PriorInterview[]; tableReady: boolean; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from("ht_interviews")
    .select("round, status, deleted_at")
    .eq("candidate_id", candidateId);
  if (error) {
    if (missingInterviewsTable(error.message)) return { prior: [], tableReady: false };
    return { prior: [], tableReady: false, error: error.message };
  }
  return { prior: (data || []) as PriorInterview[], tableReady: true };
}

async function googleStatus(): Promise<{
  connected: boolean;
  email?: string;
  calendar_scope_ok: boolean;
  environment: ReturnType<typeof googleOAuthEnvironment>;
  connect_label?: string;
}> {
  const environment = googleOAuthEnvironment(process.env.VERCEL_ENV);
  const disconnected = {
    connected: false as const,
    calendar_scope_ok: false as const,
    environment,
    ...(environment === "preview" ? { connect_label: PREVIEW_GOOGLE_CONNECT_LABEL } : {}),
  };
  try {
    const tokens = await getStoredTokens();
    if (!tokens) return disconnected;
    return {
      connected: true,
      email: tokens.email,
      calendar_scope_ok: hasCalendarWriteScope(tokens.scope),
      environment,
    };
  } catch {
    return disconnected;
  }
}

function langOf(candidate: any) {
  const fields = {
    formTemplateKey: candidate?.ht_vacancies?.form_template_key,
    preferredLanguage: candidate?.preferred_language,
    jobTitle: candidate?.ht_vacancies?.title,
    country: candidate?.ht_vacancies?.country,
  };
  return { lang: resolveInviteLang(fields), candidateTz: candidateLocalTz(fields), fields };
}

export async function GET(req: NextRequest, { params }: { params: { candidateId: string } }) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { candidate, error } = await loadCandidate(params.candidateId);
  if (error || !candidate) {
    return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
  }

  const prior = await loadPrior(params.candidateId);
  const google = await googleStatus();
  const { lang, candidateTz } = langOf(candidate);
  const allow = effectiveAllowlist(process.env.INTERVIEW_TEST_RECIPIENTS);
  const preview = inviteIsGuarded();

  return NextResponse.json({
    candidate: {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      vacancy_title: (candidate as any).ht_vacancies?.title || "",
      lang,
      candidate_tz: candidateTz,
    },
    wellness_exists: assertRoundOrder("hm", prior.prior).ok === true,
    table_ready: prior.tableReady,
    defaults: {
      tz: DEFAULT_TZ,
      duration_min: DEFAULT_DURATION_MIN,
      hm_name: DEFAULT_HM_NAME,
      hm_email: DEFAULT_HM_EMAIL,
      wellness_interviewer_name: DEFAULT_WELLNESS_INTERVIEWER_NAME,
      wellness_interviewer_email: DEFAULT_WELLNESS_INTERVIEWER_EMAIL,
    },
    google,
    preview: {
      active: preview,
      allowlist_configured: Boolean(allow && allow.length > 0),
      allowlist_expected: ALLOWLIST_DOC,
    },
    production_enabled: preview ? false : invitesFlagOn(process.env.INTERVIEW_INVITES_ENABLED),
  });
}

export async function POST(req: NextRequest, { params }: { params: { candidateId: string } }) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const form = validateInviteForm(body);
  if (!form.ok) return NextResponse.json({ error: form.error }, { status: 400 });

  const { candidate, error } = await loadCandidate(params.candidateId);
  if (error || !candidate) {
    return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
  }
  if (!candidate.email) {
    return NextResponse.json({ error: "El candidato no tiene correo." }, { status: 400 });
  }

  const prior = await loadPrior(params.candidateId);
  if (prior.error) {
    return NextResponse.json({ error: prior.error }, { status: 500 });
  }
  const round = assertRoundOrder(form.value.round, prior.prior);
  if (!round.ok) return NextResponse.json({ error: round.error }, { status: 409 });

  if (!inviteIsGuarded() && !invitesFlagOn(process.env.INTERVIEW_INVITES_ENABLED)) {
    return NextResponse.json({
      success: false,
      sent: false,
      persisted: false,
      action: "refuse",
      error: "INTERVIEW_INVITES_ENABLED no está activo. En producción no se envían invitaciones.",
    }, { status: 403 });
  }

  const delivery = decideDelivery({
    vercelEnv: process.env.VERCEL_ENV,
    invitesEnabledFlag: process.env.INTERVIEW_INVITES_ENABLED,
    unrestrictedFlag: process.env.INTERVIEW_INVITES_UNRESTRICTED,
    allowlistRaw: process.env.INTERVIEW_TEST_RECIPIENTS,
    candidateEmail: candidate.email,
    interviewerEmail: form.value.interviewerEmail,
  });

  const { lang, candidateTz } = langOf(candidate);
  const vacancyTitle = (candidate as any).ht_vacancies?.title || (lang === "en" ? "the position" : "la vacante");
  const firstName = String(candidate.name || "").split(" ")[0] || (lang === "en" ? "there" : "hola");
  const google = await googleStatus();

  const previewOf = (meetUrl: string | null) =>
    buildInviteArtifacts({
      lang,
      firstName,
      vacancyTitle,
      round: form.value.round,
      when: form.value.scheduledAt,
      tz: form.value.tz,
      durationMin: form.value.durationMin,
      interviewerName: form.value.interviewerName,
      meetUrl,
      candidateTz,
      attendees: delivery.action === "refuse" ? [] : delivery.calendarAttendees,
      requestId: `invite-${params.candidateId.slice(0, 8)}-${Date.now()}`,
    });

  if (delivery.action === "refuse") {
    const preview = previewOf(null);
    return NextResponse.json(
      {
        success: false,
        sent: false,
        persisted: false,
        action: "refuse",
        error: delivery.error,
        suppressed: [],
        from: preview.from,
        email: { to: [], subject: preview.subject, html: preview.html },
        event: preview.event,
        meet_url: null,
        calendar_event_id: null,
        reconnect: null,
      },
      { status: inviteIsGuarded() ? 400 : 403 },
    );
  }

  if (delivery.action === "dry_run") {
    const preview = previewOf(null);
    return NextResponse.json({
      success: true,
      sent: false,
      persisted: false,
      action: "dry_run",
      error: null,
      suppressed: delivery.suppressed,
      from: preview.from,
      email: { to: [], subject: preview.subject, html: preview.html },
      event: preview.event,
      meet_url: null,
      calendar_event_id: null,
      reconnect: googleReconnectBanner({
        environment: google.environment,
        connected: google.connected,
        calendarScopeOk: google.calendar_scope_ok,
      }),
      note: "Vista previa. No se envió correo, no se creó el evento y no se escribió la invitación: el correo del candidato no está en la lista de prueba.",
    });
  }

  if (!google.connected) {
    const banner = googleReconnectBanner({
      environment: google.environment,
      connected: false,
      calendarScopeOk: false,
    });
    return NextResponse.json(
      {
        success: false,
        sent: false,
        action: "blocked_scope",
        error:
          google.environment === "preview"
            ? PREVIEW_GOOGLE_CONNECT_LABEL
            : "Gmail no está conectado. Entrá a /api/google/auth con jointheteam@tradingsolutions.com.",
        reconnect: banner,
      },
      { status: 409 },
    );
  }
  if (!google.calendar_scope_ok) {
    const preview = previewOf(null);
    return NextResponse.json(
      {
        success: false,
        sent: false,
        persisted: false,
        action: "blocked_scope",
        error: RECONNECT_CALENDAR_LABEL,
        suppressed: delivery.suppressed,
        from: preview.from,
        email: { to: delivery.emailTo, subject: preview.subject, html: preview.html },
        event: preview.event,
        meet_url: null,
        calendar_event_id: null,
        reconnect: { label: RECONNECT_CALENDAR_LABEL, href: RECONNECT_CALENDAR_PATH },
      },
      { status: 409 },
    );
  }

  if (delivery.calendarAttendees.length === 0) {
    return NextResponse.json(
      { success: false, sent: false, error: "No quedó ningún asistente dentro de la lista de prueba." },
      { status: 400 },
    );
  }

  const draft = previewOf(null);
  const created = await insertInterviewEvent({
    summary: draft.event.summary,
    description: draft.event.description,
    start: draft.event.start,
    end: draft.event.end,
    attendees: draft.event.attendees,
    conferenceData: draft.event.conferenceData,
  });
  if (!created.ok) {
    if (created.status === 403) {
      return NextResponse.json(
        {
          success: false,
          sent: false,
          action: "blocked_scope",
          error: RECONNECT_CALENDAR_LABEL,
          reconnect: { label: RECONNECT_CALENDAR_LABEL, href: RECONNECT_CALENDAR_PATH },
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: false, sent: false, error: created.error }, { status: 502 });
  }

  const finalArtifacts = previewOf(created.meet_url || null);
  // El payload ya se insertó con el requestId anterior. El correo usa el Meet real.
  const mailed = await sendCandidateMail({
    to: delivery.emailTo.join(", "),
    candidate: delivery.emailTo[0] || null,
    type: "interview_invite",
    subject: finalArtifacts.subject,
    html: finalArtifacts.html,
    replyTo: "jointheteam@tradingsolutions.com",
    dedupKey: `interview_invite:${params.candidateId}:${form.value.scheduledAt.toISOString()}`,
  });
  const mailSent = mailed.status === "sent";
  if (!mailSent && mailed.status !== "pending") {
    await deleteCalendarEvent(created.event_id);
    return NextResponse.json({
      success: false,
      sent: false,
      email_status: mailed.status,
      persisted: false,
      action: "send",
      error: mailed.status,
      calendar_event_id: null,
      meet_url: null,
    }, { status: 502 });
  }

  let persisted = false;
  let recordError: string | undefined;
  let interviewId: string | null = null;
  if (delivery.persist) {
    const interviewerEmails = delivery.calendarAttendees.includes(normalizeEmail(form.value.interviewerEmail))
      ? [normalizeEmail(form.value.interviewerEmail)]
      : [];
    const { data: row, error: insErr } = await supabaseAdmin
      .from("ht_interviews")
      .insert({
        candidate_id: params.candidateId,
        vacancy_id: candidate.vacancy_id,
        round: form.value.round,
        scheduled_at: form.value.scheduledAt.toISOString(),
        duration_min: form.value.durationMin,
        tz: form.value.tz,
        interviewer_emails: interviewerEmails,
        calendar_event_id: created.event_id,
        meet_url: created.meet_url || null,
        status: "scheduled",
        created_by: google.email || "hr-admin",
      })
      .select("id")
      .single();
    if (insErr) {
      recordError = missingInterviewsTable(insErr.message)
        ? "ht_interviews no existe en esta base. La migración está en el repo y no se aplicó a propósito."
        : insErr.message;
    } else {
      persisted = true;
      interviewId = row?.id ?? null;
      await recordStageEvent({
        candidateId: params.candidateId,
        fromStage: candidate.stage ?? null,
        toStage: form.value.round === "wellness" ? "entrevista_wellness" : "entrevista_hm",
        vacancyId: candidate.vacancy_id ?? null,
        source: "ui",
        changedBy: google.email || "hr-admin",
        note: [
          `Invitación ${form.value.round}`,
          `${form.value.date} ${form.value.time} ${form.value.tz}`,
          created.meet_url || "",
          delivery.suppressed.length
            ? `Suprimidos en preview: ${delivery.suppressed.map((s) => s.email).join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
  }

  return NextResponse.json({
    success: true,
    sent: mailSent,
    email_status: mailed.status,
    persisted,
    interview_id: interviewId,
    action: "send",
    error: null,
    record_error: recordError || null,
    suppressed: delivery.suppressed,
    from: interviewFromHeader(google.email || "jointheteam@tradingsolutions.com"),
    email: { to: delivery.emailTo, subject: finalArtifacts.subject, html: finalArtifacts.html },
    event: {
      ...draft.event,
      description: finalArtifacts.event.description,
    },
    meet_url: created.meet_url || null,
    calendar_event_id: created.event_id,
    gmail_id: mailSent ? mailed.gmail_id : null,
    reconnect: null,
  }, { status: 200 });
}
