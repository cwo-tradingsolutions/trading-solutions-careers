import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, test } from "node:test";
import {
  generatePortalToken,
  isValidSignatureFor,
  legacyPortalSecret,
  legacyPortalUntilMs,
} from "./portal-token.ts";
import { cronSecretHttpStatus, readCronSecret, shouldExitOnStartupFailure, startupSecretFailure } from "./hr-admin-secrets.ts";
import { cronAuthorized, cronPresentedSecret, cronRequestDecision } from "./cron-request-auth.ts";

const KEYS = ["PORTAL_TOKEN_SECRET", "ADMIN_SECRET", "HR_ADMIN_SESSION_SECRET", "ADMIN_SCRIPTS_SECRET", "WXM_SERVICE_SECRET", "CRON_SECRET", "PORTAL_TOKEN_LEGACY_UNTIL", "K_SERVICE", "VERCEL_ENV", "NEXT_PHASE", "npm_lifecycle_event"] as const;
const FIXED_NOW = Date.parse("2026-11-01T15:00:00.000Z");
const originals = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
const PORTAL = "portal-token-secret-value-32chars-min";
const ADMIN = "admin-secret-value-sixteen";
const SESSION = "hr-admin-session-signing-secret";

afterEach(() => {
  for (const key of KEYS) {
    if (originals[key] === undefined) delete process.env[key];
    else process.env[key] = originals[key];
  }
});

function legacySig(applicationId: number, email: string, secret: string): string {
  const data = `${applicationId}|${email.toLowerCase().trim()}`;
  return crypto.createHmac("sha256", secret).update(data).digest("hex").slice(0, 16);
}

test("new portal links are signed with PORTAL_TOKEN_SECRET", () => {
  process.env.PORTAL_TOKEN_SECRET = PORTAL;
  process.env.ADMIN_SECRET = ADMIN;
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  const token = generatePortalToken(42, "Ada@Example.com");
  const signature = token.split(".")[1];
  assert.equal(isValidSignatureFor(42, "ada@example.com", signature), true);
  assert.equal(isValidSignatureFor(42, "ada@example.com", legacySig(42, "ada@example.com", ADMIN)), false);
});

test("legacy portal links accept only a YYYY-MM-DD within 14 days and a 16 character ADMIN_SECRET", () => {
  process.env.PORTAL_TOKEN_SECRET = PORTAL;
  process.env.ADMIN_SECRET = ADMIN;
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  const old = legacySig(7, "ada@example.com", ADMIN);
  process.env.PORTAL_TOKEN_LEGACY_UNTIL = "2026-11-06";
  assert.notEqual(legacyPortalSecret(FIXED_NOW), null);
  assert.equal(isValidSignatureFor(7, "ada@example.com", old, FIXED_NOW), true);

  assert.notEqual(legacyPortalUntilMs("2026-11-12"), null);
  assert.equal(legacyPortalUntilMs("2026-11-13"), null);
  assert.equal(legacyPortalUntilMs("2099-12-31"), null);
  assert.equal(legacyPortalUntilMs("2026-02-30"), null);
  process.env.PORTAL_TOKEN_LEGACY_UNTIL = "2026-11-13";
  assert.equal(isValidSignatureFor(7, "ada@example.com", old, FIXED_NOW), false);
  assert.match(startupSecretFailure() ?? "", /more than 14 days/);

  process.env.PORTAL_TOKEN_LEGACY_UNTIL = "2026-02-30";
  assert.match(startupSecretFailure() ?? "", /not a real calendar date: 2026-02-30/);
  assert.equal(isValidSignatureFor(7, "ada@example.com", old, FIXED_NOW), false);

  for (const bad of ["2099-12-31", "Nov 6 2026", "2099-01-02T00:00:00.000Z", "99999", ""]) {
    assert.equal(legacyPortalUntilMs(bad), null, bad);
  }

  process.env.PORTAL_TOKEN_LEGACY_UNTIL = "2026-11-04";
  process.env.ADMIN_SECRET = "short-secret";
  assert.equal(legacyPortalSecret(FIXED_NOW), null);
  assert.equal(isValidSignatureFor(7, "ada@example.com", old, FIXED_NOW), false);
});

