import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.ADMIN_SECRET = "test-admin-secret-for-401";
process.env.HR_ADMIN_SESSION_SECRET = "test-session-secret-0123456789";
process.env.WXM_SERVICE_SECRET = "test-wxm-secret";

function request(url: string, opts?: { cookie?: string; authorization?: string; body?: unknown }) {
  return {
    url,
    method: "GET",
    headers: {
      get(name: string) {
        const key = name.toLowerCase();
        if (key === "cookie") return opts?.cookie ?? null;
        if (key === "authorization") return opts?.authorization ?? null;
        return null;
      },
    },
    cookies: {
      get(name: string) {
        const cookie = opts?.cookie;
        if (!cookie) return undefined;
        const pair = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
        if (!pair) return undefined;
        return { value: pair.slice(name.length + 1) };
      },
    },
    nextUrl: new URL(url),
    json: async () => opts?.body ?? {},
  };
}

/**
 * Cookie de hr-admin. Con #29 la firma es signAdminSession(HR_ADMIN_SESSION_SECRET, email).
 * En esta base, antes de ese merge, el módulo no está y la cookie sigue siendo ts.hmac
 * con ADMIN_SECRET. Las dos formas pasan requireAdmin del lado que corresponda.
 */
async function adminCookie(): Promise<string> {
  try {
    const mod = await import("./hr-admin-session.ts");
    const token = mod.signAdminSession(
      process.env.HR_ADMIN_SESSION_SECRET as string,
      "qa@tradingsolutions.com",
    );
    return `hr_admin_session=${token}`;
  } catch {
    const secret = process.env.ADMIN_SECRET as string;
    const ts = Date.now().toString();
    const sig = crypto.createHmac("sha256", secret).update(ts).digest("hex");
    return `hr_admin_session=${ts}.${sig}`;
  }
}

test("GET /api/requisitions sin sesión responde 401 y no lista ocultas", async () => {
  const { GET } = await import("../app/api/requisitions/route.ts");
  const res = await GET(request("http://localhost/api/requisitions") as never);
  assert.equal(res.status, 401);
});

test("GET /api/requisitions?include_hidden=1 con solo WXM responde 403", async () => {
  const { GET } = await import("../app/api/requisitions/route.ts");
  const res = await GET(request("http://localhost/api/requisitions?include_hidden=1", {
    authorization: "Bearer test-wxm-secret",
  }) as never);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, "include_hidden es solo para hr-admin");
});

test("GET /api/leader/board sin sesión responde 401", async () => {
  const { GET } = await import("../app/api/leader/board/route.ts");
  const res = await GET(request("http://localhost/api/leader/board") as never);
  assert.equal(res.status, 401);
});

test("GET /api/leader/board?include_hidden=1 sin admin responde 403", async () => {
  const { GET } = await import("../app/api/leader/board/route.ts");
  const res = await GET(request("http://localhost/api/leader/board?include_hidden=1&lead_email=lider@tradingsolutions.com", {
    authorization: "Bearer test-wxm-secret",
  }) as never);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, "include_hidden es solo para hr-admin");
});

test("POST /api/vacancies/[id]/postings rechaza una fuente con forma inválida", async () => {
  const { POST } = await import("../app/api/vacancies/[id]/postings/route.ts");
  const res = await POST(
    request("http://localhost/api/vacancies/vac/postings", {
      cookie: await adminCookie(),
      body: { source: "No Existe!" },
    }) as never,
    { params: { id: "vac" } },
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Fuente desconocida/);
});

test("POST /api/recruitment-sources rechaza una clave inválida antes de escribir", async () => {
  const { POST } = await import("../app/api/recruitment-sources/route.ts");
  const res = await POST(request("http://localhost/api/recruitment-sources", {
    cookie: await adminCookie(),
    body: { key: "CON ESPACIO", label: "Elempleo" },
  }) as never);
  assert.equal(res.status, 400);
});

test("DELETE /api/recruitment-sources no borra", async () => {
  const { DELETE } = await import("../app/api/recruitment-sources/route.ts");
  const anon = await DELETE(request("http://localhost/api/recruitment-sources") as never);
  assert.equal(anon.status, 401);
  const admin = await DELETE(request("http://localhost/api/recruitment-sources", {
    cookie: await adminCookie(),
  }) as never);
  assert.equal(admin.status, 405);
});

test("GET /api/hr-admin/vacancy-sources sin sesión responde 401", async () => {
  const { GET } = await import("../app/api/hr-admin/vacancy-sources/route.ts");
  const res = await GET(request("http://localhost/api/hr-admin/vacancy-sources") as never);
  assert.equal(res.status, 401);
});
