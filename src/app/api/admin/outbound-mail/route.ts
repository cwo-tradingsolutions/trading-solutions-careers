import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { isGmailConnected } from "@/lib/gmail";
import { dailySendWarning } from "@/lib/ats-mail";
import { countSendsToday, listPending } from "@/lib/ats-mail-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const [gmail, pending, sendsToday] = await Promise.all([
      isGmailConnected(),
      listPending(),
      countSendsToday(),
    ]);
    return NextResponse.json({
      connected: gmail.connected,
      email: gmail.email ?? null,
      pending_count: pending.length,
      sends_today: sendsToday,
      warn_daily: dailySendWarning(sendsToday),
      pending,
    });
  } catch (e) {
    console.error("[outbound-mail]", e);
    return NextResponse.json({ error: "No se pudo leer la bandeja de pendientes" }, { status: 500 });
  }
}
