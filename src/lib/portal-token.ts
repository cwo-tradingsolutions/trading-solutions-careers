/**
 * Portal token: link único para que cada candidato vea SU estatus en el ATS
 * sin necesidad de crear cuenta ni autenticación.
 *
 * Formato: <application_id>.<signature>
 *   - signature = HMAC_SHA256(id + email, PORTAL_TOKEN_SECRET).slice(0, 16)
 *
 * PORTAL_TOKEN_SECRET firma los links nuevos (32+ caracteres).
 * Hasta PORTAL_TOKEN_LEGACY_UNTIL, también se aceptan firmas hechas con
 * ADMIN_SECRET, para que los links ya enviados sigan abriendo.
 */
import crypto from "crypto";
import { MIN_AUTH_SECRET_LENGTH, readPortalSecret } from "./hr-admin-secrets";

/** Legacy window cannot run longer than this, measured from the check time. */
export const PORTAL_LEGACY_MAX_DAYS = 14;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function hmac16(secret: string, applicationId: number, email: string): string {
  const data = `${applicationId}|${email.toLowerCase().trim()}`;
  return crypto.createHmac("sha256", secret).update(data).digest("hex").slice(0, 16);
}

function timingSafeHex(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

/**
 * Only `YYYY-MM-DD`. The day is included, and it cannot sit more than
 * PORTAL_LEGACY_MAX_DAYS after `now`. Anything else is ignored.
 */
export function legacyPortalUntilMs(raw: string | undefined | null, now = Date.now()): number | null {
  const value = (raw ?? "").trim();
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const end = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  const check = new Date(end);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  if (end > now + PORTAL_LEGACY_MAX_DAYS * 24 * 60 * 60 * 1000) return null;
  return end;
}

export function legacyPortalSecret(now = Date.now(), env: NodeJS.ProcessEnv = process.env): string | null {
  const until = legacyPortalUntilMs(env.PORTAL_TOKEN_LEGACY_UNTIL, now);
  if (until === null || now > until) return null;
  const admin = (env.ADMIN_SECRET ?? "").trim();
  if (admin.length < MIN_AUTH_SECRET_LENGTH) return null;
  return admin;
}

export function generatePortalToken(applicationId: number, email: string): string {
  const secret = readPortalSecret();
  if (!secret) {
    throw new Error("PORTAL_TOKEN_SECRET no configurado, muy corto, o igual a otro secreto");
  }
  return `${applicationId}.${hmac16(secret, applicationId, email)}`;
}

export function verifyPortalToken(token: string): { application_id: number; signature: string } | null {
  const match = token.match(/^(\d+)\.([0-9a-f]{16})$/i);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  const signature = match[2].toLowerCase();
  if (!Number.isFinite(id) || id <= 0) return null;
  return { application_id: id, signature };
}

export function isValidSignatureFor(applicationId: number, email: string, providedSignature: string): boolean {
  const provided = providedSignature.toLowerCase();
  const current = readPortalSecret();
  if (current && timingSafeHex(hmac16(current, applicationId, email), provided)) return true;
  const legacy = legacyPortalSecret();
  if (legacy && timingSafeHex(hmac16(legacy, applicationId, email), provided)) return true;
  return false;
}
