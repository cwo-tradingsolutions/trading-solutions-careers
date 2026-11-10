/**
 * GET /api/joint-schedulings/[token]
 *
 * Cerrado. No lee la sesión ni el calendario, así que no devuelve
 * correos de entrevistadores. El mismo mensaje que el POST de book.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { error: "Este enlace ya no está activo. Escríbenos a jointheteam@tradingsolutions.com" },
    { status: 410 },
  );
}
