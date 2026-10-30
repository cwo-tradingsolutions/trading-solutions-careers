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
import { cronBearerAccepted, cronDeployRejection } from "@/lib/cron-auth";
import { sincronizarLote } from "@/lib/contactos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const rejected = cronDeployRejection(req);
  if (rejected) return rejected;
  if (!cronBearerAccepted(req)) {
    const authError = requireAdmin(req);
    if (authError) return authError;
  }
  const r = await sincronizarLote(25, { soloVencidosHoras: 6 });
  return NextResponse.json(r);
}
