import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPreviewAllowed } from "./preview-allowed.ts";

describe("isPreviewAllowed", () => {
  it("permite preview y development de Vercel, staging de Cloud Run, y NODE_ENV development", () => {
    assert.equal(isPreviewAllowed({ VERCEL_ENV: "preview" }), true);
    assert.equal(isPreviewAllowed({ VERCEL_ENV: "development" }), true);
    assert.equal(isPreviewAllowed({ K_SERVICE: "stg-careers", NODE_ENV: "production" }), true);
    assert.equal(isPreviewAllowed({ K_SERVICE: " Stg-Careers ", NODE_ENV: "production" }), true);
    assert.equal(isPreviewAllowed({ VERCEL_ENV: " Preview " }), true);
    assert.equal(isPreviewAllowed({ K_SERVICE: "stg-", NODE_ENV: "production" }), true);
    assert.equal(isPreviewAllowed({ NODE_ENV: "development" }), true);
  });

  it("niega producción de Vercel, prd-* de Cloud Run, y un entorno desconocido", () => {
    assert.equal(isPreviewAllowed({ VERCEL_ENV: "production", NODE_ENV: "production" }), false);
    assert.equal(isPreviewAllowed({ VERCEL_ENV: "production", NODE_ENV: "development" }), false);
    assert.equal(isPreviewAllowed({ K_SERVICE: "prd-careers", NODE_ENV: "production" }), false);
    assert.equal(isPreviewAllowed({ K_SERVICE: "prd-careers", NODE_ENV: "development" }), false);
    assert.equal(isPreviewAllowed({ K_SERVICE: "prd-careers" }), false);
    assert.equal(isPreviewAllowed({}), false);
    assert.equal(isPreviewAllowed({ NODE_ENV: "production" }), false);
    assert.equal(isPreviewAllowed({ NODE_ENV: "test" }), false);
    assert.equal(isPreviewAllowed({ VERCEL_ENV: "Production", NODE_ENV: "production" }), false);
    assert.equal(isPreviewAllowed({ K_SERVICE: "staging-careers", NODE_ENV: "production" }), false);
    assert.equal(isPreviewAllowed({ K_SERVICE: "", NODE_ENV: "production" }), false);
    assert.equal(isPreviewAllowed({ K_SERVICE: "   ", NODE_ENV: "production" }), false);
    assert.equal(isPreviewAllowed({ K_SERVICE: " PRD-careers ", NODE_ENV: "development" }), false);
    assert.equal(isPreviewAllowed({ VERCEL_ENV: "  PRODUCTION  ", NODE_ENV: "development" }), false);
    assert.equal(
      isPreviewAllowed({ VERCEL_ENV: "production", K_SERVICE: "prd-careers", NODE_ENV: "production" }),
      false,
    );
  });
});
