-- ============================================================
-- Fase 0 · borrado lógico + historial (PREVIEW — NO APLICAR EN PRODUCCIÓN)
--
-- Proyecto real: mojbhvphztnadndhnraf. No correr este archivo ahí hasta que
-- Kelly apruebe un respaldo verificado con conteos. Este cambio es solo el
-- SQL. La validación se hace contra un Postgres local desechable.
--
-- Qué hace, en una transacción:
--   1. Agrega deleted_at, deleted_by y delete_reason a ht_candidates y a
--      las tablas de candidato que existen.
--   2. Pasa a ON DELETE RESTRICT las FK hacia ht_candidates que hoy son
--      ON DELETE CASCADE o ON DELETE SET NULL. Un DELETE físico ya no puede
--      borrar el historial ni soltar el vínculo (ts_people, ts_referrals).
--   3. Impide el DELETE físico de ht_candidates aunque no tenga hijos.
--   4. Crea ht_audit_log (append-only) y un trigger genérico AFTER
--      INSERT/UPDATE/DELETE en las tablas clave.
--   5. Deja la vista ht_candidates_active (deleted_at IS NULL).
--
-- FK ON DELETE CASCADE confirmadas en el repo (14). La 2 puede no existir
-- en producción: la propuesta dice que ts_interviews nunca se creó. El
-- bloque de abajo no usa esa lista para reescribir: mira pg_constraint y
-- cambia cada FK real que apunte a ht_candidates. Así entran también
-- ht_responses, ht_results y ht_ai_interviews, que el código usa y borra,
-- pero cuyo CREATE TABLE no está en este repositorio.
--
--   1. ts_candidate_experience.candidate_id
--        supabase/migrations/20260502_candidate_experience.sql
--   2. ts_interviews.candidate_id
--        supabase/migrations/20260502_interviews.sql
--   3. ts_cv_bank_matches.candidate_id
--        supabase/migrations/20260504_cv_bank.sql
--   4. ts_interview_decisions.candidate_id
--        supabase/migrations/20260504_decision_nudges.sql
--   5. ts_reminders_sent.candidate_id
--        supabase/migrations/20260507_reminders.sql
--   6. ts_candidate_reminders_paused.candidate_id
--        supabase/migrations/20260507_reminders.sql
--   7. ts_recruiter_assessments.candidate_id
--        supabase/migrations/20260509_recruiter_assessments.sql
--   8. ts_joint_schedulings.candidate_id
--        supabase/migrations/20260511_joint_schedulings.sql
--   9. ht_candidate_stage_events.candidate_id
--        supabase/migrations/20260818_stage_events.sql
--  10. ht_candidate_tests.candidate_id
--        supabase/migrations/20260818_stage_events.sql
--  11. ht_candidate_files.candidate_id
--        sql/20260916_adjuntos_candidato.sql
--  12. ht_candidate_evaluations.candidate_id
--        sql/20260916b_evaluacion_candidato.sql
--  13. ht_contact_events.candidate_id
--        sql/20260921_historial_contactos.sql
--  14. ht_external_test_results.candidate_id
--        sql/20261009_pruebas_externas.sql
--
-- ON DELETE SET NULL (también pasan a RESTRICT; el rollback les devuelve
-- SET NULL). Si se dejaran, un DELETE físico borraría el vínculo:
--   - ts_people.linked_candidate_id          20260502_people_onboarding.sql
--   - ts_referrals.linked_candidate_id       20260504_referrals.sql
--
-- ts_bat_sessions.ht_candidate_id no tiene FK (sql/20260908_bateria_sig_sst.sql).
-- Igual recibe deleted_at: es dato del candidato.
--
-- El índice único de ts_cv_bank_matches pasa a ser parcial
-- (WHERE deleted_at IS NULL) para poder recomputar matches sin borrar el
-- historial del cruce anterior.
--
-- Reversa: supabase/rollbacks/20261029_fase0_soft_delete_rollback.sql
-- ============================================================

