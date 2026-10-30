import { NextResponse } from "next/server";
import { logSessionSecretFailure } from "@/lib/hr-admin-secrets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Loud failure when the session signer is missing or reused as another secret. */
export async function GET() {
  const problem = logSessionSecretFailure();
  if (problem) {
    return NextResponse.json(
      { ok: false, error: "HR_ADMIN_SESSION_SECRET is not usable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
