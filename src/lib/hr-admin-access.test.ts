import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { DELETE, GET as loginInfo, POST } from "../app/api/hr-admin/login/route.ts";
import { GET as startGoogle } from "../app/api/hr-admin/login/google/route.ts";
import { GET as googleCallback } from "../app/api/hr-admin/login/google/callback/route.ts";
import { POST as iapPost } from "../app/api/hr-admin/login/iap/route.ts";
import { POST as reseedPost } from "../app/api/headhunting/reseed-scenarios/route.ts";
import { middleware } from "../middleware.ts";
import { scriptsAuthorized } from "./admin-scripts-auth.ts";
import { adminSessionEmail, requireAdmin, sessionActor } from "./admin-auth.ts";
import { isAdminRequest } from "./bateria/auth.ts";
import { cookieIsSecure } from "./hr-admin-cookies.ts";
import {
  assertGoogleIdClaims,
  assertIapClaims,
  googleLoginHref,
  isPasswordLoginEnabled,
  parseAllowlist,
  safeAdminNext,
  type IdentityClaims,
} from "./hr-admin-access.ts";
import { loginCopy } from "./hr-admin-login-copy.ts";
import { pkceChallenge, readOAuthTransaction } from "./hr-admin-oauth.ts";
import {
  HR_ADMIN_SESSION_MAX_AGE_MS,
  readAdminSession,
  signAdminSession,
} from "./hr-admin-session.ts";
import { HR_ADMIN_BREAK_GLASS_EMAIL, iapAvailable, readPortalSecret, readScriptsSecret, readSessionSecret } from "./hr-admin-secrets.ts";

const KEYS = [
  "ADMIN_SECRET",
  "HR_ADMIN_SESSION_SECRET",
  "ADMIN_SCRIPTS_SECRET",
  "HR_ADMIN_PASSWORD_LOGIN_ENABLED",
  "HR_ADMIN_ALLOWED_EMAILS",
  "GOOGLE_ADMIN_OAUTH_CLIENT_ID",
  "GOOGLE_ADMIN_OAUTH_CLIENT_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "IAP_AUDIENCE",
  "CRON_SECRET",
  "WXM_SERVICE_SECRET",
  "VERCEL",
  "VERCEL_ENV",
  "K_SERVICE",
] as const;

const originals = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (originals[key] === undefined) delete process.env[key];
    else process.env[key] = originals[key];
  }
});

const AUDIENCE = "hr-admin.apps.googleusercontent.com";
const NONCE = "nonce-from-the-login-cookie-0123456789";
const NOW = 1_700_000_000_000;
const SECRET = "test-admin-secret-for-session";
const SESSION = "hr-admin-session-signing-secret";
const SCRIPTS = "admin-scripts-secret-value-01";

function claims(over: Partial<IdentityClaims> = {}): IdentityClaims {
  return {
    iss: "https://accounts.google.com",
    aud: AUDIENCE,
    exp: Math.floor(NOW / 1000) + 600,
    email: "kelly@tradingsolutions.com",
    email_verified: true,
    hd: "tradingsolutions.com",
    nonce: NONCE,
    ...over,
  };
}

function policy(allowlist: readonly string[], now = NOW) {
  return { audience: AUDIENCE, allowlist, now, nonce: NONCE };
}

function request(cookie?: string) {
  return {
    url: "http://localhost/api/applications",
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "cookie") return cookie ?? null;
        return null;
      },
    },
    cookies: {
      get(name: string) {
        if (!cookie) return undefined;
        const pair = cookie
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith(`${name}=`));
        if (!pair) return undefined;
        return { value: decodeURIComponent(pair.slice(name.length + 1)) };
      },
    },
    nextUrl: new URL("http://localhost/api/applications"),
  };
}

