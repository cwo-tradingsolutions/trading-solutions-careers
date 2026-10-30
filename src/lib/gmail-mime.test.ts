import assert from "node:assert/strict";
import test from "node:test";
import { buildAlternativeBody, encodeSubject, isSafeMailbox, stripHeaderBreaks, wrapBase64 } from "./gmail-mime.ts";
import { nextAttemptDelayMs, MAX_SEND_ATTEMPTS } from "./ats-mail.ts";

test("headers lose CR and LF, and a public email must be a single address", () => {
  assert.equal(stripHeaderBreaks("ana@example.com\r\nBcc: evil@example.com"), "ana@example.com Bcc: evil@example.com");
  assert.equal(isSafeMailbox("ana@example.com"), true);
  assert.equal(isSafeMailbox("ana@example.com\nBcc: evil@example.com"), false);
  assert.equal(isSafeMailbox("not an email"), false);
});

test("subjects fold into short encoded-words and bodies wrap at 76", () => {
  const subject = encodeSubject("Entrevista – Señora Muñoz " + "á".repeat(80));
  for (const word of subject.split(/\r\n /)) {
    assert.ok(word.length <= 75, word);
  }
  const { body } = buildAlternativeBody("<p>Hola</p>" + "x".repeat(200));
  assert.match(body, /text\/plain/);
  assert.match(body, /text\/html/);
  for (const line of wrapBase64("y".repeat(200)).split("\r\n")) {
    assert.ok(line.length <= 76);
  }
});

test("retries back off and then stop", () => {
  assert.equal(nextAttemptDelayMs(1), 60_000);
  assert.equal(nextAttemptDelayMs(2), 120_000);
  assert.ok(nextAttemptDelayMs(3) > nextAttemptDelayMs(2));
  assert.equal(nextAttemptDelayMs(20), 360 * 60_000);
  assert.equal(MAX_SEND_ATTEMPTS, 5);
});
