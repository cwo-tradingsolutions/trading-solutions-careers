/**
 * GET  /api/hr-admin/login          → whether the password form and Google are available
 * POST /api/hr-admin/login          → vault password, only if HR_ADMIN_PASSWORD_LOGIN_ENABLED
 * DELETE /api/hr-admin/login        → logout
 *
 * The session cookie is signed with HR_ADMIN_SESSION_SECRET, not ADMIN_SECRET.
 * Break-glass sessions still carry an email claim so old email-less cookies die.
 */
import { NextResponse } from "next/server";
import { isPasswordLoginEnabled } from "@/lib/hr-admin-access";
import {
  clearOAuthCookie,
  clearSessionCookie,
  cookieIsSecure,
  noStore,
  setSessionCookie,
} from "@/lib/hr-admin-cookies";
import { signAdminSession } from "@/lib/hr-admin-session";
import { HR_ADMIN_BREAK_GLASS_EMAIL, MIN_AUTH_SECRET_LENGTH, readSessionSecret } from "@/lib/hr-admin-secrets";
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

  const password = (process.env.ADMIN_SECRET ?? "").trim();
  const sessionSecret = readSessionSecret();
  if (!password || password.length < MIN_AUTH_SECRET_LENGTH || !sessionSecret) {
    return noStore(
      NextResponse.json(
        { error: "Servidor sin clave de emergencia o sin HR_ADMIN_SESSION_SECRET" },
        { status: 500 },
      ),
    );
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

  if (!timingSafeEqualStr(pass, password)) {
    console.warn("[hr-admin] break-glass password login failed");
    await new Promise((resolve) => setTimeout(resolve, 500));
    return noStore(NextResponse.json({ error: "Clave incorrecta" }, { status: 401 }));
  }

  console.warn("[hr-admin] break-glass password login succeeded");
  const res = NextResponse.json({ ok: true });
  setSessionCookie(
    res,
    signAdminSession(sessionSecret, HR_ADMIN_BREAK_GLASS_EMAIL),
    cookieIsSecure(req),
  );
  return noStore(res);
}

export async function DELETE(req: Request) {
  const secure = cookieIsSecure(req);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res, secure);
  clearOAuthCookie(res, secure);
  return noStore(res);
}
