-- Esquema mínimo para probar la Fase 0. Solo en una base llamada fase0_*.
-- No es una migración de producción: recrea las FK que el repo declara
-- (14 CASCADE) más ht_responses, ht_results y ht_ai_interviews (las usa el
-- código y no tienen CREATE en el repo) y las dos SET NULL.

do $$
begin
  if current_database() !~ '^fase0_' then
    raise exception 'fixture rechazada: la base % no es desechable (tiene que llamarse fase0_*)', current_database();
  end if;
end $$;

create extension if not exists pgcrypto;

create table ht_vacancies (
  id uuid primary key default gen_random_uuid(),
  title text
);

create table ht_candidates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  vacancy_id uuid references ht_vacancies(id) on delete set null,
  name text,
  email text,
  phone text,
  stage text,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ht_responses (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade
);
create table ht_results (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade
);
create table ht_ai_interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade
);
create table ht_candidate_stage_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade,
  to_stage text
);
create table ht_candidate_tests (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade,
  test_id text
);
create table ht_candidate_files (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade,
  storage_path text
);
create table ht_candidate_evaluations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade
);
create table ht_contact_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade
);
create table ts_test_providers (
  id uuid primary key default gen_random_uuid(),
  key text
);
create table ht_external_test_results (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade,
  provider_id uuid not null references ts_test_providers(id)
);
create table ts_candidate_experience (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade
);
create table ts_interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade
);
create table ts_cv_bank_matches (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references ht_vacancies(id) on delete cascade,
  candidate_id uuid not null references ht_candidates(id) on delete cascade,
  unique (vacancy_id, candidate_id)
);
create table ts_interview_decisions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade
);
create table ts_recruiter_assessments (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade
);
create table ts_joint_schedulings (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references ht_candidates(id) on delete cascade
);
create table ts_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references ht_candidates(id) on delete cascade
);
create table ts_candidate_reminders_paused (
  candidate_id uuid primary key references ht_candidates(id) on delete cascade,
  paused_until timestamptz,
  reason text,
  paused_by text
);
create table ts_people (
  id uuid primary key default gen_random_uuid(),
  linked_candidate_id uuid references ht_candidates(id) on delete set null
);
create table ts_referrals (
  id uuid primary key default gen_random_uuid(),
  linked_candidate_id uuid references ht_candidates(id) on delete set null
);
create table ts_bat_sessions (
  id uuid primary key default gen_random_uuid(),
  ht_candidate_id uuid
);
