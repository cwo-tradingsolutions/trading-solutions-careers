import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { previewReadOnlyBlock } from "./preview-readonly";

describe("preview read-only", () => {
  it("no actúa fuera de preview", () => {
    assert.equal(previewReadOnlyBlock(undefined, "POST", "/api/headhunting/candidates"), null);
    assert.equal(previewReadOnlyBlock("production", "DELETE", "/api/cron/run-reminders"), null);
    assert.equal(previewReadOnlyBlock("preview", "GET", "/api/headhunting/funnel-dashboard"), null);
  });

  it("bloquea escrituras y los GET peligrosos, y deja entrar el login", () => {
    const block = { error: "preview read-only" as const };
    assert.deepEqual(previewReadOnlyBlock("preview", "POST", "/api/headhunting/candidates"), block);
    assert.deepEqual(previewReadOnlyBlock("preview", "PUT", "/api/x"), block);
    assert.deepEqual(previewReadOnlyBlock("preview", "PATCH", "/api/x"), block);
    assert.deepEqual(previewReadOnlyBlock("preview", "DELETE", "/api/x"), block);
    assert.equal(previewReadOnlyBlock("preview", "POST", "/api/hr-admin/login"), null);
    assert.equal(previewReadOnlyBlock("preview", "DELETE", "/api/hr-admin/login"), null);
    assert.deepEqual(previewReadOnlyBlock("preview", "PUT", "/api/hr-admin/login"), block);
    assert.deepEqual(previewReadOnlyBlock("preview", "GET", "/api/cron/run-reminders"), block);
    assert.deepEqual(previewReadOnlyBlock("preview", "GET", "/api/google/auth"), block);
    assert.deepEqual(previewReadOnlyBlock("preview", "GET", "/api/google/callback"), block);
    assert.equal(previewReadOnlyBlock("preview", "GET", "/api/google/status"), null);
    assert.deepEqual(previewReadOnlyBlock("preview", "GET", "/api/linkedin/webhook"), block);
    assert.deepEqual(previewReadOnlyBlock("preview", "GET", "/api/linkedin/auth"), block);
    assert.equal(previewReadOnlyBlock("preview", "OPTIONS", "/api/headhunting/candidates"), null);
  });
});
