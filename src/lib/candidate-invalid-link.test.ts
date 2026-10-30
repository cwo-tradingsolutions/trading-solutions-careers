import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { INVALID_LINK_EN, INVALID_LINK_ES, LOAD_FAIL_ES, LOAD_RETRY_EN, LOAD_RETRY_ES, invalidLinkBoth } from "./candidate-invalid-link.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("invalid-link copy names the mailbox and stays friendly", () => {
  for (const text of [INVALID_LINK_ES, INVALID_LINK_EN]) {
    assert.match(text, /jointheteam@tradingsolutions\.com/);
    assert.doesNotMatch(text, /intenta de nuevo/i);
    assert.doesNotMatch(text, /try again/i);
    assert.doesNotMatch(text, /Algo salió mal/);
    assert.doesNotMatch(text, /Token inválido/);
  }
  assert.match(INVALID_LINK_EN, /we'll help/);
  assert.match(invalidLinkBoth(), / \/ /);
  assert.match(LOAD_FAIL_ES, /No pudimos cargar/);
  assert.doesNotMatch(LOAD_FAIL_ES, /no está disponible/);
  assert.doesNotMatch(LOAD_RETRY_ES, /intenta de nuevo/i);
  assert.doesNotMatch(LOAD_RETRY_EN, /try again/i);
  assert.match(LOAD_RETRY_ES, /jointheteam@tradingsolutions\.com/);
});

test("candidate link pages use the friendly invalid-link copy", () => {
  const pages = [
    "src/app/assessment/ht/[token]/page.tsx",
    "src/app/prefiltro/[token]/page.tsx",
    "src/app/decision/[token]/page.tsx",
    "src/app/prueba/[token]/page.tsx",
    "src/app/entrevista-ia/[token]/page.tsx",
  ];
  for (const rel of pages) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.match(src, /candidate-invalid-link/, rel);
    assert.doesNotMatch(src, /Token inválido/, rel);
    assert.doesNotMatch(src, /Algo salió mal/, rel);
    assert.doesNotMatch(src, /intenta de nuevo/i, rel);
  }
});
