import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REJECTION_BODY,
  buildRejectionHtml,
  rejectionEmailsEnabled,
  rejectionPlain,
  rejectionSentAt,
  rejectionSubject,
} from "./rejection-email";

test("rejection emails stay off unless REJECTION_EMAILS_ENABLED is explicitly on", () => {
  assert.equal(rejectionEmailsEnabled(undefined), false);
  assert.equal(rejectionEmailsEnabled(""), false);
  assert.equal(rejectionEmailsEnabled("0"), false);
  assert.equal(rejectionEmailsEnabled("false"), false);
  assert.equal(rejectionEmailsEnabled("1"), true);
  assert.equal(rejectionEmailsEnabled("true"), true);
  assert.equal(rejectionSentAt(false), null);
  assert.match(rejectionSentAt(true, new Date("2026-10-30T13:36:00.000Z")) || "", /2026-10-30T13:36:00/);
});

test("approved ES and EN rejection copy is general and signed once", () => {
  assert.equal(
    rejectionSubject("Operations Specialist", "es"),
    "Trading Solutions · Sobre tu aplicación a Operations Specialist",
  );
  assert.equal(
    rejectionSubject("Operations Specialist", "en"),
    "Trading Solutions · About your application for Operations Specialist",
  );
  for (const lang of ["es", "en"] as const) {
    const plain = rejectionPlain("Ana", "Operations Specialist", lang);
    assert.equal(plain, REJECTION_BODY[lang].replaceAll("{firstName}", "Ana").replaceAll("{vacancy}", "Operations Specialist"));
    assert.doesNotMatch(plain, /salario|salary|inglés|english level|autoriz|on-site|presencial|experiencia|experience/i);
    const html = buildRejectionHtml("Ana", "Operations Specialist", lang);
    const signatures = html.match(/Talent Acquisition Team/g) || [];
    assert.equal(signatures.length, 1);
    assert.doesNotMatch(html, /Talent Team(?! )/);
    assert.equal((html.match(/linkedin\.com\/company\/trading-sol/g) || []).length, 1);
  }
});
