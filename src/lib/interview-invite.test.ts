import assert from "node:assert/strict";
import { test } from "node:test";
import { ATS_FROM_NAME } from "./ats-from";
import { GOOGLE_OAUTH_SCOPES, hasCalendarWriteScope } from "./google-scopes";
import {
  assertRoundOrder,
  buildInviteArtifacts,
  buildMeetEventPayload,
  decideDelivery,
  interviewFromHeader,
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

test("preview allowlist refuses when unset and strips coo@", () => {
  const unset = decideDelivery({
    vercelEnv: "preview",
    invitesEnabledFlag: undefined,
    allowlistRaw: undefined,
    candidateEmail: "ana@example.com",
    interviewerEmail: "coo@tradingsolutions.com",
  });
  assert.equal(unset.action, "refuse");
  if (unset.action === "refuse") assert.match(unset.error, /INTERVIEW_TEST_RECIPIENTS/);

  const dry = decideDelivery({
    vercelEnv: "preview",
    invitesEnabledFlag: undefined,
    allowlistRaw: ALLOWLIST,
    candidateEmail: "ana.real@gmail.com",
    interviewerEmail: "coo@tradingsolutions.com",
  });
  assert.equal(dry.action, "dry_run");
  if (dry.action === "dry_run") {
    assert.deepEqual(dry.emailTo, []);
    assert.deepEqual(dry.calendarAttendees, []);
    assert.equal(dry.persist, false);
    assert.ok(dry.suppressed.some((s) => s.email === "coo@tradingsolutions.com" && s.role === "interviewer"));
    assert.ok(dry.suppressed.some((s) => s.email === "ana.real@gmail.com"));
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

test("production stays off unless INTERVIEW_INVITES_ENABLED is set", () => {
  const off = decideDelivery({
    vercelEnv: "production",
    invitesEnabledFlag: undefined,
    allowlistRaw: ALLOWLIST,
    candidateEmail: "ana@example.com",
    interviewerEmail: "coo@tradingsolutions.com",
  });
  assert.equal(off.action, "refuse");
  if (off.action === "refuse") assert.match(off.error, /INTERVIEW_INVITES_ENABLED/);

  const on = decideDelivery({
    vercelEnv: "production",
    invitesEnabledFlag: "true",
    allowlistRaw: undefined,
    candidateEmail: "ana@example.com",
    interviewerEmail: "coo@tradingsolutions.com",
  });
  assert.equal(on.action, "send");
  if (on.action === "send") {
    assert.deepEqual(on.calendarAttendees, ["ana@example.com", "coo@tradingsolutions.com"]);
    assert.equal(on.persist, true);
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

test("calendar.events is requested and a gmail-only grant must reconnect", () => {
  assert.ok(GOOGLE_OAUTH_SCOPES.includes("https://www.googleapis.com/auth/calendar.events"));
  assert.equal(hasCalendarWriteScope("https://www.googleapis.com/auth/gmail.compose"), false);
  assert.equal(hasCalendarWriteScope("https://www.googleapis.com/auth/calendar"), true);
  assert.equal(hasCalendarWriteScope("https://www.googleapis.com/auth/calendar.events"), true);
});
