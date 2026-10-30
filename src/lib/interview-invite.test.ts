import assert from "node:assert/strict";
import { test } from "node:test";
import { ATS_FROM_NAME } from "./ats-from";
import { GOOGLE_OAUTH_SCOPES, hasCalendarWriteScope } from "./google-scopes";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRoundOrder,
  buildInviteArtifacts,
  buildMeetEventPayload,
  decideDelivery,
  googleReconnectBanner,
  interviewFromHeader,
  interviewInviteGuarded,
  PREVIEW_GOOGLE_CONNECT_LABEL,
  renderInterviewEmail,
  validateInviteForm,
  zonedWallTimeToUtc,
} from "./interview-invite";

const ALLOWLIST = "cwo@tradingsolutions.com,jointheteam@tradingsolutions.com";

test("HM is blocked until a Wellness interview exists or was held", () => {
  assert.equal(assertRoundOrder("wellness", []).ok, true);
  const blocked = assertRoundOrder("hm", []);
  assert.equal(blocked.ok, false);
  assert.equal(assertRoundOrder("hm", [{ round: "wellness", status: "cancelled", deleted_at: null }]).ok, false);
  assert.equal(assertRoundOrder("hm", [{ round: "wellness", status: "scheduled", deleted_at: "2026-11-01" }]).ok, false);
  assert.equal(assertRoundOrder("hm", [{ round: "wellness", status: "scheduled", deleted_at: null }]).ok, true);
  assert.equal(assertRoundOrder("hm", [{ round: "wellness", status: "done", deleted_at: null }]).ok, true);
});

test("Cloud Run prd-careers with no VERCEL_ENV is production, not allowlist mode", () => {
  assert.equal(interviewInviteGuarded({ K_SERVICE: "prd-careers" }), false);
  assert.equal(interviewInviteGuarded({ K_SERVICE: "prd-careers", VERCEL_ENV: undefined }), false);
  assert.equal("VERCEL_ENV" in { K_SERVICE: "prd-careers" }, false);
  assert.equal(interviewInviteGuarded({ K_SERVICE: "prd-careers-canary" }), false);
  assert.equal(interviewInviteGuarded({ VERCEL_ENV: "production" }), false);
  assert.equal(interviewInviteGuarded({ K_SERVICE: "stg-careers" }), true);
  assert.equal(interviewInviteGuarded({ K_SERVICE: "stg-careers", VERCEL_ENV: "production" }), true);
  assert.equal(interviewInviteGuarded({ VERCEL_ENV: "preview" }), true);
  assert.equal(interviewInviteGuarded({ VERCEL_ENV: "development" }), true);
  assert.equal(interviewInviteGuarded({}), true);
  assert.equal(interviewInviteGuarded({ K_SERVICE: "custom-careers" }), true);

  const route = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../app/api/headhunting/candidates/[candidateId]/interview-invite/route.ts"),
    "utf8",
  );
  assert.match(route, /interviewInviteGuarded\(/);
  assert.equal(route.includes('VERCEL_ENV !== "production"'), false);
  assert.equal(route.includes('VERCEL_ENV === "production"'), false);
});

test("allowlist refuses when unset and redirects a real candidate away from coo@", () => {
  const unset = decideDelivery({
    vercelEnv: "preview",
    invitesEnabledFlag: undefined,
    allowlistRaw: undefined,
    candidateEmail: "ana@example.com",
    interviewerEmail: "coo@tradingsolutions.com",
  });
  assert.equal(unset.action, "refuse");
  if (unset.action === "refuse") assert.match(unset.error, /INTERVIEW_TEST_RECIPIENTS/);

  const redirected = decideDelivery({
    vercelEnv: "preview",
    invitesEnabledFlag: undefined,
    allowlistRaw: ALLOWLIST,
    candidateEmail: "ana.real@gmail.com",
    interviewerEmail: "coo@tradingsolutions.com",
  });
  assert.equal(redirected.action, "send");
  if (redirected.action === "send") {
    assert.deepEqual(redirected.emailTo, ["cwo@tradingsolutions.com", "jointheteam@tradingsolutions.com"]);
    assert.deepEqual(redirected.calendarAttendees, redirected.emailTo);
    assert.equal(redirected.persist, false);
    assert.ok(!redirected.emailTo.includes("ana.real@gmail.com"));
    assert.ok(!redirected.emailTo.includes("coo@tradingsolutions.com"));
    assert.ok(redirected.suppressed.some((s) => s.email === "coo@tradingsolutions.com" && s.role === "interviewer"));
    assert.ok(redirected.suppressed.some((s) => s.email === "ana.real@gmail.com"));
  }
});

