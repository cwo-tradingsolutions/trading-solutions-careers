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

export type MailGuardDecision =
  | { send: true }
  | {
      send: false;
      status: typeof BLOCKED_STAGING_STATUS;
      reason: "not_on_allowlist" | "staging_allowlist_unset";
      domains: string[];
    };

const PROD_HOSTS = new Set([
  "careers.tradingsolutions.com",
  "trading-solutions-careers.vercel.app",
]);

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
    emails.add(extractAddress(entry));
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
 * prod: Vercel production, or Cloud Run `prd-careers` (and any `prd-` service).
 * nonprod: staging service, STAGING_READ_ONLY, preview/development, or a URL
 * that is not the production host.
 * unspecified: nothing says which environment this is (local without a URL).
 */
export function mailEnvironment(env: MailGuardEnv): "prod" | "nonprod" | "unspecified" {
  const service = (env.K_SERVICE || "").trim();
  const stagingFlag = env.STAGING_READ_ONLY === "1";
  if (service.startsWith("stg-") || stagingFlag) return "nonprod";
  if (service === "prd-careers" || service.startsWith("prd-")) return "prod";
  if (env.VERCEL_ENV === "production") return "prod";
  if (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development") return "nonprod";

  const rawUrl = (env.NEXT_PUBLIC_APP_URL || "").trim();
  if (!rawUrl) return "unspecified";
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return "nonprod";
    if (host.includes("staging") || host.startsWith("stg.") || host.includes("stg-")) return "nonprod";
    if (host.endsWith(".vercel.app") && !PROD_HOSTS.has(host)) return "nonprod";
    return "unspecified";
  } catch {
    return "nonprod";
  }
}

function uniqueDomains(addresses: string[]): string[] {
  return [...new Set(addresses.map(recipientDomain))];
}

export function decideOutboundRecipients(fields: RecipientFields, env: MailGuardEnv = {}): MailGuardDecision {
  const addresses = [
    ...splitRecipients(fields.to),
    ...splitRecipients(fields.cc),
    ...splitRecipients(fields.bcc),
  ];
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
