/**
 * Portal token: link único para que cada candidato vea SU estatus en el ATS
 * sin necesidad de crear cuenta ni autenticación.
 *
 * Formato: <application_id>.<signature>
 *   - signature = HMAC_SHA256(id + email, ADMIN_SECRET).slice(0, 16)
 *
 * No usa cookies, no requiere DB extra. Verificamos recomputando.
 * Si rotas ADMIN_SECRET, los tokens viejos invalidan automáticamente.
 */
import crypto from "crypto";

function getSecret(): string {
  const s = (process.env.ADMIN_SECRET ?? "").trim();
  if (!s || s.length < 8) {
    throw new Error("ADMIN_SECRET no configurado o muy corto");
  }
  return s;
}

function sign(applicationId: number, email: string): string {
  const data = `${applicationId}|${email.toLowerCase().trim()}`;
  return crypto
    .createHmac("sha256", getSecret())
    .update(data)
    .digest("hex")
    .slice(0, 16);
}

export function generatePortalToken(applicationId: number, email: string): string {
  return `${applicationId}.${sign(applicationId, email)}`;
}

export function verifyPortalToken(token: string): { application_id: number; signature: string } | null {
  const m = token.match(/^(\d+)\.([0-9a-f]{16})$/i);
  if (!m) return null;
  const id = parseInt(m[1], 10);
  const sig = m[2].toLowerCase();
  if (!Number.isFinite(id) || id <= 0) return null;
  return { application_id: id, signature: sig };
}

export function isValidSignatureFor(applicationId: number, email: string, providedSignature: string): boolean {
  const expected = sign(applicationId, email);
  if (expected.length !== providedSignature.length) return false;
  // timing-safe compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ providedSignature.charCodeAt(i);
  }
  return diff === 0;
}
