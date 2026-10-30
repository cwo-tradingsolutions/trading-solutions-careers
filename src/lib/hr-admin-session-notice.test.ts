import assert from "node:assert/strict";
import test from "node:test";
import { HR_ADMIN_SESSION_API_PREFIXES, isHrAdminSessionApi } from "./hr-admin-session-notice.ts";

test("session-expired notice watches the routes closed in hotfix 27", () => {
  for (const prefix of [
    "/api/headhunting",
    "/api/admin",
    "/api/dashboard",
    "/api/applications",
    "/api/assessments",
    "/api/talent-pool",
    "/api/recruiter-config",
    "/api/matching",
    "/api/google",
    "/api/assessment-preview",
  ]) {
    assert.equal(HR_ADMIN_SESSION_API_PREFIXES.includes(prefix as never), true);
    assert.equal(isHrAdminSessionApi(`https://careers.example${prefix}/1`), true);
  }
  assert.equal(isHrAdminSessionApi("https://careers.example/api/referrals"), false);
});
