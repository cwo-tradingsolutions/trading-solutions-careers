/**
 * GET and POST /api/cron/rescore-ai-interviews
 *
 * Scores in-progress interviews, and completed ones that never received a score,
 * once ElevenLabs marks the conversation done. Cloud Scheduler on Cloud Run
 * should call this. It is not a Vercel Cron and the job is not created here.
 * If IAP sits in front, send the secret in X-Cron-Secret; OIDC covers Cloud Run IAM.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { aiInterviewEnabled } from "@/lib/ai-interview-flag";
import { cronAuthorized, cronPresentedSecret } from "@/lib/cron-auth";
import { runInProgressRescore } from "@/lib/ai-interview-rescore";

export const runtime = "nodejs";
export const maxDuration = 300;

function allowed(req: NextRequest): boolean {
  const presented = cronPresentedSecret(
    req.headers.get("authorization"),
    req.headers.get("x-cron-secret"),
  );
  return cronAuthorized(presented, process.env.CRON_SECRET);
}

async function handle(req: NextRequest) {
  if (!allowed(req)) {
    const authError = requireAdmin(req);
    if (authError) return authError;
  }
  if (!aiInterviewEnabled()) {
    return NextResponse.json({ status: "disabled" }, { status: 503 });
  }

  try {
    const { pending, results, disabled } = await runInProgressRescore({
      cronSecret: process.env.CRON_SECRET,
    });
    if (disabled) {
      return NextResponse.json({ status: "disabled" }, { status: 503 });
    }
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

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
