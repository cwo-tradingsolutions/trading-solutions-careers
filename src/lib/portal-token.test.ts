import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, test } from "node:test";
import {
  generatePortalToken,
  isValidSignatureFor,
  legacyPortalSecret,
} from "./portal-token.ts";

const KEYS = ["PORTAL_TOKEN_SECRET", "ADMIN_SECRET", "HR_ADMIN_SESSION_SECRET", "ADMIN_SCRIPTS_SECRET", "PORTAL_TOKEN_LEGACY_UNTIL"] as const;
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

test("ADMIN_SECRET signatures work only until PORTAL_TOKEN_LEGACY_UNTIL", () => {
  process.env.PORTAL_TOKEN_SECRET = PORTAL;
  process.env.ADMIN_SECRET = ADMIN;
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  const old = legacySig(7, "ada@example.com", ADMIN);
  process.env.PORTAL_TOKEN_LEGACY_UNTIL = "2099-01-02";
  assert.equal(legacyPortalSecret(Date.parse("2099-01-02T12:00:00.000Z")) !== null, true);
  assert.equal(isValidSignatureFor(7, "ada@example.com", old), true);
  assert.equal(legacyPortalSecret(Date.parse("2099-01-03T00:00:00.000Z")), null);
  process.env.PORTAL_TOKEN_LEGACY_UNTIL = "2000-01-01T00:00:00.000Z";
  assert.equal(isValidSignatureFor(7, "ada@example.com", old), false);
  delete process.env.PORTAL_TOKEN_LEGACY_UNTIL;
  assert.equal(isValidSignatureFor(7, "ada@example.com", old), false);
});

test("a portal secret that matches another auth secret is refused", () => {
  process.env.PORTAL_TOKEN_SECRET = PORTAL;
  process.env.ADMIN_SECRET = PORTAL;
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  assert.throws(() => generatePortalToken(1, "ada@example.com"), /PORTAL_TOKEN_SECRET/);
  assert.equal(isValidSignatureFor(1, "ada@example.com", legacySig(1, "ada@example.com", PORTAL)), false);
});