begin;

create schema if not exists private;
revoke all on schema private from public;

-- Bitácora de lo que esta migración creó, para que el rollback deshaga
-- exactamente eso y no columnas o índices que ya existían.
create table if not exists private.ht_fase0_audit_tables (
  table_name text primary key
);
create table if not exists private.ht_fase0_added_columns (
  table_name text not null,
  column_name text not null,
  primary key (table_name, column_name)
);
create table if not exists private.ht_fase0_added_indexes (
  index_name text primary key
);
create table if not exists private.ht_fk_rewrite_backup (
  conname name not null,
  child_schema text not null,
  child_table text not null,
  original_def text not null,
  primary key (child_schema, child_table, conname)
);
create table if not exists private.ht_fase0_dropped_constraints (
  child_schema text not null,
  child_table text not null,
  conname name not null,
  original_def text not null,
  primary key (child_schema, child_table, conname)
);

do $fase0$
begin
  if to_regclass('public.ht_candidates') is null then
    raise exception 'ht_candidates no existe. Esta migración no crea el esquema base del ATS.';
  end if;
end
$fase0$;

-- ── 1) Tablas objetivo ──────────────────────────────────────
-- Lista explícita ∪ cualquier tabla de public con FK a ht_candidates.
insert into private.ht_fase0_audit_tables (table_name)
select t
from (
  select unnest(array[
    'ht_candidates',
    'ht_responses',
    'ht_results',
    'ht_ai_interviews',
    'ht_candidate_stage_events',
    'ht_candidate_tests',
    'ht_candidate_files',
    'ht_candidate_evaluations',
    'ht_contact_events',
    'ht_external_test_results',
    'ts_candidate_experience',
    'ts_interviews',
    'ts_cv_bank_matches',
    'ts_interview_decisions',
    'ts_recruiter_assessments',
    'ts_joint_schedulings',
    'ts_reminders_sent',
    'ts_candidate_reminders_paused',
    'ts_bat_sessions',
    'ts_people',
    'ts_referrals'
  ]) as t
  union
  select child.relname
  from pg_constraint con
  join pg_class child on child.oid = con.conrelid
  join pg_namespace cn on cn.oid = child.relnamespace
  join pg_class parent on parent.oid = con.confrelid
  join pg_namespace pn on pn.oid = parent.relnamespace
  where con.contype = 'f'
    and cn.nspname = 'public'
    and pn.nspname = 'public'
    and parent.relname = 'ht_candidates'
) s
where to_regclass('public.' || t) is not null
on conflict do nothing;

-- ── 2) Columnas de borrado lógico ───────────────────────────
do $cols$
declare
  t text;
  col text;
begin
  for t in select table_name from private.ht_fase0_audit_tables loop
    foreach col in array array['deleted_at', 'deleted_by', 'delete_reason'] loop
      if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = t
          and column_name = col
      ) then
        if col = 'deleted_at' then
          execute format('alter table public.%I add column %I timestamptz', t, col);
        else
          execute format('alter table public.%I add column %I text', t, col);
        end if;
        insert into private.ht_fase0_added_columns (table_name, column_name)
        values (t, col);
      end if;
    end loop;

    execute format(
      'create index if not exists %I on public.%I (deleted_at) where deleted_at is not null',
      'fase0_' || t || '_deleted_idx',
      t
    );
    insert into private.ht_fase0_added_indexes (index_name)
    values ('fase0_' || t || '_deleted_idx')
    on conflict do nothing;
  end loop;
end
$cols$;

comment on column public.ht_candidates.deleted_at is
  'Borrado lógico. NULL = el candidato se ve. La app filtra IS NULL por defecto.';

-- ── 3) Historial append-only ────────────────────────────────
create table if not exists public.ht_audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     text,
  action     text not null check (action in ('insert', 'update', 'delete', 'soft_delete', 'restore')),
  old_data   jsonb,
  new_data   jsonb,
  actor      text,
  at         timestamptz not null default now()
);

