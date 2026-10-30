/**
 * POST /api/admin/candidates/[candidateId]/send-joint-scheduling
 *
 * Cerrado. No crea borrador ni evento de calendario.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "El agendamiento conjunto está cerrado. No se envía el enlace ni se crea un evento de calendario." },
    { status: 410 },
  );
}
