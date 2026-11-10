import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  PREVIEW_OAUTH_REDIRECT_URIS,
  googleOAuthBaseUrl,
  googleOAuthEnvironment,
  googleOAuthRedirectUri,
  usesProductionGoogleToken,
} from "./google-oauth-env";
import { deleteStoredTokens, readStoredTokens, writeStoredTokens, type Sql } from "./google-oauth-store";

const BRANCH_HOST = "trading-solutions-careers-git-f-a9e564-kellys-projects-ba26f62b.vercel.app";
const PROD_APP = "https://careers.tradingsolutions.com";
const DEPLOYMENT_HOST = "trading-solutions-careers-erc6iyley-kellys-projects-ba26f62b.vercel.app";

const prodRow = {
  id: 1,
  email: "prod@tradingsolutions.com",
  access_token: "prod-access",
  refresh_token: "prod-refresh",
  expires_at: "2099-01-01T00:00:00.000Z",
  scope: "https://www.googleapis.com/auth/calendar",
};

const previewRow = {
  environment: "preview",
  email: "preview@tradingsolutions.com",
  access_token: "preview-access",
  refresh_token: "preview-refresh",
  expires_at: "2099-01-01T00:00:00.000Z",
  scope: "https://www.googleapis.com/auth/gmail.compose",
};

type Call = { text: string; values: unknown[] };

function fakeSql(opts: {
  prodRow?: Record<string, unknown> | null;
  envRows?: Record<string, Record<string, unknown>>;
  missingEnvTable?: boolean;
}): { sql: Sql; calls: Call[] } {
  const calls: Call[] = [];
  const sql: Sql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("google_oauth_tokens_env")) {
      if (opts.missingEnvTable) {
        const error = new Error('relation "google_oauth_tokens_env" does not exist') as Error & { code: string };
        error.code = "42P01";
        throw error;
      }
      if (text.includes("SELECT")) {
        const row = opts.envRows?.[String(values[0])];
        return row ? [row] : [];
      }
      return [];
    }
    if (text.includes("id = 1") && text.includes("SELECT")) {
      return opts.prodRow ? [opts.prodRow] : [];
    }
    return [];
  };
  return { sql, calls };
}

function touchedProduction(calls: Call[]): boolean {
  return calls.some((call) => call.text.includes("id = 1") || /INSERT INTO google_oauth_tokens\b/.test(call.text));
}

test("only preview and development leave the production token", () => {
  assert.equal(googleOAuthEnvironment("production"), "production");
  assert.equal(googleOAuthEnvironment(undefined), "production");
  assert.equal(googleOAuthEnvironment("preview"), "preview");
  assert.equal(googleOAuthEnvironment("development"), "development");
  assert.equal(usesProductionGoogleToken("production"), true);
  assert.equal(usesProductionGoogleToken(undefined), true);
  assert.equal(usesProductionGoogleToken("preview"), false);
});

test("production redirect_uri stays on NEXT_PUBLIC_APP_URL and ignores the preview host", () => {
  const base = googleOAuthBaseUrl({
    vercelEnv: "production",
    appUrl: PROD_APP,
    forwardedHost: BRANCH_HOST,
    host: DEPLOYMENT_HOST,
    vercelUrl: DEPLOYMENT_HOST,
  });
  assert.equal(base, PROD_APP);
  assert.equal(googleOAuthRedirectUri(base), `${PROD_APP}/api/google/callback`);
  assert.equal(
    googleOAuthRedirectUri(googleOAuthBaseUrl({ vercelEnv: undefined, appUrl: undefined })),
    "https://trading-solutions-careers.vercel.app/api/google/callback",
  );
});

test("preview redirect_uri uses the request host, never NEXT_PUBLIC_APP_URL", () => {
  const uri = googleOAuthRedirectUri(
    googleOAuthBaseUrl({
      vercelEnv: "preview",
      appUrl: PROD_APP,
      forwardedHost: BRANCH_HOST,
      host: DEPLOYMENT_HOST,
      forwardedProto: "https",
      vercelUrl: DEPLOYMENT_HOST,
    }),
  );
  assert.equal(uri, PREVIEW_OAUTH_REDIRECT_URIS[0]);
  assert.equal(uri, `https://${BRANCH_HOST}/api/google/callback`);
  assert.equal(uri.includes("careers.tradingsolutions.com"), false);
  assert.equal(uri.includes(DEPLOYMENT_HOST), false);
});

test("preview falls back to VERCEL_URL and refuses the production app url", () => {
  const fromVercel = googleOAuthRedirectUri(
    googleOAuthBaseUrl({
      vercelEnv: "preview",
      appUrl: PROD_APP,
      vercelUrl: `https://${DEPLOYMENT_HOST}/ignored`,
    }),
  );
  assert.equal(fromVercel, `https://${DEPLOYMENT_HOST}/api/google/callback`);

  assert.equal(
    googleOAuthBaseUrl({ vercelEnv: "preview", appUrl: PROD_APP }),
    "",
  );
});

