import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, test } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";
import { requireAdmin } from "./admin-auth";
import { isAdminRequest } from "./bateria/auth";
import { signAdminSession } from "./hr-admin-session";
import { passwordLoginAllowed } from "./hr-admin-session-format";
import { middleware } from "../middleware";
import { POST as loginPost } from "../app/api/hr-admin/login/route";
import HRLoginPage from "../app/hr-admin/login/page";

const ADMIN = "test-admin-secret-flag-0123456789";
const SESSION = "s".repeat(40);
process.env.ADMIN_SECRET = ADMIN;
process.env.HR_ADMIN_SESSION_SECRET = SESSION;

afterEach(() => { delete process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED; });

function legacyCookie(): string {
  const ts = String(Date.now());
  return `${ts}.${crypto.createHmac("sha256", ADMIN).update(ts).digest("hex")}`;
}
const googleCookie = () => signAdminSession(SESSION, "cwo@tradingsolutions.com");
const req = (path: string, cookie?: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://careers.tradingsolutions.com${path}`, {
    headers: { ...headers, ...(cookie ? { cookie: `hr_admin_session=${cookie}` } : {}) },
  });

test("flag: ausente=on, 1=on, 0/''=off", () => {
  assert.equal(passwordLoginAllowed(undefined), true);
  assert.equal(passwordLoginAllowed("1"), true);
  assert.equal(passwordLoginAllowed("0"), false);
  assert.equal(passwordLoginAllowed(""), false);
});

test("requireAdmin: cookie de clave solo con flag encendido; Google y Bearer siempre", () => {
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "1";
  assert.equal(requireAdmin(req("/api/x", legacyCookie())), null);
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "0";
  assert.equal(requireAdmin(req("/api/x", legacyCookie()))?.status, 401);
  assert.equal(requireAdmin(req("/api/x", googleCookie())), null);
  assert.equal(requireAdmin(req("/api/x", undefined, { authorization: `Bearer ${ADMIN}` })), null);
  assert.equal(requireAdmin(req("/api/x", "1.abc"))?.status, 401);
});

test("bateria: Google aceptada; clave solo con flag; x-admin-secret intacto", () => {
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "0";
  assert.equal(isAdminRequest(req("/api/bateria/list", googleCookie())), true);
  assert.equal(isAdminRequest(req("/api/bateria/list", legacyCookie())), false);
  assert.equal(isAdminRequest(req("/api/bateria/list", undefined, { "x-admin-secret": ADMIN })), true);
  assert.equal(isAdminRequest(req("/api/bateria/list", signAdminSession("z".repeat(40), "cwo@tradingsolutions.com"))), false);
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "1";
  assert.equal(isAdminRequest(req("/api/bateria/list", legacyCookie())), true);
});

test("middleware /hr-admin: cookie de clave rechazada con flag 0, Google pasa", async () => {
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "0";
  const legacy = await middleware(req("/hr-admin", legacyCookie()));
  assert.equal(legacy.status, 307);
  assert.match(legacy.headers.get("location") ?? "", /\/hr-admin\/login/);
  const google = await middleware(req("/hr-admin", googleCookie()));
  assert.equal(google.headers.get("location"), null);
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "1";
  const legacyOn = await middleware(req("/hr-admin", legacyCookie()));
  assert.equal(legacyOn.headers.get("location"), null);
});

test("POST login con flag 0 → 403 incluso con la clave correcta", async () => {
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "0";
  const r = await loginPost(new Request("https://x/api/hr-admin/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: ADMIN }),
  }));
  assert.equal(r.status, 403);
});

test("página login: sin input de clave con flag 0; con flag 1 sí", () => {
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "0";
  const off = renderToString(React.createElement(HRLoginPage));
  assert.match(off, /Continuar con Google/);
  assert.doesNotMatch(off, /type="password"/);
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "1";
  assert.match(renderToString(React.createElement(HRLoginPage)), /type="password"/);
});
