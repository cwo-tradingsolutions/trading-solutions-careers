/**
 * GET /api/google/status — si Gmail está conectado en ESTE ambiente.
 * En preview sin fila propia: connected false y connect_label
 * "Conecta Google para preview". No informa el token de producción.
 */
import { NextResponse } from "next/server";
import { isGmailConnected } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await isGmailConnected();
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
