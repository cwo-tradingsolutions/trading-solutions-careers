/**
 * One outbound path for candidate mail: Gmail from jointheteam@, or a
 * pending row when that mailbox cannot send. No second provider.
 *
 * The daily counter is a log line plus a count of successful sends today.
 * There is no hard cap. The HR banner warns above 1500.
 */

export const DAILY_SEND_WARN_AFTER = 1500;

export const MAX_SEND_ATTEMPTS = 5;
export const SENDING_STALE_MINUTES = 15;

/** Same user action inside this window shares one dedup key. A later attempt sends. */
export const DEDUP_WINDOW_MS = 2 * 60 * 1000;

const WINDOWED_DEDUP = /^(rejection_resend|headhunting_invite|battery_auto|battery_invite):/;

export function attemptDedupKey(base: string | null | undefined, now = Date.now()): string | null {
  if (!base) return null;
  if (!WINDOWED_DEDUP.test(base)) return base;
  return `${base}@${Math.floor(now / DEDUP_WINDOW_MS)}`;
}

export function nextAttemptDelayMs(attemptCount: number): number {
  const step = Math.max(1, attemptCount);
  return Math.min(2 ** (step - 1), 360) * 60_000;
}

export function mailboxDisconnectedBanner(pendingCount: number): string {
  const n = Number.isFinite(pendingCount) && pendingCount > 0 ? Math.floor(pendingCount) : 0;
  const label = n === 1 ? "1 correo pendiente" : `${n} correos pendientes`;
  return `Buzón jointheteam@ desconectado — ${label}. Reconectar`;
}

export function dailySendWarning(sendsToday: number): boolean {
  return sendsToday > DAILY_SEND_WARN_AFTER;
}

export type MailSideEffect =
  | { kind: "battery"; candidateId: string; sessionId: string; channel: string }
  | { kind: "rejection_sent"; candidateId: string }
  | { kind: "survey_sent"; surveyId: string };

export type CandidateMailInput = {
  to: string;
  candidate?: string | null;
  type: string;
  subject: string;
  html: string;
  replyTo?: string | null;
  bcc?: string | null;
  dedupKey?: string | null;
  sideEffect?: MailSideEffect | null;
};

export type CandidateMailResult =
  | { status: "sent"; gmail_id: string }
  | { status: "pending"; id: string }
  | { status: "bloqueado_staging"; id: string }
  | { status: "invalid_recipient"; id: string }
  | { status: "agotado"; id: string }
  | { status: "duplicado"; id: string };

/** What a candidate-facing response may say. No provider error, no address. */
export function candidateMailStatus(result: CandidateMailResult): { status: CandidateMailResult["status"] } {
  return { status: result.status };
}

export type PendingMailRow = {
  candidate: string | null;
  type: string | null;
  subject: string | null;
  html: string | null;
  reply_to: string | null;
  bcc: string | null;
  error: string;
  status?: string;
  dedupKey?: string | null;
  sideEffect?: MailSideEffect | null;
};

export type OpenDedupRow = {
  id: string;
  status: string;
  gmail_id: string | null;
  side_effect_applied_at: string | null;
};

export type ClaimedMail = PendingMailRow & { id: string; sideEffect?: MailSideEffect | null };

type SendOutcome =
  | { ok: true; gmail_id: string }
  | { ok: false; error: string; blocked?: "bloqueado_staging" | "invalid_recipient"; blockedId?: string };

export type MailDeps = {
  send: (input: CandidateMailInput) => Promise<SendOutcome>;
  savePending: (row: PendingMailRow) => Promise<{ id: string }>;
  recordSend: (type: string) => Promise<number>;
  findOpen?: (dedupKey: string) => Promise<OpenDedupRow | null>;
  /** Insert status=sending before Gmail. duplicate means the key is already taken. */
  reserve?: (input: CandidateMailInput) => Promise<{ id: string; duplicate: boolean }>;
  markSent?: (id: string, gmailId: string) => Promise<void>;
  markPending?: (id: string, error: string) => Promise<void>;
  markBlocked?: (id: string, status: "bloqueado_staging" | "invalid_recipient") => Promise<void>;
  applySideEffect?: (effect: MailSideEffect) => Promise<boolean>;
  markSideEffectApplied?: (id: string) => Promise<void>;
  log?: (line: string) => void;
};

function asError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function finishSent(
  input: CandidateMailInput,
  deps: MailDeps,
  gmailId: string,
  rowId?: string,
): Promise<CandidateMailResult> {
  if (rowId && deps.markSent) await deps.markSent(rowId, gmailId);
  if (input.sideEffect && deps.applySideEffect) {
    const applied = await deps.applySideEffect(input.sideEffect);
    if (applied && rowId && deps.markSideEffectApplied) await deps.markSideEffectApplied(rowId);
  }
  let today = 0;
  try {
    today = await deps.recordSend(input.type);
  } catch (e) {
    deps.log?.(`[ats-mail] counter failed type=${input.type} ${asError(e)}`);
  }
  deps.log?.(`[ats-mail] sent type=${input.type} sends_today=${today}`);
  return { status: "sent", gmail_id: gmailId };
}

