import crypto from "node:crypto";
import { cronSecretHttpStatus, readCronSecret } from "./hr-admin-secrets";

/** Constant-time string compare. Different lengths are a mismatch and do not throw. */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** X-Cron-Secret when IAP occupies Authorization, otherwise the Bearer token. */
export function cronPresentedSecret(authorization: string | null, cronHeader: string | null): string {
  const custom = (cronHeader ?? "").trim();
  if (custom) return custom;
  const auth = authorization ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return "";
}

export function cronAuthorized(presented: string, secret: string | null): boolean {
  if (!secret || !presented) return false;
  return timingSafeEqual(presented, secret);
}

export type CronRequestDecision = "ok" | "admin" | 401 | 500;

/**
 * ok: Bearer or X-Cron-Secret matches a usable CRON_SECRET.
 * 401 or 500: a cron credential was sent and the deploy check failed.
 * admin: no cron credential, or it does not match; the route may use the HR session.
 * This module does not import next/server.
 */
export function cronRequestDecision(
  authorization: string | null,
  cronHeader: string | null,
  env: NodeJS.ProcessEnv = process.env,
): CronRequestDecision {
  const bearer = (authorization ?? "").startsWith("Bearer ");
  const custom = (cronHeader ?? "").trim();
  if (!bearer && !custom) return "admin";
  const status = cronSecretHttpStatus(env);
  if (status) return status;
  if (cronAuthorized(cronPresentedSecret(authorization, cronHeader), readCronSecret(env))) return "ok";
  return "admin";
}
