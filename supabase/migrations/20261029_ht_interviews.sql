-- ─────────────────────────────────────────────────────────────────
-- ht_interviews · invitación Wellness → Hiring Manager
--
-- SOLO ARCHIVO. No aplicar esta migración.
-- El preview de Vercel usa la base de producción. No correr este SQL
-- contra Neon, Supabase, ni ninguna otra base real.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ht_interviews (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id       UUID NOT NULL REFERENCES ht_candidates(id) ON DELETE CASCADE,
  vacancy_id         UUID REFERENCES ht_vacancies(id) ON DELETE SET NULL,
  round              TEXT NOT NULL CHECK (round IN ('wellness', 'hm')),
  scheduled_at       TIMESTAMPTZ NOT NULL,
  duration_min       INTEGER NOT NULL DEFAULT 45,
  tz                 TEXT NOT NULL DEFAULT 'America/Bogota',
  interviewer_emails TEXT[] NOT NULL DEFAULT '{}',
  calendar_event_id  TEXT,
  meet_url           TEXT,
  status             TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'done')),
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ht_interviews_candidate
  ON ht_interviews (candidate_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ht_interviews_round
  ON ht_interviews (candidate_id, round)
  WHERE deleted_at IS NULL;
