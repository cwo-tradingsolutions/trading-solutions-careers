/**
 * GET /api/hr-admin/vacancy-sources
 * Fuentes, postings y llegada por vacante del ATS. hr-admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { cargarTableroFuentes } from "@/lib/recruitment-sources-db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  const tablero = await cargarTableroFuentes();
  return NextResponse.json(tablero);
}