function cookieValue(res: Response, name: string): string | undefined {
  const lines =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];
  for (const line of lines) {
    const first = line.split(";")[0] ?? "";
    if (first.startsWith(`${name}=`)) return decodeURIComponent(first.slice(name.length + 1));
  }
  return undefined;
}

test("allowlist ignores case and surrounding whitespace", () => {
  const list = parseAllowlist("  Kelly@TradingSolutions.com ,  ana@tradingsolutions.com  ");
  assert.deepEqual(list, ["kelly@tradingsolutions.com", "ana@tradingsolutions.com"]);
  const kelly = assertGoogleIdClaims(claims({ email: "  KELLY@tradingsolutions.com " }), policy(list));
  assert.deepEqual(kelly, { ok: true, email: "kelly@tradingsolutions.com" });
  const ana = assertGoogleIdClaims(claims({ email: "Ana@TradingSolutions.com", hd: "TradingSolutions.com" }), policy(list));
  assert.equal(ana.ok, true);
  const outsider = assertGoogleIdClaims(claims({ email: "other@tradingsolutions.com" }), policy(list));
  assert.deepEqual(outsider, { ok: false, reason: "allowlist" });
});

test("wrong hd is rejected even when the email is allowlisted", () => {
  const list = parseAllowlist("kelly@tradingsolutions.com");
  for (const hd of ["gmail.com", "tradingsolutions.co", "", undefined]) {
    const decision = assertGoogleIdClaims(claims({ hd }), policy(list));
    assert.deepEqual(decision, { ok: false, reason: "domain" }, String(hd));
  }
  const subdomain = assertGoogleIdClaims(
    claims({ email: "kelly@sub.tradingsolutions.com", hd: "tradingsolutions.com" }),
    policy(list),
  );
  assert.equal(subdomain.ok, false);
});

test("unverified email is rejected", () => {
  const list = parseAllowlist("kelly@tradingsolutions.com");
  assert.deepEqual(
    assertGoogleIdClaims(claims({ email_verified: false }), policy(list)),
    { ok: false, reason: "unverified" },
  );
  assert.deepEqual(
    assertGoogleIdClaims(claims({ email_verified: undefined }), policy(list)),
    { ok: false, reason: "unverified" },
  );
});

test("empty or unset allowlist admits nobody", () => {
  assert.deepEqual(parseAllowlist(undefined), []);
  assert.deepEqual(parseAllowlist(null), []);
  assert.deepEqual(parseAllowlist(""), []);
  assert.deepEqual(parseAllowlist("  ,  , "), []);
  for (const list of [parseAllowlist(undefined), parseAllowlist(""), parseAllowlist(" , ")]) {
    assert.deepEqual(assertGoogleIdClaims(claims(), policy(list)), { ok: false, reason: "allowlist" });
    assert.deepEqual(
      assertIapClaims(
        { ...claims(), iss: "https://cloud.google.com/iap", nonce: undefined, email_verified: undefined },
        { audience: AUDIENCE, allowlist: list, now: NOW },
      ),
      { ok: false, reason: "allowlist" },
    );
  }
});

test("password flag is off unless it is 1, true, yes, or on", () => {
  for (const off of [undefined, null, "", "0", "false", "no", "off", "enabled", " yes please"]) {
    assert.equal(isPasswordLoginEnabled(off), false, String(off));
  }
  for (const on of ["1", "true", "TRUE", " yes ", "on", "On"]) {
    assert.equal(isPasswordLoginEnabled(on), true, on);
  }
});

test("expired id token is rejected", () => {
  const list = parseAllowlist("kelly@tradingsolutions.com");
  const exp = Math.floor(NOW / 1000);
  assert.deepEqual(
    assertGoogleIdClaims(claims({ exp: exp - 10 }), policy(list)),
    { ok: false, reason: "expired" },
  );
  assert.deepEqual(
    assertGoogleIdClaims(claims({ exp }), policy(list, exp * 1000)),
    { ok: false, reason: "expired" },
  );
  assert.equal(assertGoogleIdClaims(claims({ exp: exp + 1 }), policy(list, exp * 1000)).ok, true);
});

