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
import { readPortalSecret } from "./hr-admin-secrets";

function hmac16(secret: string, applicationId: number, email: string): string {
  const data = `${applicationId}|${email.toLowerCase().trim()}`;
  return crypto.createHmac("sha256", secret).update(data).digest("hex").slice(0, 16);
}

function timingSafeHex(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

/** Date-only values include that UTC day. A full timestamp is used as given. */
export function legacyPortalUntilMs(raw: string | undefined | null): number | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const end = Date.parse(`${value}T23:59:59.999Z`);
    return Number.isFinite(end) ? end : null;
  }
  const end = Date.parse(value);
  return Number.isFinite(end) ? end : null;
}

export function legacyPortalSecret(now = Date.now(), env: NodeJS.ProcessEnv = process.env): string | null {
  const until = legacyPortalUntilMs(env.PORTAL_TOKEN_LEGACY_UNTIL);
  if (until === null || now > until) return null;
  const admin = (env.ADMIN_SECRET ?? "").trim();
  if (admin.length < 8) return null;
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
