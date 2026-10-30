-- NOT APPLIED. Additive only: new nullable columns, no data rewrite.
-- The scoring lock lives here, not in ai_recommendation.
alter table ht_ai_interviews
  add column if not exists scoring_claimed_at timestamptz;

alter table ht_ai_interviews
  add column if not exists scoring_attempts integer;