test("session cookie expires at 8 hours and carries the email", () => {
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  process.env.HR_ADMIN_ALLOWED_EMAILS = "kelly@tradingsolutions.com";
  const email = signAdminSession(SESSION, "Kelly@tradingsolutions.com", NOW);
  assert.deepEqual(readAdminSession(email, SESSION, NOW + HR_ADMIN_SESSION_MAX_AGE_MS), {
    issuedAt: NOW,
    email: "kelly@tradingsolutions.com",
  });
  assert.equal(readAdminSession(email, SESSION, NOW + HR_ADMIN_SESSION_MAX_AGE_MS + 1), null);

  const ts = String(NOW);
  const legacy = `${ts}.${crypto.createHmac("sha256", SESSION).update(ts).digest("hex")}`;
  assert.equal(readAdminSession(legacy, SESSION, NOW), null);

  const current = signAdminSession(SESSION, "Kelly@tradingsolutions.com");
  const req = request(`hr_admin_session=${current}`);
  assert.equal(requireAdmin(req as never), null);
  assert.equal(adminSessionEmail(req), "kelly@tradingsolutions.com");
  const flipped = `${current.slice(0, -1)}${current.endsWith("a") ? "b" : "a"}`;
  assert.equal(readAdminSession(flipped, SESSION), null);
});

test("middleware accepts the email cookie and sends an expired one back to login", async () => {
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  process.env.HR_ADMIN_ALLOWED_EMAILS = "kelly@tradingsolutions.com";
  process.env.CRON_SECRET = "cron-real";
  process.env.WXM_SERVICE_SECRET = "wxm-real";
  const fresh = signAdminSession(SESSION, "kelly@tradingsolutions.com");
  const allowed = await middleware(
    new NextRequest("https://careers.example.invalid/hr-admin", {
      headers: { cookie: `hr_admin_session=${fresh}` },
    }),
  );
  assert.equal(allowed.headers.get("x-middleware-next"), "1");

  const expired = signAdminSession(SESSION, "kelly@tradingsolutions.com", Date.now() - HR_ADMIN_SESSION_MAX_AGE_MS - 1);
  const denied = await middleware(
    new NextRequest("https://careers.example.invalid/hr-admin/prep?tab=uno", {
      headers: { cookie: `hr_admin_session=${expired}` },
    }),
  );
  assert.equal(denied.status, 307);
  const location = new URL(denied.headers.get("location")!);
  assert.equal(location.pathname, "/hr-admin/login");
  assert.equal(location.searchParams.get("next"), "/hr-admin/prep?tab=uno");
});

test("password login is 403 when the flag is off, including the real secret", async () => {
  process.env.ADMIN_SECRET = SECRET;
  delete process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED;
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    const res = await POST(
      new Request("https://careers.tradingsolutions.com/api/hr-admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: SECRET }),
      }),
    );
    assert.equal(res.status, 403);
    assert.equal(cookieValue(res, "hr_admin_session"), undefined);
    const body = await res.json();
    assert.equal(body.error, "El ingreso con clave compartida está desactivado");
    assert.equal(JSON.stringify(warnings).includes(SECRET), false);
  } finally {
    console.warn = original;
  }
});

