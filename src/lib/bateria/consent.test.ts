import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONSENT_VERSION_NEUTRAL,
  CONSENT_VERSION_PIPL,
  KNOWN_CONSENT_VERSIONS,
  consentVersionForVariant,
  consentVersionToRecord,
} from "./consent";
import { requiresPiplConsent, resolveCandidateLang } from "../candidate-lang";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const page = readFileSync(join(root, "src/app/prueba/[token]/page.tsx"), "utf8");

test("versions", () => {
  assert.equal(CONSENT_VERSION_NEUTRAL, "consent-neutral-2026-11-04");
  assert.equal(CONSENT_VERSION_PIPL, "pipl-2026-09-18");
  assert.equal(consentVersionForVariant("neutral"), CONSENT_VERSION_NEUTRAL);
  assert.equal(consentVersionForVariant("pipl"), CONSENT_VERSION_PIPL);
});

test("PIPL only for China vacancies; Panama Ops and Colombia get the neutral text", () => {
  assert.equal(requiresPiplConsent({ formTemplateKey: "china" }), true);
  assert.equal(requiresPiplConsent({ formTemplateKey: "CHINA" }), true);
  assert.equal(requiresPiplConsent({ country: "Shenzhen, China" }), true);
  assert.equal(requiresPiplConsent({ formTemplateKey: "panama_ops", country: "Panamá" }), false);
  assert.equal(requiresPiplConsent({ formTemplateKey: "general", country: "Colombia" }), false);
  assert.equal(requiresPiplConsent({}), false);
});

test("language still follows candidate-lang: EN for china and panama_ops, ES otherwise", () => {
  assert.equal(resolveCandidateLang({ formTemplateKey: "china" }), "en");
  assert.equal(resolveCandidateLang({ formTemplateKey: "panama_ops" }), "en");
  assert.equal(resolveCandidateLang({ formTemplateKey: "general", country: "Colombia" }), "es");
});

test("records the version the screen showed when it is a known one", () => {
  assert.equal(consentVersionToRecord(CONSENT_VERSION_NEUTRAL, "en"), CONSENT_VERSION_NEUTRAL);
  assert.equal(consentVersionToRecord(CONSENT_VERSION_NEUTRAL, "es"), CONSENT_VERSION_NEUTRAL);
  assert.equal(consentVersionToRecord(CONSENT_VERSION_PIPL, "en"), CONSENT_VERSION_PIPL);
});

test("pages opened before the deploy record what they showed (legacy mapping)", () => {
  assert.equal(consentVersionToRecord(undefined, "en"), "pipl-2026-09-18");
  assert.equal(consentVersionToRecord(undefined, "es"), "hd-2026-09-08");
  assert.equal(consentVersionToRecord("made-up-version", "es"), "hd-2026-09-08");
  assert.ok(KNOWN_CONSENT_VERSIONS.has("hd-2026-09-08"));
});

test("the screen shows the same version strings the server records", () => {
  assert.ok(page.includes(`version: "${CONSENT_VERSION_NEUTRAL}"`));
  assert.ok(page.includes(`version: "${CONSENT_VERSION_PIPL}"`));
  assert.ok(page.includes("consent_version: ct.version"));
});

test("neutral text names the controller, purpose, rights mailbox and voluntariness, and no country or law", () => {
  const start = page.indexOf("const CONSENT_NEUTRAL");
  const end = page.indexOf("};", start);
  assert.ok(start > 0 && end > start);
  const neutral = page.slice(start, end);
  assert.doesNotMatch(neutral, /china|pipl|1581|habeas|S\.A\.S\./i);
  assert.equal((neutral.match(/jointheteam@tradingsolutions\.com/g) || []).length, 2);
  assert.match(neutral, /Trading Solutions es el responsable/);
  assert.match(neutral, /Trading Solutions is the controller/);
  assert.match(neutral, /acceso, la rectificación o la supresión/);
  assert.match(neutral, /access to, rectification of, or deletion of/);
  assert.match(neutral, /voluntaria/);
  assert.match(neutral, /voluntary/);
  assert.match(neutral, /proceso de selección/);
  assert.match(neutral, /selection process/);
});
