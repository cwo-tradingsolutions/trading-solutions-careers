/**
 * Pending mailbox queue and the per-day send log.
 * Rows are never deleted. Status moves pending → sending → sent, or back to
 * pending when the send did not happen.
 */
import { randomUUID } from "crypto";
import { neon } from "@/lib/sql";
import { sendViaGmail } from "@/lib/gmail";
import { recipientDomain } from "@/lib/mail-recipient-guard";
import { applyMailSideEffect } from "@/lib/ats-mail-effects";
import {
  deliverCandidateMail,
  nextAttemptDelayMs,
  MAX_SEND_ATTEMPTS,
  resendPendingOnce,
  type CandidateMailInput,
  type CandidateMailResult,
  type ClaimedMail,
  type MailSideEffect,
  type OpenDedupRow,
} from "@/lib/ats-mail";

function sql() {
  return neon(process.env.DATABASE_URL!);
}

let checked = false;

/** Logs once when the migration has not been applied. Does not create tables. */
export async function ensureOutboundMail(): Promise<boolean> {
  const rows = await sql()`
    SELECT to_regclass('public.ats_outbound_mail') AS mail, to_regclass('public.ats_mail_send_log') AS sends
  `;
  const ok = Boolean(rows[0]?.mail && rows[0]?.sends);
  if (!ok && !checked) {
    console.error("[ats-mail] faltan ats_outbound_mail o ats_mail_send_log. Aplica supabase/migrations/20261030_ats_outbound_mail.sql");
  }
  checked = true;
  return ok;
}

export async function maintainOutboundMail(): Promise<void> {
  if (!(await ensureOutboundMail())) return;
  try {
    await sql()`SELECT ats_outbound_mail_release_stale_sends()`;
    await sql()`SELECT ats_outbound_mail_purge_bodies()`;
  } catch (e) {
    console.error("[ats-mail] no se pudo mantener la cola", e instanceof Error ? e.message : e);
  }
}

export async function insertPending(row: {
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
}): Promise<{ id: string }> {
  await ensureOutboundMail();
  const existing = row.dedupKey ? await findOpenDedup(row.dedupKey) : null;
  if (existing) return { id: existing.id };
  const id = randomUUID();
  const status = row.status === "bloqueado_staging" ? "bloqueado_staging" : "pending";
  const domain = row.candidate ? recipientDomain(row.candidate) : null;
  const db = sql();
  const inserted = await db`
    INSERT INTO ats_outbound_mail (
      id, candidate, recipient_domain, type, subject, html, reply_to, bcc, status, error, dedup_key, side_effect
    )
    VALUES (
      ${id},
      ${row.candidate},
      ${domain},
      ${row.type},
      ${row.subject},
      ${row.html},
      ${row.reply_to},
      ${row.bcc},
      ${status},
      ${row.error},
      ${row.dedupKey ?? null},
      ${row.sideEffect ? JSON.stringify(row.sideEffect) : null}::jsonb
    )
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL AND status IN ('pending', 'sending')
    DO NOTHING
    RETURNING id
  `;
  if (inserted.length > 0) return { id: String(inserted[0].id) };
  const again = row.dedupKey ? await findOpenDedup(row.dedupKey) : null;
  return { id: again?.id || id };
}

