/**
 * POST /api/hr-admin/login
 *
 * Verifica la clave de acceso contra process.env.ADMIN_SECRET.
 * Si es correcta, setea una cookie httpOnly `hr_admin_session` firmada con HMAC.
 *
 * La cookie contiene: `<timestamp>.<sig>` donde sig = HMAC_SHA256(timestamp, ADMIN_SECRET)
 * El middleware valida la firma en cada request a /hr-admin/*.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function signSession(secret: string): string {
  const ts = Date.now().toString();
  const sig = crypto.createHmac("sha256", secret).update(ts).digest("hex");
  return `${ts}.${sig}`;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export async function POST(req: Request) {
  const secret = (process.env.ADMIN_SECRET ?? "").trim();
  if (!secret || secret.length < 6) {
    return NextResponse.json(
      { error: "Servidor sin ADMIN_SECRET configurado" },
      { status: 500 }
    );
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const pass = (body.password ?? "").toString().trim();
  if (!pass) {
    return NextResponse.json({ error: "Clave requerida" }, { status: 400 });
  }

  if (!timingSafeEqualStr(pass, secret)) {
    // Pequeña espera para mitigar brute force
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "Clave incorrecta" }, { status: 401 });
  }

  const token = signSession(secret);
  const res = NextResponse.json({ ok: true });
  // Cookie válida 12 horas, httpOnly + secure + sameSite=lax
  res.cookies.set("hr_admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 h
  });
  return res;
}

export async function DELETE() {
  // Logout
  const res = NextResponse.json({ ok: true });
  res.cookies.set("hr_admin_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
