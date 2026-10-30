/**
 * GET /api/headhunting/funnel-dashboard/drill?vacancy=
 *
 * Candidatos estancados de una vacante: nombre, etapa, días, SLA, canal
 * y último evento. Sin teléfono, salario ni correo.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { drillResponse } from "@/lib/funnel-dashboard/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  try {
    const payload = await drillResponse(req.nextUrl);
    if ("error" in payload && payload.error) {
      return NextResponse.json({ error: payload.error }, { status: 400 });
    }
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[funnel-dashboard/drill]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
