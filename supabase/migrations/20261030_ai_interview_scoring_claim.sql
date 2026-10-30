-- NOT APPLIED. Deploy order: apply this migration before the app that
-- reads scoring_claimed_at and scoring_attempts. Additive only: new nullable
-- columns and one index. No data rewrite.
--
-- ht_ai_interviews.status is CHECK (invited, in_progress, completed, expired,
-- failed). needs_review is not a legal status, so exhausted rows use failed.
-- ai_recommendation is CHECK (AVANZA, EN ESPERA, NO AVANZA, PENDIENTE).

alter table ht_ai_interviews
  add column if not exists scoring_claimed_at timestamptz;

alter table ht_ai_interviews
  add column if not exists scoring_attempts integer;

create index if not exists ht_ai_interviews_scoring_queue
  on ht_ai_interviews (scoring_claimed_at, started_at);

-- Conditional writes go through these functions. A PATCH that combines
-- or() with Prefer: return=representation raises 42703 on PostgREST
-- v14.3 and earlier, and on those versions the returned rows are also
-- filtered by the same or() after the update, so select() comes back empty
-- even when the write landed. v14.4+ does not do that. The functions
-- return the id only when this call changed the row.

create or replace function claim_ht_ai_interview_scoring(
  p_id uuid,
  p_claimed_at timestamptz,
  p_next_attempts integer,
  p_cutoff timestamptz
) returns uuid
language sql
as $$
  update ht_ai_interviews
     set scoring_claimed_at = p_claimed_at,
         scoring_attempts = p_next_attempts
   where id = p_id
     and ai_score is null
     and (scoring_claimed_at is null or scoring_claimed_at < p_cutoff)
     and (
       (p_next_attempts = 1 and scoring_attempts is null)
       or scoring_attempts = p_next_attempts - 1
     )
  returning id;
$$;

create or replace function complete_ht_ai_interview_score(
  p_id uuid,
  p_row jsonb
) returns uuid
language plpgsql
as $$
declare
  updated uuid;
  claim_at timestamptz;
begin
  claim_at := nullif(p_row->>'scoring_claimed_at', '')::timestamptz;
  update ht_ai_interviews set
    status = 'completed',
    completed_at = coalesce((p_row->>'completed_at')::timestamptz, now()),
    conversation_id = p_row->>'conversation_id',
    transcript = p_row->'transcript',
    audio_url = p_row->>'audio_url',
    ai_score = (p_row->>'ai_score')::numeric,
    overall_score = (p_row->>'overall_score')::numeric,
    ai_recommendation = p_row->>'ai_recommendation',
    ai_summary = p_row->>'ai_summary',
    ai_strengths = coalesce(p_row->'ai_strengths', '[]'::jsonb),
    ai_gaps = coalesce(p_row->'ai_gaps', '[]'::jsonb),
    ai_red_flags = coalesce(p_row->'ai_red_flags', '[]'::jsonb),
    competencies_scores = p_row->'competencies_scores',
    competency_score = (p_row->>'competency_score')::numeric,
    english_level = p_row->>'english_level',
    english_score = (p_row->>'english_score')::numeric,
    english_detail = p_row->'english_detail',
    scoring_claimed_at = null
  where id = p_id
    and (status is distinct from 'completed' or ai_score is null)
    and (
      scoring_claimed_at is null
      or (claim_at is not null and scoring_claimed_at = claim_at)
    )
  returning id into updated;
  return updated;
end;
$$;
