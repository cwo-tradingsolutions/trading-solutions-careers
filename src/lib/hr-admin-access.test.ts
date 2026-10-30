import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { DELETE, GET as loginInfo, POST } from "../app/api/hr-admin/login/route.ts";
import { GET as startGoogle } from "../app/api/hr-admin/login/google/route.ts";
import { GET as googleCallback } from "../app/api/hr-admin/login/google/callback/route.ts";
import { middleware } from "../middleware.ts";
import { adminSessionEmail, requireAdmin } from "./admin-auth.ts";
import {
  assertGoogleIdClaims,
  assertIapClaims,
  isPasswordLoginEnabled,
  parseAllowlist,
  safeAdminNext,
  type IdentityClaims,
} from "./hr-admin-access.ts";
import { pkceChallenge, readOAuthTransaction } from "./hr-admin-oauth.ts";
import {
  HR_ADMIN_SESSION_MAX_AGE_MS,
  readAdminSession,
  signAdminSession,
} from "./hr-admin-session.ts";

const KEYS = [
  "ADMIN_SECRET",
  "HR_ADMIN_PASSWORD_LOGIN_ENABLED",
  "HR_ADMIN_ALLOWED_EMAILS",
  "GOOGLE_ADMIN_OAUTH_CLIENT_ID",
  "GOOGLE_ADMIN_OAUTH_CLIENT_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "IAP_AUDIENCE",
  "CRON_SECRET",
  "WXM_SERVICE_SECRET",
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
  process.env.ADMIN_SECRET = SECRET;
  const email = signAdminSession(SECRET, "Kelly@tradingsolutions.com", NOW);
  assert.deepEqual(readAdminSession(email, SECRET, NOW + HR_ADMIN_SESSION_MAX_AGE_MS), {
    issuedAt: NOW,
    email: "kelly@tradingsolutions.com",
  });
  assert.equal(readAdminSession(email, SECRET, NOW + HR_ADMIN_SESSION_MAX_AGE_MS + 1), null);

  const legacy = signAdminSession(SECRET, null, NOW);
  assert.deepEqual(readAdminSession(legacy, SECRET, NOW), { issuedAt: NOW, email: null });
  assert.equal(readAdminSession(legacy, SECRET, NOW + HR_ADMIN_SESSION_MAX_AGE_MS + 1), null);

  const current = signAdminSession(SECRET, "Kelly@tradingsolutions.com");
  const req = request(`hr_admin_session=${current}`);
  assert.equal(requireAdmin(req as never), null);
  assert.equal(adminSessionEmail(req), "kelly@tradingsolutions.com");
  const flipped = `${current.slice(0, -1)}${current.endsWith("a") ? "b" : "a"}`;
  assert.equal(readAdminSession(flipped, SECRET), null);
});

test("middleware accepts the email cookie and sends an expired one back to login", async () => {
  process.env.ADMIN_SECRET = SECRET;
  process.env.CRON_SECRET = "cron-real";
  process.env.WXM_SERVICE_SECRET = "wxm-real";
  const fresh = signAdminSession(SECRET, "kelly@tradingsolutions.com");
  const allowed = await middleware(
    new NextRequest("https://careers.example.invalid/hr-admin", {
      headers: { cookie: `hr_admin_session=${fresh}` },
    }),
  );
  assert.equal(allowed.headers.get("x-middleware-next"), "1");

  const expired = signAdminSession(SECRET, "kelly@tradingsolutions.com", Date.now() - HR_ADMIN_SESSION_MAX_AGE_MS - 1);
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
    assert.equal(readAdminSession(token, SECRET)?.email, null);
    assert.match(ok.headers.get("set-cookie") ?? "", /Max-Age=28800/);
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
  const res = await DELETE();
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
});

test("google start uses PKCE, state, nonce, and the app url, and drops open redirects", async () => {
  process.env.ADMIN_SECRET = SECRET;
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

  const tx = readOAuthTransaction(cookieValue(res, "hr_admin_oauth"), SECRET);
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
  const keptTx = readOAuthTransaction(cookieValue(kept, "hr_admin_oauth"), SECRET);
  assert.equal(keptTx?.next, "/hr-admin/prep?tab=uno");
});

test("callback with a bad state returns to the public login and does not follow a foreign next", async () => {
  process.env.ADMIN_SECRET = SECRET;
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
