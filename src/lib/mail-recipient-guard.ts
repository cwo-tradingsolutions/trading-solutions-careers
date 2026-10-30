/**
 * Staging copies real candidate addresses from production. One check, in
 * front of every Gmail send: an allowlist when it is set, and a default
 * block when this process is clearly not production and the list is missing.
 *
 * Logs name the domain only. They never include the mailbox local part.
 */

export const BLOCKED_STAGING_STATUS = "bloqueado_staging" as const;

export type MailGuardEnv = {
  MAIL_RECIPIENT_ALLOWLIST?: string | null;
  NEXT_PUBLIC_APP_URL?: string | null;
  K_SERVICE?: string | null;
  STAGING_READ_ONLY?: string | null;
  VERCEL_ENV?: string | null;
};

export type RecipientFields = {
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
};

export const INVALID_RECIPIENT_STATUS = "invalid_recipient" as const;

export type MailBlockStatus = typeof BLOCKED_STAGING_STATUS | typeof INVALID_RECIPIENT_STATUS;

export type MailGuardDecision =
  | { send: true }
  | {
      send: false;
      status: MailBlockStatus;
      reason: "not_on_allowlist" | "staging_allowlist_unset" | "bad_address";
      domains: string[];
    };

export function parseMailAllowlist(raw?: string | null): { emails: Set<string>; domains: Set<string> } | null {
  if (raw == null) return null;
  const entries = raw
    .split(/[,;\n]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length === 0) return null;
  const emails = new Set<string>();
  const domains = new Set<string>();
  for (const entry of entries) {
    if (entry.startsWith("@")) {
      const domain = entry.slice(1).trim();
      if (domain) domains.add(domain);
      continue;
    }
    const parsed = parseOneAddress(entry);
    if (parsed.ok) emails.add(parsed.address);
  }
  if (emails.size === 0 && domains.size === 0) return null;
  return { emails, domains };
}

/** Mailbox only, lowercased. Display names in `Name <a@b.c>` are dropped. */
export function extractAddress(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const wrapped = trimmed.match(/<([^>]+)>/);
  return (wrapped ? wrapped[1] : trimmed).trim();
}

/** Domain only. Unparseable values become `unknown` so the log cannot echo the address. */
export function recipientDomain(raw: string): string {
  const address = extractAddress(raw);
  const at = address.lastIndexOf("@");
  if (at < 1 || at === address.length - 1) return "unknown";
  const domain = address.slice(at + 1);
  if (!/^[a-z0-9.-]+$/.test(domain)) return "unknown";
  return domain;
}

export function splitRecipients(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((part) => extractAddress(part))
    .filter(Boolean);
}

/**
 * Production is VERCEL_ENV=production with no K_SERVICE, or K_SERVICE exactly
 * prd-careers (Cloud Run prod has no VERCEL_ENV). prd-careers-stg is not
 * production. Staging and preview are a service starting with stg-,
 * VERCEL_ENV=preview, or development. Any other name, a missing env, and
 * STAGING_READ_ONLY of 1 or true stay non-production. This does not use the
 * OAuth helper: that one treats a missing VERCEL_ENV as production.
 */
export function isProductionRuntime(env: MailGuardEnv = {}): boolean {
  const staging = String(env.STAGING_READ_ONLY ?? "").trim().toLowerCase();
  if (staging === "1" || staging === "true") return false;
  const service = (env.K_SERVICE || "").trim().toLowerCase();
  if (service.startsWith("stg-")) return false;
  if (service === "prd-careers") return true;
  if (service) return false;
  const vercel = (env.VERCEL_ENV || "").trim().toLowerCase();
  if (vercel === "preview" || vercel === "development") return false;
  return vercel === "production";
}

export function mailEnvironment(env: MailGuardEnv = {}): "prod" | "nonprod" {
  return isProductionRuntime(env) ? "prod" : "nonprod";
}

export type ParsedAddress = { ok: true; address: string } | { ok: false };

/** RFC 5322 atext, one or more, separated by single dots. */
const DOT_ATOM = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;

