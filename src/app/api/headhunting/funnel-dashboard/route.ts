/**
 * GET /api/headhunting/funnel-dashboard
 *
 * Agrega en el servidor. Solo lectura. El client_id va en el WHERE
 * (por defecto el de Trading Solutions). ?example=1 devuelve la fixture
 * etiquetada, sin tocar la base.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { dashboardResponse } from "@/lib/funnel-dashboard/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  try {
    const payload = await dashboardResponse(req.nextUrl);
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[funnel-dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