test("password login is break-glass when the flag is on and logs a warning", async () => {
  process.env.ADMIN_SECRET = SECRET;
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "on";
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    const ok = await POST(
      new Request("https://careers.tradingsolutions.com/api/hr-admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: SECRET }),
      }),
    );
    assert.equal(ok.status, 200);
    const token = cookieValue(ok, "hr_admin_session");
    assert.ok(token);
    assert.equal(readAdminSession(token, SESSION)?.email, HR_ADMIN_BREAK_GLASS_EMAIL);
    assert.equal(readAdminSession(token, SECRET), null);
    assert.match(ok.headers.get("set-cookie") ?? "", /Max-Age=28800/);
    assert.match(ok.headers.get("set-cookie") ?? "", /Secure/);
    assert.match(warnings.join("\n"), /break-glass password login succeeded/);
    assert.equal(warnings.join("\n").includes(SECRET), false);

    const bad = await POST(
      new Request("https://careers.tradingsolutions.com/api/hr-admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "not-the-secret" }),
      }),
    );
    assert.equal(bad.status, 401);
    assert.equal(cookieValue(bad, "hr_admin_session"), undefined);
    assert.match(warnings.join("\n"), /break-glass password login failed/);
  } finally {
    console.warn = original;
  }

  const infoOff = await loginInfo();
  delete process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED;
  const hidden = await loginInfo();
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "1";
  const shown = await loginInfo();
  assert.equal((await infoOff.json()).passwordEnabled, true);
  assert.equal((await hidden.json()).passwordEnabled, false);
  assert.equal((await shown.json()).passwordEnabled, true);
});

test("logout clears the session cookie", async () => {
  const res = await DELETE(new Request("https://careers.tradingsolutions.com/api/hr-admin/login", { method: "DELETE" }));
  const header = res.headers.get("set-cookie") ?? "";
  assert.match(header, /hr_admin_session=/);
  assert.match(header, /Max-Age=0/);
});

test("return paths stay on /hr-admin", () => {
  assert.equal(safeAdminNext("/hr-admin/prep?tab=uno"), "/hr-admin/prep?tab=uno");
  assert.equal(safeAdminNext("https://evil.example/phish"), "/hr-admin");
  assert.equal(safeAdminNext("//evil.example"), "/hr-admin");
  assert.equal(safeAdminNext("/\\evil.example"), "/hr-admin");
  assert.equal(safeAdminNext("/hr-admin.evil.example"), "/hr-admin");
  assert.equal(safeAdminNext("/hr-admin/../secret"), "/hr-admin");
  assert.equal(safeAdminNext("/hr-admin/%2e%2e/secret"), "/hr-admin");
  assert.equal(safeAdminNext("/hr-admin/%2E%2e/secret"), "/hr-admin");
  assert.equal(safeAdminNext("/hr-admin/%252e%252e/secret"), "/hr-admin");
  assert.equal(googleLoginHref("/hr-admin/prep?tab=uno"), "/api/hr-admin/login/google?next=%2Fhr-admin%2Fprep%3Ftab%3Duno");
});

test("google start uses PKCE, state, nonce, and the app url, and drops open redirects", async () => {
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  process.env.GOOGLE_ADMIN_OAUTH_CLIENT_ID = AUDIENCE;
  process.env.GOOGLE_ADMIN_OAUTH_CLIENT_SECRET = "oauth-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://careers.tradingsolutions.com";

  const res = await startGoogle(
    new NextRequest(
      `http://127.0.0.1:8080/api/hr-admin/login/google?next=${encodeURIComponent("https://evil.example/phish")}`,
    ),
  );
  assert.equal(res.status, 307);
  const location = new URL(res.headers.get("location")!);
  assert.equal(location.origin, "https://accounts.google.com");
  assert.equal(location.pathname, "/o/oauth2/v2/auth");
  assert.equal(
    location.searchParams.get("redirect_uri"),
    "https://careers.tradingsolutions.com/api/hr-admin/login/google/callback",
  );
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.equal(location.searchParams.get("response_type"), "code");
  assert.equal(location.searchParams.has("client_secret"), false);
  assert.equal(location.href.includes("oauth-client-secret"), false);

  const tx = readOAuthTransaction(cookieValue(res, "hr_admin_oauth"), SESSION);
  assert.ok(tx);
  assert.equal(tx.next, "/hr-admin");
  assert.equal(tx.state, location.searchParams.get("state"));
  assert.equal(tx.nonce, location.searchParams.get("nonce"));
  assert.equal(pkceChallenge(tx.verifier), location.searchParams.get("code_challenge"));

  const kept = await startGoogle(
    new NextRequest(
      `https://careers.tradingsolutions.com/api/hr-admin/login/google?next=${encodeURIComponent("/hr-admin/prep?tab=uno")}`,
    ),
  );
  const keptTx = readOAuthTransaction(cookieValue(kept, "hr_admin_oauth"), SESSION);
  assert.equal(keptTx?.next, "/hr-admin/prep?tab=uno");
});

