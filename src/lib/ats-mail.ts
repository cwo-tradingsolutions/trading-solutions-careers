/**
 * One outbound path for candidate mail: Gmail from jointheteam@, or a
 * pending row when that mailbox cannot send. No second provider.
 *
 * The daily counter is a log line plus a count of successful sends today.
 * There is no hard cap. The HR banner warns above 1500.
 */

export const DAILY_SEND_WARN_AFTER = 1500;

export const MAILBOX_DISCONNECTED_BANNER =
  "Buzón jointheteam@ desconectado — ";

export function mailboxDisconnectedBanner(pendingCount: number): string {
  const n = Number.isFinite(pendingCount) && pendingCount > 0 ? Math.floor(pendingCount) : 0;
  return `Buzón jointheteam@ desconectado — ${n} correos pendientes. Reconectar`;
}

export function dailySendWarning(sendsToday: number): boolean {
  return sendsToday > DAILY_SEND_WARN_AFTER;
}

export type CandidateMailInput = {
  to: string;
  candidate?: string | null;
  type: string;
  subject: string;
  html: string;
  replyTo?: string | null;
  bcc?: string | null;
};

export type CandidateMailResult =
  | { status: "sent"; gmail_id: string }
  | { status: "pending"; id: string }
  | { status: "bloqueado_staging"; id: string };

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
};

export type ClaimedMail = PendingMailRow & { id: string };

type SendOutcome =
  | { ok: true; gmail_id: string }
  | { ok: false; error: string; blocked?: "bloqueado_staging"; blockedId?: string };

export type MailDeps = {
  send: (input: CandidateMailInput) => Promise<SendOutcome>;
  savePending: (row: PendingMailRow) => Promise<{ id: string }>;
  recordSend: (type: string) => Promise<number>;
  log?: (line: string) => void;
};

function asError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function deliverCandidateMail(
  input: CandidateMailInput,
  deps: MailDeps,
): Promise<CandidateMailResult> {
  let sent: SendOutcome;
  try {
    sent = await deps.send(input);
  } catch (e) {
    sent = { ok: false, error: asError(e) };
  }

  if (sent.ok) {
    let today = 0;
    try {
      today = await deps.recordSend(input.type);
    } catch (e) {
      deps.log?.(`[ats-mail] counter failed type=${input.type} ${asError(e)}`);
    }
    deps.log?.(`[ats-mail] sent type=${input.type} sends_today=${today}`);
    return { status: "sent", gmail_id: sent.gmail_id };
  }

  if (sent.blocked === "bloqueado_staging") {
    if (sent.blockedId) return { status: "bloqueado_staging", id: sent.blockedId };
    const saved = await deps.savePending({
      candidate: input.candidate ?? input.to,
      type: input.type,
      subject: input.subject,
      html: input.html,
      reply_to: input.replyTo ?? null,
      bcc: input.bcc ?? null,
      error: "bloqueado_staging",
      status: "bloqueado_staging",
    });
    return { status: "bloqueado_staging", id: saved.id };
  }

  const saved = await deps.savePending({
    candidate: input.candidate ?? input.to,
    type: input.type,
    subject: input.subject,
    html: input.html,
    reply_to: input.replyTo ?? null,
    bcc: input.bcc ?? null,
    error: sent.error,
  });
  deps.log?.(`[ats-mail] pending type=${input.type}`);
  return { status: "pending", id: saved.id };
}

export type PendingReplayDeps = {
  claimPending: () => Promise<ClaimedMail[]>;
  send: (row: ClaimedMail) => Promise<SendOutcome>;
  markSent: (id: string, gmailId: string) => Promise<void>;
  markPending: (id: string, error: string) => Promise<void>;
  markBlocked: (id: string, reason: string) => Promise<void>;
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
        try {
          const today = await deps.recordSend(row.type || "pending");
          deps.log?.(`[ats-mail] sent type=${row.type || "pending"} sends_today=${today}`);
        } catch (e) {
          deps.log?.(`[ats-mail] counter failed type=${row.type || "pending"} ${asError(e)}`);
        }
        sent++;
      } else if (result.blocked === "bloqueado_staging") {
        await deps.markBlocked(row.id, "bloqueado_staging");
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
