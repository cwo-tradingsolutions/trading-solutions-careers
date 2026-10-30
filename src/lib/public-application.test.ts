import assert from "node:assert/strict";
import test from "node:test";
import { publicApplicationCreated } from "./public-application.ts";

test("the applicant acknowledgement omits score and prefilter", () => {
  const body = publicApplicationCreated(
    {
      id: 7,
      created_at: "2026-10-30T00:00:00.000Z",
      status: "new",
      score: 82,
      prefilter: { decision: "rejected", score: 82 },
      prefilter_data: { category: "no" },
    },
    "portal-token",
  );
  assert.deepEqual(body, {
    success: true,
    id: 7,
    created_at: "2026-10-30T00:00:00.000Z",
    status: "new",
    portal_token: "portal-token",
  });
  assert.equal("score" in body, false);
  assert.equal("prefilter" in body, false);
});
