import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cronSecretHttpStatus, readCronSecret } from "./hr-admin-secrets";

function bearerMatches(authorization: string, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(authorization);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** True when Authorization is Bearer plus a usable CRON_SECRET, compared in constant time. */
export function cronBearerAccepted(req: NextRequest): boolean {
  const secret = readCronSecret();
  if (!secret) return false;
  return bearerMatches(req.headers.get("authorization") ?? "", secret);
}

/**
 * A Bearer request against a bad CRON_SECRET.
 * 500 when it equals the session or portal secret, 401 otherwise.
 * A request with no Bearer header is left for the admin session.
 */
export function cronDeployRejection(req: NextRequest): NextResponse | null {
  if (!(req.headers.get("authorization") ?? "").startsWith("Bearer ")) return null;
  const status = cronSecretHttpStatus();
  if (!status) return null;
  return NextResponse.json({ ok: false }, { status });
}
