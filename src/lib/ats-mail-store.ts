/**
 * Pending mailbox queue and the per-day send log.
 * Rows are never deleted. Status moves pending → sending → sent, or back to
 * pending when the send did not happen.
 */
import { randomUUID } from "crypto";
import { neon } from "@/lib/sql";
import { sendViaGmail } from "@/lib/gmail";
import {
  deliverCandidateMail,
  resendPendingOnce,
  type CandidateMailInput,
  type CandidateMailResult,
  type ClaimedMail,
} from "@/lib/ats-mail";

function sql() {
  return neon(process.env.DATABASE_URL!);
}

let ready: Promise<void> | null = null;

export function ensureOutboundMail(): Promise<void> {
  if (!ready) {
    ready = createTables().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

async function createTables() {
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS ats_outbound_mail (
      id UUID PRIMARY KEY,
      candidate TEXT,
      type TEXT,
      subject TEXT,
      html TEXT,
      reply_to TEXT,
      bcc TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      gmail_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      claimed_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS ats_mail_send_log (
      id BIGSERIAL PRIMARY KEY,
      mail_type TEXT,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`
    CREATE OR REPLACE FUNCTION ats_mail_forbid_delete()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'ats mail tables are append-only';
    END;
    $$
  `;
  await db`DROP TRIGGER IF EXISTS ats_outbound_mail_no_delete ON ats_outbound_mail`;
  await db`
    CREATE TRIGGER ats_outbound_mail_no_delete
    BEFORE DELETE ON ats_outbound_mail
    FOR EACH ROW EXECUTE FUNCTION ats_mail_forbid_delete()
  `;
  await db`DROP TRIGGER IF EXISTS ats_mail_send_log_no_delete ON ats_mail_send_log`;
  await db`
    CREATE TRIGGER ats_mail_send_log_no_delete
    BEFORE DELETE ON ats_mail_send_log
    FOR EACH ROW EXECUTE FUNCTION ats_mail_forbid_delete()
  `;
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
}): Promise<{ id: string }> {
  await ensureOutboundMail();
  const id = randomUUID();
  const status = row.status === "bloqueado_staging" ? "bloqueado_staging" : "pending";
  const db = sql();
  await db`
    INSERT INTO ats_outbound_mail (id, candidate, type, subject, html, reply_to, bcc, status, error)
    VALUES (
      ${id},
      ${row.candidate},
      ${row.type},
      ${row.subject},
      ${row.html},
      ${row.reply_to},
      ${row.bcc},
      ${status},
      ${row.error}
    )
  `;
  return { id };
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
};

export async function listPending(): Promise<PendingListItem[]> {
  await ensureOutboundMail();
  const rows = await sql()`
    SELECT id, candidate, type, subject, created_at, error
    FROM ats_outbound_mail
    WHERE status = 'pending'
    ORDER BY created_at ASC
  `;
  return rows.map((row) => ({
    id: String(row.id),
    candidate: (row.candidate as string | null) ?? null,
    type: (row.type as string | null) ?? null,
    subject: (row.subject as string | null) ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    error: (row.error as string | null) ?? null,
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
        ORDER BY created_at ASC
        LIMIT ${CLAIM_BATCH}
        FOR UPDATE SKIP LOCKED
      )
    RETURNING m.id, m.candidate, m.type, m.subject, m.html, m.reply_to, m.bcc, m.error
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
  }));
}

async function markSent(id: string, gmailId: string) {
  await sql()`
    UPDATE ats_outbound_mail
    SET status = 'sent', sent_at = NOW(), gmail_id = ${gmailId}, error = NULL
    WHERE id = ${id}::uuid AND status = 'sending'
  `;
}

async function markPending(id: string, error: string) {
  await sql()`
    UPDATE ats_outbound_mail
    SET status = 'pending', error = ${error}, claimed_at = NULL
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
    recordSend: recordSuccessfulSend,
    log: (line) => console.info(line),
  });
}
