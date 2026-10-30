/**
 * Who may enter HR Admin with a corporate Google account.
 * Fail closed: an empty or unset allowlist admits nobody.
 */

export const HR_ADMIN_HOSTED_DOMAIN = "tradingsolutions.com";

export const GOOGLE_ID_TOKEN_ISSUERS = ["https://accounts.google.com", "accounts.google.com"] as const;

export const IAP_ISSUER = "https://cloud.google.com/iap";

const PASSWORD_FLAG_ON = new Set(["1", "true", "yes", "on"]);

export type IdentityClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  email?: string;
  email_verified?: boolean;
  hd?: string;
  nonce?: string;
};

export type IdentityReason =
  | "issuer"
  | "audience"
  | "expired"
  | "email"
  | "unverified"
  | "domain"
  | "allowlist"
  | "nonce";

export type IdentityDecision = { ok: true; email: string } | { ok: false; reason: IdentityReason };

export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const email = normalizeEmail(part);
    if (!email) continue;
    if (emailDomain(email) !== HR_ADMIN_HOSTED_DOMAIN) continue;
    seen.add(email);
  }
  return [...seen];
}

/** Default off. Only 1, true, yes, or on (any case, surrounding space ignored) enable it. */
export function isPasswordLoginEnabled(raw: string | undefined | null): boolean {
  return PASSWORD_FLAG_ON.has((raw ?? "").trim().toLowerCase());
}

export function assertGoogleIdClaims(
  claims: IdentityClaims,
  opts: { audience: string; allowlist: readonly string[]; now: number; nonce: string },
): IdentityDecision {
  if (!opts.nonce) return { ok: false, reason: "nonce" };
  const base = assertCorporateIdentity(claims, opts, GOOGLE_ID_TOKEN_ISSUERS);
  if (!base.ok) return base;
  if (claims.email_verified !== true) return { ok: false, reason: "unverified" };
  if (claims.nonce !== opts.nonce) return { ok: false, reason: "nonce" };
  return allowlisted(base.email, opts.allowlist);
}

/**
 * IAP assertions are signed by Google and may omit email_verified.
 * An explicit false still fails. hd and the allowlist are required.
 */
export function assertIapClaims(
  claims: IdentityClaims,
  opts: { audience: string; allowlist: readonly string[]; now: number },
): IdentityDecision {
  const base = assertCorporateIdentity(claims, opts, [IAP_ISSUER]);
  if (!base.ok) return base;
  if (claims.email_verified === false) return { ok: false, reason: "unverified" };
  return allowlisted(base.email, opts.allowlist);
}

/** Relative HR Admin path only. Anything else becomes the admin home. */
export function safeAdminNext(value: string | null | undefined): string {
  const fallback = "/hr-admin";
  if (!value) return fallback;
  const next = value.trim();
  if (!isHrAdminPath(next)) return fallback;
  if (next.includes("\\") || next.includes("://") || next.includes("\0") || /[\r\n]/.test(next)) {
    return fallback;
  }
  let decoded = next;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (decoded !== next && !isHrAdminPath(decoded)) return fallback;
  if (decoded.includes("\\") || decoded.includes("://")) return fallback;
  return next;
}

function assertCorporateIdentity(
  claims: IdentityClaims,
  opts: { audience: string; now: number },
  issuers: readonly string[],
): { ok: true; email: string } | { ok: false; reason: IdentityReason } {
  if (!opts.audience || !audienceMatches(claims.aud, opts.audience)) {
    return { ok: false, reason: "audience" };
  }
  if (!claims.iss || !issuers.includes(claims.iss)) return { ok: false, reason: "issuer" };
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp * 1000 <= opts.now) {
    return { ok: false, reason: "expired" };
  }
  const hd = (claims.hd ?? "").trim().toLowerCase();
  if (hd !== HR_ADMIN_HOSTED_DOMAIN) return { ok: false, reason: "domain" };
  const email = normalizeEmail(claims.email);
  if (!email || emailDomain(email) !== HR_ADMIN_HOSTED_DOMAIN) return { ok: false, reason: "email" };
  return { ok: true, email };
}

function allowlisted(email: string, allowlist: readonly string[]): IdentityDecision {
  if (allowlist.length === 0 || !allowlist.includes(email)) return { ok: false, reason: "allowlist" };
  return { ok: true, email };
}

function audienceMatches(aud: string | string[] | undefined, expected: string): boolean {
  if (typeof aud === "string") return aud === expected;
  if (Array.isArray(aud)) return aud.includes(expected);
  return false;
}

function normalizeEmail(value: string | undefined | null): string | null {
  const email = (value ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null;
  return email;
}

function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

function isHrAdminPath(path: string): boolean {
  return path === "/hr-admin" || path.startsWith("/hr-admin/") || path.startsWith("/hr-admin?");
}
