/**
 * POST /api/cron/rescore-ai-interviews
 *
 * Same scoring pass as the admin rescore route, for Cloud Scheduler.
 * Auth: Authorization: Bearer CRON_SECRET, or an HR Admin session.
 * The scheduler job is documented and is not created by this change.
 * The AI interview stays disabled on GCP until that job is added on purpose.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { runInProgressRescore } from "@/lib/ai-interview-rescore";

export const runtime = "nodejs";
export const maxDuration = 300;

function isCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!auth || !secret) return false;
  return auth === `Bearer ${secret}`;
}

function baseUrlFrom(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host");
  return host && !host.includes("localhost")
    ? `${proto}://${host}`
    : process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";
}

export async function POST(req: NextRequest) {
  if (!isCron(req)) {
    const authError = requireAdmin(req);
    if (authError) return authError;
  }

  try {
    const { pending, results } = await runInProgressRescore({ baseUrl: baseUrlFrom(req) });
    return NextResponse.json({
      success: true,
      pending,
      rescored: results.filter((row) => row.success).length,
      waiting: results.filter((row) => row.error_kind === "still_processing").length,
    });
  } catch (err) {
    console.error("cron rescore-ai-interviews error");
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
