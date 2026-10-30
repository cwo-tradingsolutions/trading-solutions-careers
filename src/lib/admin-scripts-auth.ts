import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "./admin-auth";
import { readScriptsSecret } from "./hr-admin-secrets";

/**
 * One-shot and service calls. Not accepted by requireAdmin.
 * Missing ADMIN_SCRIPTS_SECRET fails closed (these calls do not run).
 */
export function scriptsAuthorized(req: { headers: { get(name: string): string | null } }): boolean {
  const secret = readScriptsSecret();
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const header = (req.headers.get("x-admin-secret") ?? "").trim();
  return secretEquals(bearer, secret) || secretEquals(header, secret);
}

export function requireAdminOrScripts(req: NextRequest): NextResponse | null {
  if (scriptsAuthorized(req)) return null;
  return requireAdmin(req);
}

function secretEquals(candidate: string, secret: string): boolean {
  if (!candidate) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(secret);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
