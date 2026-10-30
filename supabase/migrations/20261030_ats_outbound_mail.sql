-- Outbound mail queue. Nullable payload, append-only: the triggers reject DELETE.
-- Status moves pending → sending → sent (or back to pending). Rows stay.
-- ats_mail_send_log is the light per-day counter (one row per successful Gmail send).

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
);

CREATE TABLE IF NOT EXISTS ats_mail_send_log (
  id BIGSERIAL PRIMARY KEY,
  mail_type TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION ats_mail_forbid_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ats mail tables are append-only';
END;
$$;

DROP TRIGGER IF EXISTS ats_outbound_mail_no_delete ON ats_outbound_mail;
CREATE TRIGGER ats_outbound_mail_no_delete
BEFORE DELETE ON ats_outbound_mail
FOR EACH ROW EXECUTE FUNCTION ats_mail_forbid_delete();

DROP TRIGGER IF EXISTS ats_mail_send_log_no_delete ON ats_mail_send_log;
CREATE TRIGGER ats_mail_send_log_no_delete
BEFORE DELETE ON ats_mail_send_log
FOR EACH ROW EXECUTE FUNCTION ats_mail_forbid_delete();