export async function findOpenDedup(dedupKey: string): Promise<OpenDedupRow | null> {
  await ensureOutboundMail();
  const rows = await sql()`
    SELECT id, status, gmail_id, side_effect_applied_at
    FROM ats_outbound_mail
    WHERE dedup_key = ${dedupKey}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: String(row.id),
    status: String(row.status),
    gmail_id: (row.gmail_id as string | null) ?? null,
    side_effect_applied_at: row.side_effect_applied_at
      ? (row.side_effect_applied_at instanceof Date ? row.side_effect_applied_at.toISOString() : String(row.side_effect_applied_at))
      : null,
  };
}

export async function markSideEffectApplied(id: string) {
  await sql()`
    UPDATE ats_outbound_mail SET side_effect_applied_at = NOW() WHERE id = ${id}::uuid
  `;
}

export async function countRecentQueued(type: string, minutes: number): Promise<number> {
  if (!(await ensureOutboundMail())) return 0;
  const rows = await sql()`
    SELECT COUNT(*)::int AS n
    FROM ats_outbound_mail
    WHERE type = ${type}
      AND created_at >= NOW() - (${minutes} * INTERVAL '1 minute')
  `;
  return Number(rows[0]?.n ?? 0);
}

/** A send the staging guard refused. Not claimed by "Reenviar pendientes". */
export async function recordBlockedSend(row: {
  candidate: string | null;
  type: string | null;
  subject: string | null;
  html: string | null;
  reply_to: string | null;
  bcc: string | null;
  reason: string;
}): Promise<{ id: string }> {
  return insertPending({
    candidate: row.candidate,
    type: row.type,
    subject: row.subject,
    html: row.html,
    reply_to: row.reply_to,
    bcc: row.bcc,
    error: row.reason,
    status: "bloqueado_staging",
  });
}

export async function recordSuccessfulSend(type: string): Promise<number> {
  await ensureOutboundMail();
  const db = sql();
  await db`INSERT INTO ats_mail_send_log (mail_type) VALUES (${type})`;
  const rows = await db`
    SELECT COUNT(*)::int AS n
    FROM ats_mail_send_log
    WHERE sent_at >= (date_trunc('day', NOW() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota')
  `;
  return Number(rows[0]?.n ?? 0);
}

export async function countSendsToday(): Promise<number> {
  await ensureOutboundMail();
  const rows = await sql()`
    SELECT COUNT(*)::int AS n
    FROM ats_mail_send_log
    WHERE sent_at >= (date_trunc('day', NOW() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota')
  `;
  return Number(rows[0]?.n ?? 0);
}

export type PendingListItem = {
  id: string;
  candidate: string | null;
  type: string | null;
  subject: string | null;
  created_at: string;
  error: string | null;
  status: string;
};

export async function listPending(): Promise<PendingListItem[]> {
  await maintainOutboundMail();
  const rows = await sql()`
    SELECT id, candidate, type, subject, created_at, error, status
    FROM ats_outbound_mail
    WHERE status IN ('pending', 'sending', 'agotado')
    ORDER BY created_at ASC
  `;
  return rows.map((row) => ({
    id: String(row.id),
    candidate: (row.candidate as string | null) ?? null,
    type: (row.type as string | null) ?? null,
    subject: (row.subject as string | null) ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    error: (row.error as string | null) ?? null,
    status: String(row.status),
  }));
}

const CLAIM_BATCH = 25;

async function claimPending(): Promise<ClaimedMail[]> {
  await ensureOutboundMail();
  const rows = await sql()`
    UPDATE ats_outbound_mail AS m
    SET status = 'sending', claimed_at = NOW()
    WHERE m.status = 'pending'
      AND m.id IN (
        SELECT id FROM ats_outbound_mail
        WHERE status = 'pending'
          AND attempt_count < ${MAX_SEND_ATTEMPTS}
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        ORDER BY created_at ASC
        LIMIT ${CLAIM_BATCH}
        FOR UPDATE SKIP LOCKED
      )
    RETURNING m.id, m.candidate, m.type, m.subject, m.html, m.reply_to, m.bcc, m.error, m.side_effect
  `;
  return rows.map((row) => ({
    id: String(row.id),
    candidate: (row.candidate as string | null) ?? null,
    type: (row.type as string | null) ?? null,
    subject: (row.subject as string | null) ?? null,
    html: (row.html as string | null) ?? null,
    reply_to: (row.reply_to as string | null) ?? null,
    bcc: (row.bcc as string | null) ?? null,
    error: String(row.error ?? ""),
    sideEffect: parseSideEffect(row.side_effect),
  }));
}

function parseSideEffect(value: unknown): MailSideEffect | null {
  if (!value || typeof value !== "object") return null;
  const kind = (value as { kind?: string }).kind;
  if (kind === "battery" || kind === "rejection_sent" || kind === "survey_sent") return value as MailSideEffect;
  return null;
}

async function markSent(id: string, gmailId: string) {
  await sql()`
    UPDATE ats_outbound_mail
    SET status = 'sent', sent_at = NOW(), gmail_id = ${gmailId}, error = NULL
    WHERE id = ${id}::uuid AND status = 'sending'
  `;
}

async function markPending(id: string, error: string) {
  const rows = await sql()`
    SELECT attempt_count FROM ats_outbound_mail WHERE id = ${id}::uuid AND status = 'sending'
  `;
  const next = Number(rows[0]?.attempt_count ?? 0) + 1;
  const delay = new Date(Date.now() + nextAttemptDelayMs(next)).toISOString();
  const status = next >= MAX_SEND_ATTEMPTS ? "agotado" : "pending";
  await sql()`
    UPDATE ats_outbound_mail
    SET status = ${status},
        error = ${error},
        claimed_at = NULL,
        attempt_count = ${next},
        next_attempt_at = ${delay}::timestamptz
    WHERE id = ${id}::uuid AND status = 'sending'
  `;
}

async function markBlocked(id: string, reason: string) {
  await sql()`
    UPDATE ats_outbound_mail
    SET status = 'bloqueado_staging', error = ${reason}, claimed_at = NULL
    WHERE id = ${id}::uuid AND status = 'sending'
  `;
}

export async function queueCandidateMail(input: CandidateMailInput, error: string): Promise<{ id: string }> {
  return insertPending({
    candidate: input.candidate ?? input.to,
    type: input.type,
    subject: input.subject,
    html: input.html,
    reply_to: input.replyTo ?? null,
    bcc: input.bcc ?? null,
    error,
  });
}

export async function sendCandidateMail(input: CandidateMailInput): Promise<CandidateMailResult> {
  return deliverCandidateMail(input, {
    send: (mail) =>
      sendViaGmail({
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        replyTo: mail.replyTo || undefined,
        bcc: mail.bcc || undefined,
        mailType: mail.type,
      }),
    savePending: insertPending,
    recordSend: recordSuccessfulSend,
    findOpen: (key) => findOpenDedup(key),
    applySideEffect: applyMailSideEffect,
    markSideEffectApplied,
    log: (line) => console.info(line),
  });
}

export async function resendPendingMails(): Promise<{ sent: number; pending: number }> {
  return resendPendingOnce({
    claimPending,
    send: (row) =>
      sendViaGmail({
        to: row.candidate || "",
        subject: row.subject || "",
        html: row.html || "",
        replyTo: row.reply_to || undefined,
        bcc: row.bcc || undefined,
        mailType: row.type || undefined,
        persistBlocked: false,
      }),
    markSent,
    markPending,
    markBlocked,
    applySideEffect: applyMailSideEffect,
    markSideEffectApplied,
    recordSend: recordSuccessfulSend,
    log: (line) => console.info(line),
  });
}
