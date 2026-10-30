/**
 * GET /api/cron/sync-contactos
 *
 * Cada hora pasa 25 candidatos por Gmail, empezando por los que llevan más
 * tiempo sin revisar. Así el historial de contactos se mantiene al día aunque
 * nadie abra la ficha. No envía nada: solo lee y anota.
 *
 * Auth: Vercel Cron envía `Authorization: Bearer ${CRON_SECRET}`. También
 * acepta sesión de admin para correrlo a mano.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { cronRequestDecision } from "@/lib/cron-request-auth";
import { sincronizarLote } from "@/lib/contactos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const cronDecision = cronRequestDecision(req.headers.get("authorization"), req.headers.get("x-cron-secret"));
  if (cronDecision === 401 || cronDecision === 500) {
    return NextResponse.json({ ok: false }, { status: cronDecision });
  }
  if (cronDecision !== "ok") {
    const authError = requireAdmin(req);
    if (authError) return authError;
  }
  const r = await sincronizarLote(25, { soloVencidosHoras: 6 });
  return NextResponse.json(r);
}
