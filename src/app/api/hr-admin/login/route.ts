/**
 * GET  /api/hr-admin/login          → whether the password form and Google are available
 * POST /api/hr-admin/login          → shared password, only if HR_ADMIN_PASSWORD_LOGIN_ENABLED
 * DELETE /api/hr-admin/login        → logout
 *
 * The session cookie is hr_admin_session, HMAC-signed with ADMIN_SECRET, for 8 hours.
 * Google and IAP set the same cookie and include the user's email.
 */
import { NextResponse } from "next/server";
import { isPasswordLoginEnabled } from "@/lib/hr-admin-access";
import { clearOAuthCookie, clearSessionCookie, noStore, setSessionCookie } from "@/lib/hr-admin-cookies";
import { signAdminSession } from "@/lib/hr-admin-session";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function timingSafeEqualStr(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export async function GET() {
  const clientId = (process.env.GOOGLE_ADMIN_OAUTH_CLIENT_ID ?? "").trim();
  return noStore(
    NextResponse.json({
      passwordEnabled: isPasswordLoginEnabled(process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED),
      googleEnabled: clientId.length > 0,
    }),
  );
}

export async function POST(req: Request) {
  if (!isPasswordLoginEnabled(process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED)) {
    console.warn("[hr-admin] password login rejected: HR_ADMIN_PASSWORD_LOGIN_ENABLED is off");
    return noStore(
      NextResponse.json({ error: "El ingreso con clave compartida está desactivado" }, { status: 403 }),
    );
  }

  const secret = (process.env.ADMIN_SECRET ?? "").trim();
  if (!secret || secret.length < 6) {
    return noStore(NextResponse.json({ error: "Servidor sin ADMIN_SECRET configurado" }, { status: 500 }));
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return noStore(NextResponse.json({ error: "Body inválido" }, { status: 400 }));
  }

  const pass = (body.password ?? "").toString().trim();
  if (!pass) {
    return noStore(NextResponse.json({ error: "Clave requerida" }, { status: 400 }));
  }

  if (!timingSafeEqualStr(pass, secret)) {
    console.warn("[hr-admin] break-glass password login failed");
    await new Promise((resolve) => setTimeout(resolve, 500));
    return noStore(NextResponse.json({ error: "Clave incorrecta" }, { status: 401 }));
  }

  console.warn("[hr-admin] break-glass password login succeeded");
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, signAdminSession(secret, null));
  return noStore(res);
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  clearOAuthCookie(res);
  return noStore(res);
}
