import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { aiInterviewEnabled } from "@/lib/ai-interview-flag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  return NextResponse.json({ enabled: aiInterviewEnabled() });
}
