-- Outbound mail queue. Created here, not at app boot.
-- Status: pending → sending → sent, or back to pending, or bloqueado_staging / agotado.
-- A data-deletion DELETE is allowed. It keeps a minimal audit row (id, type,
-- timestamps, recipient domain) and does not keep the address or the HTML.
-- HTML and token links are cleared 30 days after sent_at.

CREATE TABLE IF NOT EXISTS ats_outbound_mail (
  id UUID PRIMARY KEY,
  candidate TEXT,
  recipient_domain TEXT,
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
  sent_at TIMESTAMPTZ,
  dedup_key TEXT,
  side_effect JSONB,
  side_effect_applied_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ
);

ALTER TABLE ats_outbound_mail ADD COLUMN IF NOT EXISTS recipient_domain TEXT;
ALTER TABLE ats_outbound_mail ADD COLUMN IF NOT EXISTS dedup_key TEXT;
ALTER TABLE ats_outbound_mail ADD COLUMN IF NOT EXISTS side_effect JSONB;
ALTER TABLE ats_outbound_mail ADD COLUMN IF NOT EXISTS side_effect_applied_at TIMESTAMPTZ;
ALTER TABLE ats_outbound_mail ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ats_outbound_mail ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS ats_outbound_mail_dedup_open
  ON ats_outbound_mail (dedup_key)
  WHERE dedup_key IS NOT NULL AND status IN ('pending', 'sending');

CREATE TABLE IF NOT EXISTS ats_mail_send_log (
  id BIGSERIAL PRIMARY KEY,
  mail_type TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ats_outbound_mail_audit (
  id UUID PRIMARY KEY,
  mail_type TEXT,
  recipient_domain TEXT,
  created_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The queue itself can be deleted (service role / table owner). The audit cannot.
DROP TRIGGER IF EXISTS ats_outbound_mail_no_delete ON ats_outbound_mail;
DROP TRIGGER IF EXISTS ats_mail_send_log_no_delete ON ats_mail_send_log;

CREATE OR REPLACE FUNCTION ats_mail_audit_forbid_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ats_outbound_mail_audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS ats_outbound_mail_audit_no_delete ON ats_outbound_mail_audit;
CREATE TRIGGER ats_outbound_mail_audit_no_delete
BEFORE DELETE ON ats_outbound_mail_audit
FOR EACH ROW EXECUTE FUNCTION ats_mail_audit_forbid_delete();

CREATE OR REPLACE FUNCTION ats_outbound_mail_before_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO ats_outbound_mail_audit (id, mail_type, recipient_domain, created_at, sent_at)
  VALUES (OLD.id, OLD.type, OLD.recipient_domain, OLD.created_at, OLD.sent_at)
  ON CONFLICT (id) DO NOTHING;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS ats_outbound_mail_audit_delete ON ats_outbound_mail;
CREATE TRIGGER ats_outbound_mail_audit_delete
BEFORE DELETE ON ats_outbound_mail
FOR EACH ROW EXECUTE FUNCTION ats_outbound_mail_before_delete();

CREATE OR REPLACE FUNCTION ats_outbound_mail_release_stale_sends()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE ats_outbound_mail
  SET status = CASE WHEN attempt_count >= 5 THEN 'agotado' ELSE 'pending' END,
      claimed_at = NULL
  WHERE status = 'sending'
    AND claimed_at IS NOT NULL
    AND claimed_at < NOW() - INTERVAL '15 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION ats_outbound_mail_purge_bodies()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE ats_outbound_mail
  SET html = NULL,
      subject = regexp_replace(COALESCE(subject, ''), 'https?://\S+', '[link]', 'g')
  WHERE status = 'sent'
    AND sent_at IS NOT NULL
    AND sent_at < NOW() - INTERVAL '30 days'
    AND html IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

ALTER TABLE ats_outbound_mail ENABLE ROW LEVEL SECURITY;
ALTER TABLE ats_mail_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ats_outbound_mail_audit ENABLE ROW LEVEL SECURITY;

-- No policies for anon or authenticated. The table owner and BYPASSRLS
-- (service role) still read and write. careers_app gets an explicit policy
-- because Cloud SQL does not connect as the owner.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE ats_outbound_mail FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE ats_mail_send_log FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE ats_outbound_mail_audit FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE ats_outbound_mail FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE ats_mail_send_log FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE ats_outbound_mail_audit FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'careers_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ats_outbound_mail TO careers_app';
    EXECUTE 'GRANT SELECT, INSERT ON ats_mail_send_log TO careers_app';
    EXECUTE 'GRANT SELECT, INSERT ON ats_outbound_mail_audit TO careers_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE ats_mail_send_log_id_seq TO careers_app';
  END IF;
END $$;

DROP POLICY IF EXISTS ats_outbound_mail_app ON ats_outbound_mail;
DROP POLICY IF EXISTS ats_mail_send_log_app ON ats_mail_send_log;
DROP POLICY IF EXISTS ats_outbound_mail_audit_app ON ats_outbound_mail_audit;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'careers_app') THEN
    EXECUTE 'CREATE POLICY ats_outbound_mail_app ON ats_outbound_mail FOR ALL TO careers_app USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY ats_mail_send_log_app ON ats_mail_send_log FOR ALL TO careers_app USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY ats_outbound_mail_audit_app ON ats_outbound_mail_audit FOR ALL TO careers_app USING (true) WITH CHECK (true)';
  END IF;
END $$;