test("development uses the local host instead of the production app url", () => {
  assert.equal(
    googleOAuthBaseUrl({
      vercelEnv: "development",
      appUrl: PROD_APP,
      host: "localhost:3010",
    }),
    "http://localhost:3010",
  );
});

test("preview read never returns the production row, even if that row exists", async () => {
  const db = fakeSql({ prodRow, envRows: {} });
  const tokens = await readStoredTokens(db.sql, "preview");
  assert.equal(tokens, null);
  assert.equal(touchedProduction(db.calls), false);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].text, /google_oauth_tokens_env/);
  assert.deepEqual(db.calls[0].values, ["preview"]);
});

test("preview read returns only the preview row", async () => {
  const db = fakeSql({ prodRow, envRows: { preview: previewRow } });
  const tokens = await readStoredTokens(db.sql, "preview");
  assert.equal(tokens?.email, "preview@tradingsolutions.com");
  assert.equal(tokens?.refresh_token, "preview-refresh");
  assert.equal(touchedProduction(db.calls), false);
});

test("a missing preview table is disconnected and does not fall back to production", async () => {
  const db = fakeSql({ prodRow, missingEnvTable: true });
  const tokens = await readStoredTokens(db.sql, "preview");
  assert.equal(tokens, null);
  assert.equal(touchedProduction(db.calls), false);
  assert.equal(db.calls.length, 1);
});

test("preview write and delete stay on google_oauth_tokens_env", async () => {
  const db = fakeSql({ prodRow });
  await writeStoredTokens(db.sql, "preview", {
    email: "preview@tradingsolutions.com",
    access_token: "a",
    refresh_token: "r",
    expires_in: 3600,
    scope: "scope",
  });
  await deleteStoredTokens(db.sql, "preview");
  assert.equal(touchedProduction(db.calls), false);
  assert.equal(db.calls[0].values[0], "preview");
  assert.match(db.calls[0].text, /INSERT INTO google_oauth_tokens_env/);
  assert.match(db.calls[1].text, /DELETE FROM google_oauth_tokens_env/);
  assert.equal(db.calls[1].values[0], "preview");
});

test("preview write does not create the production row when the env table is missing", async () => {
  const db = fakeSql({ prodRow, missingEnvTable: true });
  await assert.rejects(
    () =>
      writeStoredTokens(db.sql, "preview", {
        email: "preview@tradingsolutions.com",
        access_token: "a",
        refresh_token: "r",
        expires_in: 60,
      }),
    /No se escribió el token de producción/,
  );
  assert.equal(touchedProduction(db.calls), false);
});

test("production read and write still use the singleton row and ignore preview rows", async () => {
  const db = fakeSql({ prodRow, envRows: { preview: previewRow } });
  const tokens = await readStoredTokens(db.sql, "production");
  assert.equal(tokens?.email, "prod@tradingsolutions.com");
  assert.equal(tokens?.refresh_token, "prod-refresh");
  assert.equal(db.calls.some((call) => call.text.includes("google_oauth_tokens_env")), false);
  assert.match(db.calls.map((call) => call.text).join("\n"), /WHERE id = 1/);

  await writeStoredTokens(db.sql, "production", {
    email: "prod@tradingsolutions.com",
    access_token: "a",
    refresh_token: "r",
    expires_in: 3600,
    scope: "scope",
  });
  const insert = db.calls.find((call) => call.text.includes("INSERT INTO google_oauth_tokens"));
  assert.ok(insert);
  assert.match(insert.text, /ON CONFLICT \(id\)/);
  assert.equal(insert.text.includes("environment"), false);
  assert.equal(insert.values[0], "prod@tradingsolutions.com");

  await deleteStoredTokens(db.sql, "production");
  assert.match(db.calls.at(-1)?.text || "", /DELETE FROM google_oauth_tokens WHERE id = 1/);
});

test("the Neon migration is additive: create only, no UPDATE and no DROP", () => {
  const file = readFileSync(new URL("../../sql/20261029_google_oauth_tokens_env.sql", import.meta.url), "utf8");
  const executable = file.replace(/--[^\n]*/g, "");
  assert.match(file, /Neon/);
  assert.match(executable, /CREATE TABLE IF NOT EXISTS google_oauth_tokens_env/);
  assert.match(executable, /environment IN \('preview', 'development'\)/);
  assert.equal(/\bUPDATE\b/i.test(executable), false);
  assert.equal(/\bDROP\b/i.test(executable), false);
  assert.equal(/\bALTER\b/i.test(executable), false);
});
