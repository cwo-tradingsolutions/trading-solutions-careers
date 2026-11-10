import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { requireAdmin } from "./admin-auth.ts";

process.env.ADMIN_SECRET = "test-admin-secret-for-401";

/** Enough of a request for requireAdmin. These tests return before any database call. */
function request(url: string, cookie?: string) {
  return {
    url,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "cookie") return cookie ?? null;
        return null;
      },
    },
    cookies: {
      get(name: string) {
        if (!cookie) return undefined;
        const pair = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
        if (!pair) return undefined;
        return { value: pair.slice(name.length + 1) };
      },
    },
    nextUrl: new URL(url),
  };
}

type GetHandler = (req: ReturnType<typeof request>, ctx?: { params: unknown }) => Promise<Response>;

const routes: { spec: string; url: string; load: () => Promise<GetHandler>; ctx?: { params: unknown } }[] = [
  {
    spec: "GET /api/applications",
    url: "http://localhost/api/applications",
    load: async () => (await import("../app/api/applications/route.ts")).GET,
  },
  {
    spec: "GET /api/assessments",
    url: "http://localhost/api/assessments",
    load: async () => (await import("../app/api/assessments/route.ts")).GET,
  },
  {
    spec: "GET /api/applications/[id]",
    url: "http://localhost/api/applications/1",
    load: async () => (await import("../app/api/applications/[id]/route.ts")).GET as GetHandler,
    ctx: { params: { id: "1" } },
  },
  {
    spec: "GET /api/talent-pool/[id]",
    url: "http://localhost/api/talent-pool/1",
    load: async () => (await import("../app/api/talent-pool/[id]/route.ts")).GET as GetHandler,
    ctx: { params: { id: "1" } },
  },
  {
    spec: "GET /api/headhunting/candidates/[candidateId]",
    url: "http://localhost/api/headhunting/candidates/abc",
    load: async () => (await import("../app/api/headhunting/candidates/[candidateId]/route.ts")).GET as GetHandler,
    ctx: { params: Promise.resolve({ candidateId: "abc" }) },
  },
  {
    spec: "GET /api/recruiter-config",
    url: "http://localhost/api/recruiter-config",
    load: async () => (await import("../app/api/recruiter-config/route.ts")).GET,
  },
  {
    spec: "GET /api/matching",
    url: "http://localhost/api/matching?vacancy_id=1",
    load: async () => (await import("../app/api/matching/route.ts")).GET,
  },
  {
    spec: "GET /api/google/status",
    url: "http://localhost/api/google/status",
    load: async () => (await import("../app/api/google/status/route.ts")).GET,
  },
  {
    spec: "GET /api/assessment-preview",
    url: "http://localhost/api/assessment-preview",
    load: async () => (await import("../app/api/assessment-preview/route.ts")).GET,
  },
];

test("hr_admin_session is the same cookie requireAdmin already accepts", () => {
  const secret = process.env.ADMIN_SECRET as string;
  const ts = Date.now().toString();
  const sig = crypto.createHmac("sha256", secret).update(ts).digest("hex");
  const req = request("http://localhost/api/applications", `hr_admin_session=${ts}.${sig}`);
  assert.equal(requireAdmin(req as never), null);
});

test("unauthenticated GETs of candidate or config data return 401", async () => {
  for (const route of routes) {
    const get = await route.load();
    const res = await get(request(route.url), route.ctx);
    assert.equal(res.status, 401, route.spec);
    const body = await res.json();
    assert.deepEqual(body, { error: "Unauthorized" }, route.spec);
  }
});