test("coo@ is suppressed in preview even when the candidate mailbox is allowlisted", () => {
  const sent = decideDelivery({
    vercelEnv: "preview",
    invitesEnabledFlag: "true",
    allowlistRaw: `${ALLOWLIST},coo@tradingsolutions.com`,
    candidateEmail: "jointheteam@tradingsolutions.com",
    interviewerEmail: "COO@tradingsolutions.com",
  });
  assert.equal(sent.action, "send");
  if (sent.action !== "send") return;
  assert.deepEqual(sent.emailTo, ["jointheteam@tradingsolutions.com"]);
  assert.deepEqual(sent.calendarAttendees, ["jointheteam@tradingsolutions.com"]);
  assert.equal(sent.persist, true);
  assert.ok(sent.suppressed.some((s) => s.email === "coo@tradingsolutions.com"));
  assert.ok(!sent.emailTo.includes("coo@tradingsolutions.com"));
  assert.ok(!sent.calendarAttendees.includes("coo@tradingsolutions.com"));

  const event = buildMeetEventPayload({
    summary: "HM",
    description: "preview",
    start: new Date("2026-11-04T15:00:00.000Z"),
    durationMin: 45,
    tz: "America/Bogota",
    attendees: sent.calendarAttendees,
    requestId: "invite-test",
  });
  assert.deepEqual(event.attendees, [{ email: "jointheteam@tradingsolutions.com" }]);
  assert.ok(!JSON.stringify(event).includes("coo@"));
});

test("production allowlist fails closed and only an explicit flag lifts it", () => {
  const missing = decideDelivery({
    vercelEnv: "production",
    invitesEnabledFlag: "true",
    allowlistRaw: undefined,
    candidateEmail: "ana@example.com",
    interviewerEmail: "coo@tradingsolutions.com",
  });
  assert.equal(missing.action, "refuse");
  if (missing.action === "refuse") assert.match(missing.error, /INTERVIEW_TEST_RECIPIENTS/);

  const empty = decideDelivery({
    vercelEnv: "production",
    invitesEnabledFlag: "true",
    allowlistRaw: "   ",
    candidateEmail: "ana@example.com",
    interviewerEmail: "coo@tradingsolutions.com",
  });
  assert.equal(empty.action, "refuse");

  const limited = decideDelivery({
    vercelEnv: "production",
    invitesEnabledFlag: "true",
    allowlistRaw: ALLOWLIST,
    candidateEmail: "ana@example.com",
    interviewerEmail: "coo@tradingsolutions.com",
  });
  assert.equal(limited.action, "send");
  if (limited.action === "send") {
    assert.deepEqual(limited.emailTo, ["cwo@tradingsolutions.com", "jointheteam@tradingsolutions.com"]);
    assert.ok(!limited.emailTo.includes("ana@example.com"));
    assert.ok(!limited.calendarAttendees.includes("coo@tradingsolutions.com"));
    assert.equal(limited.persist, false);
  }

  const lifted = decideDelivery({
    vercelEnv: "production",
    invitesEnabledFlag: undefined,
    unrestrictedFlag: "1",
    allowlistRaw: undefined,
    candidateEmail: "ana@example.com",
    interviewerEmail: "coo@tradingsolutions.com",
  });
  assert.equal(lifted.action, "send");
  if (lifted.action === "send") {
    assert.deepEqual(lifted.emailTo, ["ana@example.com"]);
    assert.deepEqual(lifted.calendarAttendees, ["ana@example.com", "coo@tradingsolutions.com"]);
    assert.equal(lifted.persist, true);
  }
});

test("From display name is Talent Acquisition Team", () => {
  assert.equal(ATS_FROM_NAME, "Talent Acquisition Team");
  assert.equal(interviewFromHeader(), "Talent Acquisition Team <jointheteam@tradingsolutions.com>");
  assert.doesNotMatch(interviewFromHeader(), /Kelly|Trading Recruitment|Castañeda/i);
});

