/**
 * POST /api/google/disconnect — borra el token de Google de ESTE ambiente.
 * En preview no borra la fila de producción. Después, los emails de este
 * ambiente vuelven a salir vía Resend (default).
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { clearTokens } from "@/lib/gmail";

export const runtime = "nodejs";

export async function POST() {
  await clearTokens();
  return NextResponse.json({ ok: true });
}