export async function deliverCandidateMail(
  input: CandidateMailInput,
  deps: MailDeps,
): Promise<CandidateMailResult> {
  const dedupKey = attemptDedupKey(input.dedupKey);
  const mail = dedupKey === input.dedupKey ? input : { ...input, dedupKey };
  let reservedId: string | undefined;
  if (dedupKey && deps.reserve) {
    const reserved = await deps.reserve(mail);
    if (reserved.duplicate) return { status: "duplicado", id: reserved.id };
    reservedId = reserved.id;
  } else if (dedupKey && deps.findOpen) {
    const open = await deps.findOpen(dedupKey);
    if (open && (open.status === "pending" || open.status === "sending" || open.status === "sent" || open.status === "agotado")) {
      return { status: "duplicado", id: open.id };
    }
  }

  let sent: SendOutcome;
  try {
    sent = await deps.send(mail);
  } catch (e) {
    sent = { ok: false, error: asError(e) };
  }

  if (sent.ok) {
    return finishSent(mail, deps, sent.gmail_id, reservedId);
  }

  if (sent.blocked === "bloqueado_staging" || sent.blocked === "invalid_recipient") {
    if (reservedId && deps.markBlocked) await deps.markBlocked(reservedId, sent.blocked);
    if (sent.blockedId) return { status: sent.blocked, id: sent.blockedId };
    if (reservedId) return { status: sent.blocked, id: reservedId };
    const saved = await deps.savePending({
      candidate: null,
      type: mail.type,
      subject: mail.type,
      html: null,
      reply_to: null,
      bcc: null,
      error: sent.blocked,
      status: sent.blocked,
      dedupKey,
      sideEffect: null,
    });
    return { status: sent.blocked, id: saved.id };
  }

  if (reservedId && deps.markPending) {
    await deps.markPending(reservedId, sent.error);
    deps.log?.(`[ats-mail] pending type=${mail.type}`);
    return { status: "pending", id: reservedId };
  }

  const saved = await deps.savePending({
    candidate: mail.candidate ?? mail.to,
    type: mail.type,
    subject: mail.subject,
    html: mail.html,
    reply_to: mail.replyTo ?? null,
    bcc: mail.bcc ?? null,
    error: sent.error,
    dedupKey,
    sideEffect: mail.sideEffect,
  });
  deps.log?.(`[ats-mail] pending type=${mail.type}`);
  return { status: "pending", id: saved.id };
}

export type PendingReplayDeps = {
  claimPending: () => Promise<ClaimedMail[]>;
  send: (row: ClaimedMail) => Promise<SendOutcome>;
  markSent: (id: string, gmailId: string) => Promise<void>;
  markPending: (id: string, error: string) => Promise<void>;
  markBlocked: (id: string, status: "bloqueado_staging" | "invalid_recipient") => Promise<void>;
  applySideEffect?: (effect: MailSideEffect) => Promise<boolean>;
  markSideEffectApplied?: (id: string) => Promise<void>;
  recordSend: (type: string) => Promise<number>;
  log?: (line: string) => void;
};

/**
 * Sends each claimed row once. claimPending must move rows pending → sending
 * so a second click, or a second worker, receives an empty list.
 * Rows that were not attempted are put back to pending.
 */
export async function resendPendingOnce(deps: PendingReplayDeps): Promise<{ sent: number; pending: number }> {
  const claimed = await deps.claimPending();
  const attempted = new Set<string>();
  let sent = 0;
  let pending = 0;
  try {
    for (const row of claimed) {
      attempted.add(row.id);
      const to = (row.candidate || "").trim();
      if (!to || !row.subject || !row.html) {
        await deps.markPending(row.id, "correo pendiente incompleto");
        pending++;
        continue;
      }
      let result: SendOutcome;
      try {
        result = await deps.send(row);
      } catch (e) {
        result = { ok: false, error: asError(e) };
      }
      if (result.ok) {
        await deps.markSent(row.id, result.gmail_id);
        if (row.sideEffect && deps.applySideEffect) {
          const applied = await deps.applySideEffect(row.sideEffect);
          if (applied && deps.markSideEffectApplied) await deps.markSideEffectApplied(row.id);
        }
        try {
          const today = await deps.recordSend(row.type || "pending");
          deps.log?.(`[ats-mail] sent type=${row.type || "pending"} sends_today=${today}`);
        } catch (e) {
          deps.log?.(`[ats-mail] counter failed type=${row.type || "pending"} ${asError(e)}`);
        }
        sent++;
      } else if (result.blocked === "bloqueado_staging" || result.blocked === "invalid_recipient") {
        await deps.markBlocked(row.id, result.blocked);
      } else {
        await deps.markPending(row.id, result.error);
        pending++;
      }
    }
  } finally {
    for (const row of claimed) {
      if (attempted.has(row.id)) continue;
      await deps.markPending(row.id, "reintento no iniciado");
      pending++;
    }
  }
  return { sent, pending };
}