test("a portal secret that matches another auth secret is refused", () => {
  process.env.PORTAL_TOKEN_SECRET = PORTAL;
  process.env.ADMIN_SECRET = PORTAL;
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  assert.throws(() => generatePortalToken(1, "ada@example.com"), /PORTAL_TOKEN_SECRET/);
  assert.equal(isValidSignatureFor(1, "ada@example.com", legacySig(1, "ada@example.com", PORTAL)), false);
});

test("startup exits only for a live production host, and a bad portal secret is fatal", () => {
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  process.env.ADMIN_SECRET = ADMIN;
  delete process.env.PORTAL_TOKEN_SECRET;
  assert.match(startupSecretFailure() ?? "", /PORTAL_TOKEN_SECRET/);
  process.env.K_SERVICE = "careers";
  process.env.NEXT_PHASE = "phase-production-build";
  assert.equal(shouldExitOnStartupFailure(), false);
  delete process.env.NEXT_PHASE;
  process.env.npm_lifecycle_event = "build";
  assert.equal(shouldExitOnStartupFailure(), false);
  delete process.env.npm_lifecycle_event;
  assert.equal(shouldExitOnStartupFailure(), true);
  delete process.env.K_SERVICE;
  process.env.VERCEL_ENV = "preview";
  assert.equal(shouldExitOnStartupFailure(), false);
  process.env.VERCEL_ENV = "production";
  assert.equal(shouldExitOnStartupFailure(), true);
  delete process.env.K_SERVICE;
  delete process.env.VERCEL_ENV;
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  process.env.PORTAL_TOKEN_SECRET = PORTAL;
  process.env.ADMIN_SECRET = ADMIN;
  delete process.env.CRON_SECRET;
  assert.equal(startupSecretFailure(), null);
  assert.equal(readCronSecret(), null);
  process.env.CRON_SECRET = "short-cron";
  assert.equal(readCronSecret(), null);
  assert.equal(startupSecretFailure(), null);
  process.env.CRON_SECRET = SESSION;
  assert.equal(readCronSecret(), null);
  assert.equal(cronSecretHttpStatus(), 500);
  assert.match(startupSecretFailure() ?? "", /HR_ADMIN_SESSION_SECRET/);
  process.env.CRON_SECRET = PORTAL;
  assert.equal(cronSecretHttpStatus(), 500);
  process.env.CRON_SECRET = ADMIN;
  assert.equal(cronSecretHttpStatus(), 401);
  process.env.CRON_SECRET = "wxm-service-secret-value";
  process.env.WXM_SERVICE_SECRET = "wxm-service-secret-value";
  assert.equal(readCronSecret(), null);
  assert.equal(cronSecretHttpStatus(), 401);
  process.env.WXM_SERVICE_SECRET = "wxm-service-secret-other";
  process.env.CRON_SECRET = "cron-secret-sixteen-chars";
  assert.equal(cronSecretHttpStatus(), null);
  assert.equal(readCronSecret(), "cron-secret-sixteen-chars");
  assert.equal(cronPresentedSecret("Bearer cron-secret-sixteen-chars", null), "cron-secret-sixteen-chars");
  assert.equal(cronPresentedSecret("Bearer ignored", "cron-secret-sixteen-chars"), "cron-secret-sixteen-chars");
  assert.equal(cronAuthorized("cron-secret-sixteen-chars", readCronSecret()), true);
  assert.equal(cronAuthorized("cron-secret-sixteen-charX", readCronSecret()), false);
  assert.equal(cronRequestDecision("Bearer cron-secret-sixteen-chars", null), "ok");
  assert.equal(cronRequestDecision(null, "cron-secret-sixteen-chars"), "ok");
  assert.equal(cronRequestDecision(null, null), "admin");
});
