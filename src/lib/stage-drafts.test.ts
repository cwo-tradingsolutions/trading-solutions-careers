import assert from "node:assert/strict";
import { test } from "node:test";
import { stageDraftsEnabled } from "./stage-drafts";

test("stage drafts stay off unless STAGE_DRAFTS_ENABLED is explicitly on", () => {
  assert.equal(stageDraftsEnabled(undefined), false);
  assert.equal(stageDraftsEnabled(""), false);
  assert.equal(stageDraftsEnabled("0"), false);
  assert.equal(stageDraftsEnabled("false"), false);
  assert.equal(stageDraftsEnabled("1"), true);
  assert.equal(stageDraftsEnabled("true"), true);
  assert.equal(stageDraftsEnabled("yes"), true);
  assert.equal(stageDraftsEnabled("on"), true);
});
