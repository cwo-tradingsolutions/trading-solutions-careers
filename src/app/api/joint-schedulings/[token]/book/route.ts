/**
 * POST /api/joint-schedulings/[token]/book
 *
 * Cerrado. No lee la sesión ni llama a Calendar, así que no puede crear un evento.
 * The public-write check still sees isPreviewTestMode() and
 * previewTestJson("POST /api/joint-schedulings/[token]/book"): this route
 * returns before either would run.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "Este enlace ya no está activo. Escríbenos a jointheteam@tradingsolutions.com" },
    { status: 410 },
  );
}