create index if not exists fase0_ht_audit_log_row_idx
  on public.ht_audit_log (table_name, row_id, at desc);
create index if not exists fase0_ht_audit_log_at_idx
  on public.ht_audit_log (at desc);
insert into private.ht_fase0_added_indexes (index_name)
values ('fase0_ht_audit_log_row_idx'), ('fase0_ht_audit_log_at_idx')
on conflict do nothing;

comment on table public.ht_audit_log is
  'Historial append-only. Lo llena el trigger private.ht_audit_row. No se actualiza ni se borra.';

alter table public.ht_audit_log enable row level security;

create or replace function private.ht_actor()
returns text
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  claims text;
  email text;
begin
  email := nullif(btrim(current_setting('app.actor', true)), '');
  if email is not null then
    return email;
  end if;

  claims := nullif(btrim(current_setting('request.jwt.claims', true)), '');
  if claims is not null then
    begin
      email := nullif(claims::jsonb ->> 'email', '');
      if email is not null then
        return email;
      end if;
      email := nullif(claims::jsonb ->> 'sub', '');
      if email is not null then
        return email;
      end if;
    exception
      when invalid_text_representation or datatype_mismatch then
        null;
    end;
  end if;

  return current_user;
end;
$$;

create or replace function private.ht_audit_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_action text;
  v_row_id text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_action := 'insert';
    v_row_id := coalesce(v_new ->> 'id', v_new ->> 'candidate_id');
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row_id := coalesce(v_new ->> 'id', v_new ->> 'candidate_id', v_old ->> 'id', v_old ->> 'candidate_id');
    if (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then
      v_action := 'soft_delete';
    elsif (v_old ->> 'deleted_at') is not null and (v_new ->> 'deleted_at') is null then
      v_action := 'restore';
    else
      v_action := 'update';
    end if;
  else
    v_old := to_jsonb(old);
    v_action := 'delete';
    v_row_id := coalesce(v_old ->> 'id', v_old ->> 'candidate_id');
  end if;

  insert into public.ht_audit_log (table_name, row_id, action, old_data, new_data, actor)
  values (tg_table_name, v_row_id, v_action, v_old, v_new, private.ht_actor());

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.ht_audit_log_no_mutate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'ht_audit_log es append-only'
    using errcode = '42501';
end;
$$;

create or replace function private.ht_candidates_no_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'ht_candidates no admite borrado físico (Fase 0). Marcá deleted_at.'
    using errcode = '23001';
end;
$$;

revoke all on function private.ht_actor() from public;
revoke all on function private.ht_audit_row() from public;
revoke all on function private.ht_audit_log_no_mutate() from public;
revoke all on function private.ht_candidates_no_hard_delete() from public;

drop trigger if exists fase0_audit_immutable on public.ht_audit_log;
create trigger fase0_audit_immutable
  before update or delete on public.ht_audit_log
  for each row execute function private.ht_audit_log_no_mutate();

drop trigger if exists fase0_audit_no_truncate on public.ht_audit_log;
create trigger fase0_audit_no_truncate
  before truncate on public.ht_audit_log
  for each statement execute function private.ht_audit_log_no_mutate();

do $trg$
declare
  t text;
begin
  for t in select table_name from private.ht_fase0_audit_tables loop
    execute format('drop trigger if exists fase0_audit_row on public.%I', t);
    execute format(
      'create trigger fase0_audit_row after insert or update or delete on public.%I for each row execute function private.ht_audit_row()',
      t
    );
  end loop;
end
$trg$;

drop trigger if exists fase0_no_hard_delete on public.ht_candidates;
create trigger fase0_no_hard_delete
  before delete on public.ht_candidates
  for each row execute function private.ht_candidates_no_hard_delete();

-- ── 4) CASCADE y SET NULL → RESTRICT ───────────────────────
do $fk$
declare
  r record;
  new_def text;
