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
import { readCronSecret } from "@/lib/cron-auth";
import { cronAuthorized, cronPresentedSecret } from "@/lib/cron-request-auth";
import { runInProgressRescore } from "@/lib/ai-interview-rescore";

export const runtime = "nodejs";
export const maxDuration = 300;

function cronOk(req: NextRequest): boolean {
  const presented = cronPresentedSecret(
    req.headers.get("authorization"),
    req.headers.get("x-cron-secret"),
  );
  return cronAuthorized(presented, readCronSecret());
}

async function run() {
  if (!aiInterviewEnabled()) {
    return NextResponse.json({ status: "disabled" }, { status: 503 });
  }

  try {
    const { pending, results, disabled } = await runInProgressRescore();
    if (disabled) {
      return NextResponse.json({ status: "disabled" }, { status: 503 });
    }
    if (results.some((row) => row.error_kind === "bad_base_url")) {
      console.warn("rescore skipped: APP_URL or NEXT_PUBLIC_APP_URL is missing or not https");
      return NextResponse.json({ success: false, error: "bad_base_url" }, { status: 500 });
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

/** GET has side effects, so only the cron secret is accepted. No admin cookie. */
export async function GET(req: NextRequest) {
  if (!cronOk(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run();
}

/** POST also accepts an HR Admin session, for the button in the funnel. */
export async function POST(req: NextRequest) {
  if (!cronOk(req)) {
    const authError = requireAdmin(req);
    if (authError) return authError;
  }
  return run();
}
