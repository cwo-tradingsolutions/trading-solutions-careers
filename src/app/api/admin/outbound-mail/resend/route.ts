import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { isGmailConnected } from "@/lib/gmail";
import { listPending, resendPendingMails } from "@/lib/ats-mail-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sends each pending row once. Refuses while the mailbox is disconnected so
 * the claim does not flip rows that cannot leave.
 */
export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const gmail = await isGmailConnected();
    if (!gmail.connected) {
      const pending = await listPending();
      return NextResponse.json({
        status: "mailbox_disconnected",
        sent: 0,
        still_pending: pending.length,
      });
    }

    const result = await resendPendingMails();
    const pending = await listPending();
    return NextResponse.json({
      status: "ok",
      sent: result.sent,
      still_pending: pending.length,
    });
  } catch (e) {
    console.error("[outbound-mail resend]", e);
    return NextResponse.json({ error: "No se pudieron reenviar los pendientes" }, { status: 500 });
  }
}
