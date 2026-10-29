import assert from "node:assert/strict";
import { isPreviewTestMode } from "./preview-mode";

assert.equal(isPreviewTestMode({ VERCEL_ENV: "preview" }), true);
assert.equal(isPreviewTestMode({ VERCEL_ENV: "production" }), false);
assert.equal(isPreviewTestMode({ VERCEL_ENV: "development" }), false);
assert.equal(isPreviewTestMode({}), false);
assert.equal(isPreviewTestMode({ VERCEL_ENV: "Preview" }), false);

console.log("preview-mode checks passed");
