import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { googleOAuthEnvironment } from "./google-oauth-env.ts";
import {
  blockedSendLogLine,
  decideOutboundRecipients,
  isProductionRuntime,
  mailEnvironment,
} from "./mail-recipient-guard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STAGING_LIST = "cwo@tradingsolutions.com,jointheteam@tradingsolutions.com";

test("an allowlist accepts exact addresses and @domain entries, and rejects the rest", () => {
  const allow = { MAIL_RECIPIENT_ALLOWLIST: `${STAGING_LIST}, @example.com` };
  assert.equal(decideOutboundRecipients({ to: "cwo@tradingsolutions.com" }, allow).send, true);
  assert.equal(decideOutboundRecipients({ to: "JoinTheTeam@TradingSolutions.com" }, allow).send, true);
  assert.equal(decideOutboundRecipients({ to: "Ana <ana@example.com>" }, allow).send, true);

  const blocked = decideOutboundRecipients(
    { to: "cwo@tradingsolutions.com", cc: "ana@gmail.com", bcc: "other@example.com" },
    allow,
  );
  assert.equal(blocked.send, false);
  if (!blocked.send) {
    assert.equal(blocked.status, "bloqueado_staging");
    assert.equal(blocked.reason, "not_on_allowlist");
    assert.deepEqual(blocked.domains, ["gmail.com"]);
    const line = blockedSendLogLine(blocked);
    assert.match(line, /domains=gmail\.com/);
    assert.equal(line.includes("ana"), false);
    assert.equal(line.includes("@"), false);
  }
});

test("staging without an allowlist blocks every recipient", () => {
  const cases = [
    { K_SERVICE: "stg-careers-gcp" },
    { STAGING_READ_ONLY: "1" },
    { NEXT_PUBLIC_APP_URL: "http://localhost:3010" },
    { NEXT_PUBLIC_APP_URL: "https://stg.careers.tradingsolutions.com" },
    { VERCEL_ENV: "preview", NEXT_PUBLIC_APP_URL: "https://trading-solutions-careers-git-x.vercel.app" },
  ];
  for (const env of cases) {
    const decision = decideOutboundRecipients({ to: "cwo@tradingsolutions.com", bcc: "person@gmail.com" }, env);
    assert.equal(decision.send, false, JSON.stringify(env));
    if (!decision.send) {
      assert.equal(decision.reason, "staging_allowlist_unset");
      assert.equal(decision.status, "bloqueado_staging");
      assert.equal(blockedSendLogLine(decision).includes("person"), false);
    }
  }
  assert.equal(mailEnvironment({ K_SERVICE: "stg-careers" }), "nonprod");
  // Cloud Run has no VERCEL_ENV. The OAuth helper treats that as production;
  // the send guard must not.
  assert.equal(googleOAuthEnvironment(undefined), "production");
  assert.equal(mailEnvironment({ K_SERVICE: "stg-careers-gcp" }), "nonprod");
  assert.equal(mailEnvironment({ STAGING_READ_ONLY: "1" }), "nonprod");
  assert.equal(mailEnvironment({}), "nonprod");
  assert.equal(mailEnvironment({ STAGING_READ_ONLY: "true", K_SERVICE: "prd-careers" }), "nonprod");
  assert.equal(mailEnvironment({ K_SERVICE: "prd-careers" }), "prod");
  assert.equal(isProductionRuntime({ K_SERVICE: "prd-careers", VERCEL_ENV: undefined }), true);
  assert.equal("VERCEL_ENV" in { K_SERVICE: "prd-careers" }, false);
  assert.equal(isProductionRuntime({ K_SERVICE: "prd-careers" }), true);
  assert.equal(isProductionRuntime({ K_SERVICE: "prd-careers-stg" }), false);
  assert.equal(isProductionRuntime({ VERCEL_ENV: "development" }), false);
  assert.equal(isProductionRuntime({ VERCEL_ENV: "preview" }), false);
  assert.equal(isProductionRuntime({ K_SERVICE: "stg-careers", VERCEL_ENV: "production" }), false);
  assert.equal(isProductionRuntime({ K_SERVICE: "custom-careers", VERCEL_ENV: "production" }), false);
  assert.equal(decideOutboundRecipients({ to: "cwo@tradingsolutions.com" }, {}).send, false);
  const guardSrc = readFileSync(join(root, "src/lib/mail-recipient-guard.ts"), "utf8");
  assert.equal(guardSrc.includes("google-oauth-env"), false);
});

test("malformed recipients never pass, even when the allowlist would match a buried address", () => {
  const env = { VERCEL_ENV: "production" as const, MAIL_RECIPIENT_ALLOWLIST: STAGING_LIST };
  const bypasses = [
    "x@gmail.com (<cwo@tradingsolutions.com>)",
    "x@gmail.com <cwo@tradingsolutions.com>",
    "cwo@tradingsolutions.com\r\nBcc: x@gmail.com",
    "x@gmail.com@tradingsolutions.com",
  ];
  for (const sample of bypasses) {
    const decision = decideOutboundRecipients({ to: sample }, env);
    assert.equal(decision.send, false, sample);
    if (!decision.send) {
      assert.equal(decision.reason, "bad_address");
      assert.equal(decision.status, "invalid_recipient");
    }
  }
  assert.equal(decideOutboundRecipients({ to: "Talent <cwo@tradingsolutions.com>" }, env).send, true);
});

test("production without an allowlist sends, and with one it still filters", () => {
  const candidate = { to: "candidate@gmail.com", bcc: "audit@tradingsolutions.com" };
  assert.equal(decideOutboundRecipients(candidate, { VERCEL_ENV: "production" }).send, true);
  assert.equal(decideOutboundRecipients(candidate, { K_SERVICE: "prd-careers" }).send, true);
  assert.equal(
    decideOutboundRecipients(candidate, { VERCEL_ENV: "production", K_SERVICE: "prd-careers" }).send,
    true,
  );
  const filtered = decideOutboundRecipients(candidate, {
    K_SERVICE: "prd-careers",
    MAIL_RECIPIENT_ALLOWLIST: STAGING_LIST,
  });
  assert.equal(filtered.send, false);
  if (!filtered.send) assert.deepEqual(filtered.domains, ["gmail.com", "tradingsolutions.com"]);

  const allowed = decideOutboundRecipients(
    { to: "jointheteam@tradingsolutions.com" },
    { K_SERVICE: "stg-careers-gcp", MAIL_RECIPIENT_ALLOWLIST: STAGING_LIST },
  );
  assert.equal(allowed.send, true);
});

test("sendViaGmail checks the guard before the Gmail API, and the digest compares the cron secret in constant time", () => {
  const gmail = readFileSync(join(root, "src/lib/gmail.ts"), "utf8");
  const sendAt = gmail.indexOf("export async function sendViaGmail");
  const guardAt = gmail.indexOf("decideOutboundRecipients(", sendAt);
  const fetchAt = gmail.indexOf("fetch(GMAIL_SEND_URL", sendAt);
  assert.ok(sendAt > 0 && guardAt > sendAt && fetchAt > guardAt);
  const digest = readFileSync(join(root, "src/app/api/cron/digest-email/route.ts"), "utf8");
  assert.match(digest, /cronRequestAuthorized\(/);
  assert.doesNotMatch(digest, /auth === `Bearer/);
  const staging = readFileSync(join(root, "infra/gcp/stg-careers-gcp.service.yaml"), "utf8");
  assert.match(staging, /MAIL_RECIPIENT_ALLOWLIST/);
  assert.match(staging, /cwo@tradingsolutions\.com,jointheteam@tradingsolutions\.com/);
});