test("interview email renders in EN and ES with time zone, duration and Meet link", () => {
  const when = new Date("2026-11-04T15:00:00.000Z");
  const meet = "https://meet.google.com/abc-defg-hij";
  const es = renderInterviewEmail({
    lang: "es",
    firstName: "Ana",
    vacancyTitle: "Analista de precios",
    round: "wellness",
    when,
    tz: "America/Bogota",
    durationMin: 45,
    interviewerName: "Talent Acquisition Team",
    meetUrl: meet,
    candidateTz: null,
  });
  assert.match(es.subject, /Wellness/);
  assert.match(es.html, /Hola/);
  assert.match(es.html, /Duración/);
  assert.match(es.html, /45/);
  assert.match(es.html, /10:00/);
  assert.match(es.html, /America\/Bogota/);
  assert.match(es.html, /meet\.google\.com\/abc-defg-hij/);
  assert.match(es.html, /Talent Acquisition Team/);
  assert.equal(es.fromName, "Talent Acquisition Team");
  assert.doesNotMatch(es.html, /Kelly|Trading Recruitment/i);

  const en = renderInterviewEmail({
    lang: "en",
    firstName: "Wei",
    vacancyTitle: "Builder",
    round: "hm",
    when,
    tz: "America/Bogota",
    durationMin: 45,
    interviewerName: "Jaime",
    meetUrl: meet,
    candidateTz: "Asia/Shanghai",
  });
  assert.match(en.html, /Hi Wei/);
  assert.match(en.html, /Duration/);
  assert.match(en.html, /10:00/);
  assert.match(en.html, /America\/Bogota/);
  assert.match(en.html, /23:00/);
  assert.match(en.html, /Asia\/Shanghai/);
  assert.match(en.html, /meet\.google\.com\/abc-defg-hij/);
  assert.match(en.html, /Talent Acquisition Team/);
  assert.doesNotMatch(en.html, /Duración|Kelly|Trading Recruitment/i);
});

test("Meet event payload asks Calendar to create a Hangouts Meet conference", () => {
  const start = zonedWallTimeToUtc("2026-11-04", "10:00", "America/Bogota");
  assert.equal(start.toISOString(), "2026-11-04T15:00:00.000Z");
  const built = buildInviteArtifacts({
    lang: "es",
    firstName: "Ana",
    vacancyTitle: "Analista",
    round: "hm",
    when: start,
    tz: "America/Bogota",
    durationMin: 45,
    interviewerName: "Jaime",
    meetUrl: null,
    attendees: ["jointheteam@tradingsolutions.com"],
    requestId: "invite-ana",
  });
  assert.equal(built.from, "Talent Acquisition Team <jointheteam@tradingsolutions.com>");
  assert.equal(built.event.sendUpdates, "all");
  assert.equal(built.event.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
  assert.equal(built.event.conferenceData.createRequest.requestId, "invite-ana");
  assert.equal(built.event.start.timeZone, "America/Bogota");
  assert.equal(built.event.end.dateTime, "2026-11-04T15:45:00.000Z");
  assert.deepEqual(built.event.attendees, [{ email: "jointheteam@tradingsolutions.com" }]);
});

function formError(body: Parameters<typeof validateInviteForm>[0]): string {
  const result = validateInviteForm(body);
  assert.equal(result.ok, false);
  if (result.ok) return "";
  return result.error;
}

test("the form requires date, time, timezone, duration and interviewer", () => {
  const base = {
    round: "wellness" as const,
    date: "2026-11-04",
    time: "10:00",
    tz: "America/Bogota",
    duration_min: 45,
    interviewer_name: "Talent Acquisition Team",
    interviewer_email: "jointheteam@tradingsolutions.com",
  };
  assert.equal(validateInviteForm(base).ok, true);
  assert.match(formError({ ...base, date: "" }), /fecha/i);
  assert.match(formError({ ...base, time: "" }), /hora/i);
  assert.match(formError({ ...base, tz: "" }), /zona horaria/i);
  assert.match(formError({ ...base, duration_min: "" }), /duración/i);
  assert.match(formError({ ...base, interviewer_name: "  " }), /entrevistador/i);
  assert.match(formError({ ...base, interviewer_email: "" }), /correo del entrevistador/i);
});

test("preview without its own token shows Conecta Google para preview and does not reuse the calendar reconnect", () => {
  const banner = googleReconnectBanner({ environment: "preview", connected: false, calendarScopeOk: false });
  assert.equal(banner?.label, PREVIEW_GOOGLE_CONNECT_LABEL);
  assert.equal(banner?.label, "Conecta Google para preview");
  assert.equal(banner?.href, "/api/google/auth");

  const scoped = googleReconnectBanner({ environment: "preview", connected: true, calendarScopeOk: false });
  assert.equal(scoped?.label, "Reconectar Google (falta permiso de Calendar)");

  const ready = googleReconnectBanner({ environment: "preview", connected: true, calendarScopeOk: true });
  assert.equal(ready, null);

  const production = googleReconnectBanner({ environment: "production", connected: false, calendarScopeOk: false });
  assert.equal(production?.label, "Reconectar Google (falta permiso de Calendar)");
});

test("calendar.events is requested and a gmail-only grant must reconnect", () => {
  assert.ok(GOOGLE_OAUTH_SCOPES.includes("https://www.googleapis.com/auth/calendar.events"));
  assert.equal(hasCalendarWriteScope("https://www.googleapis.com/auth/gmail.compose"), false);
  assert.equal(hasCalendarWriteScope("https://www.googleapis.com/auth/calendar"), true);
  assert.equal(hasCalendarWriteScope("https://www.googleapis.com/auth/calendar.events"), true);
});