test("callback with a bad state returns to the public login and does not follow a foreign next", async () => {
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  process.env.NEXT_PUBLIC_APP_URL = "https://careers.tradingsolutions.com";
  const res = await googleCallback(
    new NextRequest(
      "http://127.0.0.1:8080/api/hr-admin/login/google/callback?code=abc&state=not-the-cookie&next=https://evil.example/phish",
    ),
  );
  const location = new URL(res.headers.get("location")!);
  assert.equal(location.origin, "https://careers.tradingsolutions.com");
  assert.equal(location.pathname, "/hr-admin/login");
  assert.equal(location.searchParams.get("error"), "state");
  assert.equal(location.href.includes("evil.example"), false);
  assert.equal(cookieValue(res, "hr_admin_session"), undefined);
});

test("ADMIN_SECRET does not authorize admin APIs, cookies, or x-admin-secret", () => {
  process.env.ADMIN_SECRET = SECRET;
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  process.env.ADMIN_SCRIPTS_SECRET = SCRIPTS;
  delete process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED;

  const mintedWithPassword = signAdminSession(SECRET, "kelly@tradingsolutions.com");
  assert.equal(requireAdmin(request(`hr_admin_session=${mintedWithPassword}`) as never)?.status, 401);

  const bearer = {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "authorization" ? `Bearer ${SECRET}` : null;
      },
    },
    cookies: { get() { return undefined; } },
  };
  assert.equal(requireAdmin(bearer as never)?.status, 401);
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "1";
  assert.equal(requireAdmin(bearer as never)?.status, 401);

  const xAdmin = {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "x-admin-secret" ? SECRET : null;
      },
    },
    cookies: { get() { return undefined; } },
  };
  assert.equal(isAdminRequest(xAdmin), false);
  assert.equal(scriptsAuthorized(xAdmin), false);

  const scripts = {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "x-admin-secret" ? SCRIPTS : null;
      },
    },
    cookies: { get() { return undefined; } },
  };
  assert.equal(isAdminRequest(scripts), false);
  assert.equal(
    scriptsAuthorized({
      headers: {
        get(name: string) {
          return name.toLowerCase() === "authorization" ? `Bearer ${SCRIPTS}` : null;
        },
      },
    }),
    true,
  );
});

test("a missing or short session secret fails closed in production", () => {
  process.env.ADMIN_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  delete process.env.HR_ADMIN_SESSION_SECRET;
  assert.equal(requireAdmin(request() as never)?.status, 500);
  process.env.HR_ADMIN_SESSION_SECRET = "short";
  assert.equal(requireAdmin(request() as never)?.status, 500);
  delete process.env.VERCEL_ENV;
  process.env.K_SERVICE = "careers";
  delete process.env.HR_ADMIN_SESSION_SECRET;
  assert.equal(requireAdmin(request() as never)?.status, 500);
});

test("break-glass cannot mint a session when the session secret is missing", async () => {
  process.env.ADMIN_SECRET = SECRET;
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "1";
  delete process.env.HR_ADMIN_SESSION_SECRET;
  const res = await POST(
    new Request("https://careers.tradingsolutions.com/api/hr-admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: SECRET }),
    }),
  );
  assert.equal(res.status, 500);
  assert.equal(cookieValue(res, "hr_admin_session"), undefined);
});

