import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { NextRequest } from "next/server";
import { handleGoogleOAuthCallback } from "./google-oauth-flow.ts";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  createOAuthState,
  oauthStateKey,
  sealOAuthState,
} from "./google-oauth-state.ts";

const SECRET = "test-admin-secret-for-401";
process.env.ADMIN_SECRET = SECRET;

function sessionParts(secret = SECRET) {
  const ts = Date.now().toString();
  const sig = crypto.createHmac("sha256", secret).update(ts).digest("hex");
  const token = `${ts}.${sig}`;
  return { token, cookie: `hr_admin_session=${token}` };
}

test("GET /api/google/auth and callback without a session return 401", async () => {
  const auth = await import("../app/api/google/auth/route.ts");
  const callback = await import("../app/api/google/callback/route.ts");
  const authRes = await auth.GET(new NextRequest("https://careers.example/api/google/auth"));
  assert.equal(authRes.status, 401);
  assert.deepEqual(await authRes.json(), { error: "Unauthorized" });

  const callbackRes = await callback.GET(
    new NextRequest("https://careers.example/api/google/callback?code=abc&state=xyz"),
  );
  assert.equal(callbackRes.status, 401);
  assert.deepEqual(await callbackRes.json(), { error: "Unauthorized" });
});

test("an admin session starts OAuth with a short httpOnly state cookie", async () => {
  process.env.GOOGLE_CLIENT_ID = "client-id";
  const { token, cookie } = sessionParts();
  const { GET } = await import("../app/api/google/auth/route.ts");
  const res = await GET(
    new NextRequest("https://careers.example/api/google/auth", { headers: { cookie } }),
  );
  assert.equal(res.status, 307);
  const location = res.headers.get("location") || "";
  assert.match(location, /accounts\.google\.com/);
  const state = new URL(location).searchParams.get("state");
  assert.ok(state);
  const setCookie = res.headers.get("set-cookie") || "";
  assert.match(setCookie, new RegExp(`${GOOGLE_OAUTH_STATE_COOKIE}=`));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Max-Age=600/i);
  assert.match(setCookie, new RegExp(state!));
  void token;
});

test("a bad state is rejected and the mailbox allowlist miss does not save tokens", async () => {
  const { token, cookie } = sessionParts();
  let saved = 0;
  let exchanged = 0;

  const mismatch = new NextRequest(
    "https://careers.example/api/google/callback?code=abc&state=attacker",
    { headers: { cookie: `${cookie}; ${GOOGLE_OAUTH_STATE_COOKIE}=not-the-state` } },
  );
  const rejected = await handleGoogleOAuthCallback(mismatch, {
    saveTokens: async () => {
      saved += 1;
    },
    exchangeCode: async () => {
      exchanged += 1;
      return { access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600 };
    },
    fetchUserInfo: async () => ({ email: "attacker@gmail.com", verified_email: true }),
  });
  assert.equal(rejected.status, 307);
  const rejectedLocation = rejected.headers.get("location") || "";
  assert.match(rejectedLocation, /gmail_error=denied/);
  assert.equal(rejectedLocation.includes("attacker@gmail.com"), false);
  assert.equal(rejectedLocation.includes("access-secret"), false);
  assert.equal(saved, 0);
  assert.equal(exchanged, 0);

  const state = createOAuthState();
  const sealed = sealOAuthState(state, oauthStateKey(token, SECRET));
  const previous = process.env.GOOGLE_MAILBOX_ALLOWED_EMAILS;
  process.env.GOOGLE_MAILBOX_ALLOWED_EMAILS = "jointheteam@tradingsolutions.com";
  try {
    const notAllowed = new NextRequest(
      `https://careers.example/api/google/callback?code=abc&state=${encodeURIComponent(state)}`,
      { headers: { cookie: `${cookie}; ${GOOGLE_OAUTH_STATE_COOKIE}=${sealed}` } },
    );
    const denied = await handleGoogleOAuthCallback(notAllowed, {
      saveTokens: async () => {
        saved += 1;
      },
      exchangeCode: async () => {
        exchanged += 1;
        return { access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600 };
      },
      fetchUserInfo: async () => ({ email: "attacker@gmail.com", verified_email: true }),
    });
    assert.match(denied.headers.get("location") || "", /gmail_error=denied/);
    assert.equal(saved, 0);
    assert.equal(exchanged, 1);

    delete process.env.GOOGLE_MAILBOX_ALLOWED_EMAILS;
    const unset = await handleGoogleOAuthCallback(notAllowed, {
      saveTokens: async () => {
        saved += 1;
      },
      exchangeCode: async () => ({
        access_token: "access-secret",
        refresh_token: "refresh-secret",
        expires_in: 3600,
      }),
      fetchUserInfo: async () => ({ email: "jointheteam@tradingsolutions.com", verified_email: true }),
    });
    assert.match(unset.headers.get("location") || "", /gmail_error=denied/);
    assert.equal(saved, 0);

    process.env.GOOGLE_MAILBOX_ALLOWED_EMAILS = "jointheteam@tradingsolutions.com";
    const allowed = await handleGoogleOAuthCallback(notAllowed, {
      saveTokens: async (tokens) => {
        saved += 1;
        assert.equal(tokens.email, "JoinTheTeam@TradingSolutions.com");
      },
      exchangeCode: async () => ({
        access_token: "access-secret",
        refresh_token: "refresh-secret",
        expires_in: 3600,
      }),
      fetchUserInfo: async () => ({ email: "JoinTheTeam@TradingSolutions.com", verified_email: true }),
    });
    assert.match(allowed.headers.get("location") || "", /gmail_connected=1/);
    assert.equal(saved, 1);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_MAILBOX_ALLOWED_EMAILS;
    else process.env.GOOGLE_MAILBOX_ALLOWED_EMAILS = previous;
  }
});
