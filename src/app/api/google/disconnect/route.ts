/**
 * POST /api/google/disconnect — borra el token de Google de ESTE ambiente.
 * En preview no borra la fila de producción. Después, los emails de este
 * ambiente quedan pendientes hasta que alguien vuelva a conectar el buzón.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { clearTokens } from "@/lib/gmail";
import { isPreviewTestMode, previewTestJson } from "@/lib/preview-mode";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  if (isPreviewTestMode()) {
    return previewTestJson("POST /api/google/disconnect");
  }
  await clearTokens();
  return NextResponse.json({ ok: true });
}