test("middleware rejects a session that has no email claim", async () => {
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  const ts = Date.now().toString();
  const sig = crypto.createHmac("sha256", SESSION).update(ts).digest("hex");
  const res = await middleware(
    new NextRequest("https://careers.example.invalid/hr-admin", {
      headers: { cookie: `hr_admin_session=${ts}.${sig}` },
    }),
  );
  assert.equal(res.status, 307);
});

test("IAP runs only on Cloud Run and requires email_verified when the claim is present", async () => {
  process.env.VERCEL = "1";
  process.env.VERCEL_ENV = "production";
  process.env.K_SERVICE = "careers";
  assert.equal(iapAvailable(), false);
  const ignored = await iapPost(
    new NextRequest("https://careers.tradingsolutions.com/api/hr-admin/login/iap", {
      method: "POST",
      headers: { "x-goog-iap-jwt-assertion": "not-a-jwt" },
    }),
  );
  assert.equal(ignored.status, 200);
  assert.deepEqual(await ignored.json(), { ok: false });
  assert.equal(cookieValue(ignored, "hr_admin_session"), undefined);

  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  process.env.K_SERVICE = "careers";
  assert.equal(iapAvailable(), true);
  const invalid = await iapPost(
    new NextRequest("https://careers.tradingsolutions.com/api/hr-admin/login/iap", {
      method: "POST",
      headers: { "x-goog-iap-jwt-assertion": "not-a-jwt" },
    }),
  );
  assert.equal(invalid.status, 401);

  const list = parseAllowlist("kelly@tradingsolutions.com");
  const base = { ...claims(), iss: "https://cloud.google.com/iap" as const, nonce: undefined };
  const opts = { audience: AUDIENCE, allowlist: list, now: NOW };
  assert.equal(assertIapClaims({ ...base, email_verified: undefined }, opts).ok, true);
  assert.deepEqual(assertIapClaims({ ...base, email_verified: false }, opts), { ok: false, reason: "unverified" });
  assert.equal(assertIapClaims({ ...base, email_verified: true }, opts).ok, true);
});