function asciiDomain(domain: string): string | null {
  let ascii = domain;
  try {
    ascii = new URL(`http://${domain}`).hostname;
  } catch {
    return null;
  }
  ascii = ascii.toLowerCase().replace(/\.$/, "");
  if (!ascii) return null;
  const labels = ascii.split(".");
  if (labels.length < 2) return null;
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return null;
    if (i === labels.length - 1 && label.length < 2) return null;
  }
  return ascii;
}

/** Exactly one addr-spec. Comments, breaks, extra brackets, and extra @ fail. Dot-atom local part. IDN domains become punycode. */
export function parseOneAddress(raw: string): ParsedAddress {
  if (typeof raw !== "string") return { ok: false };
  if (/[\u0000\r\n]/.test(raw)) return { ok: false };
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("(") || trimmed.includes(")")) return { ok: false };
  const opens = trimmed.match(/</g)?.length ?? 0;
  const closes = trimmed.match(/>/g)?.length ?? 0;
  if (opens > 1 || closes > 1 || opens !== closes) return { ok: false };
  let address = trimmed;
  if (opens === 1) {
    const match = trimmed.match(/^([^<]*)<([^<>]+)>$/);
    if (!match) return { ok: false };
    const display = match[1].trim();
    if (display.includes("@") || display.includes("<") || display.includes(">")) return { ok: false };
    address = match[2].trim();
  }
  if ((address.match(/@/g) || []).length !== 1) return { ok: false };
  const at = address.lastIndexOf("@");
  const local = address.slice(0, at);
  const domain = asciiDomain(address.slice(at + 1));
  if (!DOT_ATOM.test(local) || !domain) return { ok: false };
  return { ok: true, address: `${local.toLowerCase()}@${domain}` };
}

/** Comma-separated header. Every piece must be one address. The result is only those addresses. */
export function parseAddressList(raw?: string | null): { ok: true; addresses: string[] } | { ok: false } {
  if (raw == null || raw.trim() === "") return { ok: true, addresses: [] };
  if (/[\u0000\r\n]/.test(raw)) return { ok: false };
  const parts = raw.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: false };
  const addresses: string[] = [];
  for (const part of parts) {
    const parsed = parseOneAddress(part);
    if (!parsed.ok) return { ok: false };
    addresses.push(parsed.address);
  }
  return { ok: true, addresses };
}

function uniqueDomains(addresses: string[]): string[] {
  return [...new Set(addresses.map(recipientDomain))];
}

export function decideOutboundRecipients(fields: RecipientFields, env: MailGuardEnv = {}): MailGuardDecision {
  const lists = [parseAddressList(fields.to), parseAddressList(fields.cc), parseAddressList(fields.bcc)];
  if (lists.some((list) => !list.ok)) {
    const status = mailEnvironment(env) === "prod" ? INVALID_RECIPIENT_STATUS : BLOCKED_STAGING_STATUS;
    return { send: false, status, reason: "bad_address", domains: [] };
  }
  const addresses = lists.flatMap((list) => (list.ok ? list.addresses : []));
  const allow = parseMailAllowlist(env.MAIL_RECIPIENT_ALLOWLIST);
  if (!allow) {
    if (mailEnvironment(env) === "nonprod") {
      return {
        send: false,
        status: BLOCKED_STAGING_STATUS,
        reason: "staging_allowlist_unset",
        domains: uniqueDomains(addresses),
      };
    }
    return { send: true };
  }

  const blocked = addresses.filter((address) => {
    if (allow.emails.has(address)) return false;
    const domain = recipientDomain(address);
    return domain === "unknown" || !allow.domains.has(domain);
  });
  if (blocked.length === 0) return { send: true };
  return {
    send: false,
    status: BLOCKED_STAGING_STATUS,
    reason: "not_on_allowlist",
    domains: uniqueDomains(blocked),
  };
}

/** Warning line. Callers must log this and not the address. */
export function blockedSendLogLine(decision: Extract<MailGuardDecision, { send: false }>): string {
  const domains = decision.domains.length > 0 ? decision.domains.join(",") : "unknown";
  return `[ats-mail] bloqueado_staging reason=${decision.reason} domains=${domains}`;
}