begin
  for r in
    select
      n.nspname as child_schema,
      child.relname as child_table,
      con.conname,
      pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_namespace n on n.oid = child.relnamespace
    join pg_class parent on parent.oid = con.confrelid
    join pg_namespace pn on pn.oid = parent.relnamespace
    where con.contype = 'f'
      and n.nspname = 'public'
      and pn.nspname = 'public'
      and parent.relname = 'ht_candidates'
      and con.confdeltype in ('c', 'n')
  loop
    new_def := regexp_replace(r.def, 'ON DELETE (CASCADE|SET NULL)', 'ON DELETE RESTRICT', 'i');
    if new_def = r.def then
      raise exception 'No se pudo reescribir la FK %.%: %', r.child_table, r.conname, r.def;
    end if;

    insert into private.ht_fk_rewrite_backup (conname, child_schema, child_table, original_def)
    values (r.conname, r.child_schema, r.child_table, r.def)
    on conflict do nothing;

    execute format('alter table %I.%I drop constraint %I', r.child_schema, r.child_table, r.conname);
    execute format('alter table %I.%I add constraint %I %s', r.child_schema, r.child_table, r.conname, new_def);
  end loop;
end
$fk$;

-- ── 5) Único de matches: solo filas vivas ───────────────────
do $uq$
declare
  r record;
begin
  if to_regclass('public.ts_cv_bank_matches') is null then
    return;
  end if;

  for r in
    select c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'ts_cv_bank_matches'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%vacancy_id%'
      and pg_get_constraintdef(c.oid) ilike '%candidate_id%'
  loop
    insert into private.ht_fase0_dropped_constraints (child_schema, child_table, conname, original_def)
    values ('public', 'ts_cv_bank_matches', r.conname, r.def)
    on conflict do nothing;
    execute format('alter table public.ts_cv_bank_matches drop constraint %I', r.conname);
  end loop;

  create unique index if not exists fase0_cv_matches_active_uq
    on public.ts_cv_bank_matches (vacancy_id, candidate_id)
    where deleted_at is null;
  insert into private.ht_fase0_added_indexes (index_name)
  values ('fase0_cv_matches_active_uq')
  on conflict do nothing;
end
$uq$;

-- ── 6) Vista de candidatos vivos ────────────────────────────
-- security_invoker: la vista no se salta el RLS de ht_candidates.
-- La app no la usa para escribir; el filtro de verdad está en el cliente.
create or replace view public.ht_candidates_active
with (security_invoker = true) as
select *
from public.ht_candidates
where deleted_at is null;

comment on view public.ht_candidates_active is
  'Candidatos con deleted_at IS NULL. Atajo para SQL. La app filtra en el cliente.';

revoke all on table public.ht_candidates_active from public;
revoke all on table public.ht_audit_log from public;

do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema private from anon';
    execute 'revoke all on table public.ht_candidates_active from anon';
    execute 'revoke all on table public.ht_audit_log from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema private from authenticated';
    execute 'revoke all on table public.ht_candidates_active from authenticated';
    execute 'revoke all on table public.ht_audit_log from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    -- El trigger corre como el usuario de la petición: necesita EXECUTE.
    execute 'grant usage on schema private to service_role';
    execute 'grant execute on function private.ht_actor() to service_role';
    execute 'grant execute on function private.ht_audit_row() to service_role';
    execute 'grant execute on function private.ht_audit_log_no_mutate() to service_role';
    execute 'grant execute on function private.ht_candidates_no_hard_delete() to service_role';
    execute 'grant select on table public.ht_candidates_active to service_role';
    execute 'grant select on table public.ht_audit_log to service_role';
    execute 'revoke insert, update, delete, truncate on table public.ht_audit_log from service_role';
  end if;
end
$grants$;

commit;