test("the secure cookie flag follows the request protocol or an https origin", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  delete process.env.NEXT_PUBLIC_APP_URL;
  try {
    assert.equal(cookieIsSecure({ url: "http://127.0.0.1:3010/api/hr-admin/login" }), false);
    assert.equal(cookieIsSecure({ url: "https://careers.tradingsolutions.com/api/hr-admin/login" }), true);
    assert.equal(
      cookieIsSecure({
        url: "http://127.0.0.1:8080/api/hr-admin/login",
        headers: { get: (name) => (name.toLowerCase() === "x-forwarded-proto" ? "https" : null) },
      }),
      true,
    );
    process.env.NEXT_PUBLIC_APP_URL = "https://careers.tradingsolutions.com";
    assert.equal(cookieIsSecure({ url: "http://127.0.0.1:8080/api/hr-admin/login" }), true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("login copy defaults to English, and rejection uses only the session email", () => {
  assert.equal(loginCopy("en").google, "Continue with Google");
  assert.equal(loginCopy("en").title, "Welcome.");
  assert.equal(loginCopy("es").google, "Continuar con Google");
  assert.match(loginCopy("en").network, /jointheteam@tradingsolutions.com/);
  assert.match(loginCopy("es").network, /jointheteam@tradingsolutions.com/);
  assert.equal(sessionActor("Kelly@tradingsolutions.com"), "kelly@tradingsolutions.com");
  assert.equal(sessionActor("kelly"), null);

  const form = readFileSync(new URL("../app/hr-admin/login/login-form.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/hr-admin/login/page.tsx", import.meta.url), "utf8");
  const reject = readFileSync(
    new URL("../app/api/admin/candidates/[candidateId]/reject-with-reason/route.ts", import.meta.url),
    "utf8",
  );
  assert.equal(form.includes("error.message"), false);
  assert.match(form, /useState<LoginLang>\(initialLang\)/);
  assert.match(form, /chooseLang\("es"\)/);
  assert.match(form, /localStorage/);
  assert.match(form, /hr-admin-lang/);
  assert.equal(loginCopy("es").title, "Te damos la bienvenida.");
  assert.equal(loginCopy("es").heroLead, "El talento que");
  assert.equal(loginCopy("es").heroRest, "mueve al mundo.");
  assert.equal(loginCopy("es").toolLine, "Talent Acquisition Team");
  assert.equal(loginCopy("es").tagline, "Donde la visión se encuentra con la ejecución.");
  assert.match(form, /<Hero lang=\{lang\} \/>/);
  assert.match(page, /LoginFallback googleHref=\{googleHref\}/);
  assert.match(page, /googleLoginHref\(next\)/);
  assert.equal(reject.includes("body.rejected_by"), false);
  assert.match(reject, /sessionActor\(adminSessionEmail\(req\)\)/);
});

test("removing an allowlisted email ends that session on the next request", () => {
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  process.env.ADMIN_SECRET = SECRET;
  process.env.HR_ADMIN_ALLOWED_EMAILS = "kelly@tradingsolutions.com,ana@tradingsolutions.com";
  const token = signAdminSession(SESSION, "kelly@tradingsolutions.com");
  assert.equal(requireAdmin(request(`hr_admin_session=${token}`) as never), null);
  assert.equal(isAdminRequest({
    cookies: { get: () => ({ value: token }) },
    headers: { get: () => null },
  }), true);
  process.env.HR_ADMIN_ALLOWED_EMAILS = "ana@tradingsolutions.com";
  assert.equal(requireAdmin(request(`hr_admin_session=${token}`) as never)?.status, 401);
  assert.equal(adminSessionEmail(request(`hr_admin_session=${token}`)), null);
  assert.equal(isAdminRequest({
    cookies: { get: () => ({ value: token }) },
    headers: { get: () => null },
  }), false);
});

test("equal auth secrets are refused and the health check logs the failure", async () => {
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  process.env.ADMIN_SECRET = SESSION;
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const { GET } = await import("../app/api/health/route.ts");
    const res = await GET();
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false });
    assert.match(lines.join("\n"), /\[hr-admin\] FATAL: HR_ADMIN_SESSION_SECRET must not equal ADMIN_SECRET/);
    assert.equal(readSessionSecret(), null);
    const shared = "shared-auth-secret-value-32-characters";
    process.env.HR_ADMIN_SESSION_SECRET = shared;
    process.env.ADMIN_SCRIPTS_SECRET = shared;
    process.env.ADMIN_SECRET = SECRET;
    process.env.PORTAL_TOKEN_SECRET = shared;
    assert.equal(readScriptsSecret(), null);
    assert.equal(readPortalSecret(), null);
  } finally {
    console.error = original;
  }
});

test("the break-glass password must be at least 16 characters", async () => {
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  process.env.ADMIN_SECRET = "short-password";
  process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED = "1";
  const res = await POST(
    new Request("https://careers.tradingsolutions.com/api/hr-admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "short-password" }),
    }),
  );
  assert.equal(res.status, 500);
  assert.equal(cookieValue(res, "hr_admin_session"), undefined);
});

test("headhunting reseed does not accept ADMIN_SECRET", async () => {
  process.env.ADMIN_SECRET = SECRET;
  process.env.HR_ADMIN_SESSION_SECRET = SESSION;
  delete process.env.ADMIN_SCRIPTS_SECRET;
  const res = await reseedPost(
    new NextRequest("https://careers.tradingsolutions.com/api/headhunting/reseed-scenarios", {
      method: "POST",
      headers: { "x-admin-secret": SECRET, authorization: `Bearer ${SECRET}` },
    }),
  );
  assert.equal(res.status, 401);
});
