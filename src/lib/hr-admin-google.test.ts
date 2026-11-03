import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAllowlist, assertGoogleIdClaims, isPasswordLoginEnabled } from "./hr-admin-access";
import { adminOAuthRedirectUri, googleAuthorizeUrl, signOAuthTransaction, readOAuthTransaction } from "./hr-admin-oauth";
import { signAdminSession, readAdminSession } from "./hr-admin-session";

const S = "x".repeat(32);

test("redirect uri exacto", () => {
  assert.equal(adminOAuthRedirectUri("https://careers.tradingsolutions.com"),
    "https://careers.tradingsolutions.com/api/hr-admin/login/google/callback");
});

test("authorize url con hd y redirect", () => {
  const u = new URL(googleAuthorizeUrl({ clientId: "c", redirectUri: "https://a/cb", state: "s", nonce: "n", codeChallenge: "x" }));
  assert.equal(u.host, "accounts.google.com");
  assert.equal(u.searchParams.get("hd"), "tradingsolutions.com");
  assert.equal(u.searchParams.get("redirect_uri"), "https://a/cb");
});

test("allowlist solo cwo@", () => {
  const al = parseAllowlist("cwo@tradingsolutions.com");
  const base = { iss: "https://accounts.google.com", aud: "c", exp: Math.floor(Date.now() / 1000) + 60, email_verified: true, hd: "tradingsolutions.com", nonce: "n" };
  const opts = { audience: "c", allowlist: al, now: Date.now(), nonce: "n" };
  assert.deepEqual(assertGoogleIdClaims({ ...base, email: "CWO@tradingsolutions.com" }, opts), { ok: true, email: "cwo@tradingsolutions.com" });
  assert.equal(assertGoogleIdClaims({ ...base, email: "otro@tradingsolutions.com" }, opts).ok, false);
  assert.equal(assertGoogleIdClaims({ ...base, email: "cwo@tradingsolutions.com", nonce: "z" }, opts).ok, false);
  assert.equal(parseAllowlist("").length, 0);
});

test("sesión firmada con email y transacción OAuth", () => {
  const tok = signAdminSession(S, "cwo@tradingsolutions.com");
  assert.equal(readAdminSession(tok, S)?.email, "cwo@tradingsolutions.com");
  assert.equal(readAdminSession(tok, "y".repeat(32)), null);
  assert.equal(readAdminSession(tok.replace(/.$/, "0"), S) === null || tok.endsWith("0"), true);
  const tx = { state: "s".repeat(43), nonce: "n".repeat(43), verifier: "v".repeat(43), next: "/hr-admin", exp: Date.now() + 1000 };
  assert.equal(readOAuthTransaction(signOAuthTransaction(S, tx), S)?.state, tx.state);
  assert.equal(readOAuthTransaction(signOAuthTransaction(S, { ...tx, exp: Date.now() - 1 }), S), null);
});

test("flag de clave", () => {
  assert.equal(isPasswordLoginEnabled("1"), true);
  assert.equal(isPasswordLoginEnabled("0"), false);
});
