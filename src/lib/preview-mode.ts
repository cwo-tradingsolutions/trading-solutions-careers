import { NextResponse } from "next/server";

/**
 * Vercel sets VERCEL_ENV to "preview" on preview deployments.
 * Production and local runs (unset or "production" / "development") keep the real path.
 */
type PreviewEnv = { VERCEL_ENV?: string };

export function isPreviewTestMode(env: PreviewEnv = process.env as PreviewEnv): boolean {
  return env.VERCEL_ENV === "preview";
}

/** Mock success. Call only after required-field checks, and before any write, upload, or email. */
export function previewTestJson(route: string, extra: Record<string, unknown> = {}) {
  console.info(
    `[preview-test-mode] ${route}: mock success — no database write, no storage upload, no email`
  );
  return NextResponse.json({
    success: true,
    ok: true,
    preview_test_mode: true,
    ...extra,
  });
}
