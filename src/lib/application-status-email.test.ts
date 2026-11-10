import assert from "node:assert/strict";
import { test } from "node:test";
import { applicationStatusEmailsEnabled } from "./application-status-email";

test("application status emails stay off unless APPLICATION_STATUS_EMAILS_ENABLED is explicitly on", () => {
  assert.equal(applicationStatusEmailsEnabled(undefined), false);
  assert.equal(applicationStatusEmailsEnabled(""), false);
  assert.equal(applicationStatusEmailsEnabled("0"), false);
  assert.equal(applicationStatusEmailsEnabled("false"), false);
  assert.equal(applicationStatusEmailsEnabled("1"), true);
  assert.equal(applicationStatusEmailsEnabled("true"), true);
  assert.equal(applicationStatusEmailsEnabled("yes"), true);
  assert.equal(applicationStatusEmailsEnabled("on"), true);
});
