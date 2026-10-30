import { NextResponse } from "next/server";
import { logStartupSecretFailure } from "@/lib/hr-admin-secrets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 503 when the session or portal signer cannot be used. The log has the reason. */
export async function GET() {
  if (logStartupSecretFailure()) {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
