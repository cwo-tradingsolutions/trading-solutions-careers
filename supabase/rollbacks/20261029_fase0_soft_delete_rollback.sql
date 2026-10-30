-- ============================================================
-- Rollback de Fase 0 · borrado lógico + historial
--
-- PREVIEW. No correr contra mojbhvphztnadndhnraf salvo decisión explícita
-- de revertir, y solo después de la migración 20261029_fase0_soft_delete.
--
-- Devuelve las FK al ON DELETE que tenían (CASCADE o SET NULL), quita
-- deleted_at / deleted_by / delete_reason que esta migración agregó, y
-- borra ht_audit_log. Las filas de candidatos no se tocan: un candidato
-- que estaba oculto vuelve a verse porque desaparece deleted_at.
--
-- Si hay dos matches de CV para la misma vacante y candidato (uno oculto
-- y uno vivo), el UNIQUE original no se puede recrear. En ese caso el
-- rollback deja el aviso y no aborta el resto.
-- ============================================================

begin;

do $guard$
begin
  if to_regclass('private.ht_fase0_audit_tables') is null then
    raise exception 'No hay migración Fase 0 aplicada (falta private.ht_fase0_audit_tables). No se revirtió nada.';
  end if;
end
$guard$;

drop trigger if exists fase0_no_hard_delete on public.ht_candidates;

do $drop_audit_trg$
declare
  t text;
begin
  for t in select table_name from private.ht_fase0_audit_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists fase0_audit_row on public.%I', t);
    end if;
  end loop;
end
$drop_audit_trg$;

drop trigger if exists fase0_audit_immutable on public.ht_audit_log;
drop trigger if exists fase0_audit_no_truncate on public.ht_audit_log;

-- FK originales (CASCADE / SET NULL), tomadas de la bitácora.
do $restore_fk$
declare
  r record;
begin
  for r in
    select conname, child_schema, child_table, original_def
    from private.ht_fk_rewrite_backup
  loop
    if to_regclass(r.child_schema || '.' || r.child_table) is null then
      continue;
    end if;
    execute format(
      'alter table %I.%I drop constraint if exists %I',
      r.child_schema, r.child_table, r.conname
    );
    execute format(
      'alter table %I.%I add constraint %I %s',
      r.child_schema, r.child_table, r.conname, r.original_def
    );
  end loop;
end
$restore_fk$;

drop index if exists public.fase0_cv_matches_active_uq;

do $restore_uq$
declare
  r record;
  dupes bigint;
begin
  for r in
    select conname, child_schema, child_table, original_def
    from private.ht_fase0_dropped_constraints
  loop
    if to_regclass(r.child_schema || '.' || r.child_table) is null then
      continue;
    end if;
    execute format(
      'select count(*) from (select 1 from %I.%I group by vacancy_id, candidate_id having count(*) > 1) d',
      r.child_schema, r.child_table
    ) into dupes;
    if dupes > 0 then
      raise warning 'No se restauró %.%: hay % pares vacancy/candidate duplicados por el borrado lógico.',
        r.child_table, r.conname, dupes;
      continue;
    end if;
    execute format(
      'alter table %I.%I drop constraint if exists %I',
      r.child_schema, r.child_table, r.conname
    );
    execute format(
      'alter table %I.%I add constraint %I %s',
      r.child_schema, r.child_table, r.conname, r.original_def
    );
  end loop;
end
$restore_uq$;

drop view if exists public.ht_candidates_active;

do $drop_idx$
declare
  idx text;
begin
  for idx in select index_name from private.ht_fase0_added_indexes loop
    execute format('drop index if exists public.%I', idx);
  end loop;
end
$drop_idx$;

do $drop_cols$
declare
  r record;
begin
  for r in
    select table_name, column_name
    from private.ht_fase0_added_columns
  loop
    if to_regclass('public.' || r.table_name) is not null then
      execute format(
        'alter table public.%I drop column if exists %I',
        r.table_name, r.column_name
      );
    end if;
  end loop;
end
$drop_cols$;

drop table if exists public.ht_audit_log;

drop function if exists private.ht_candidates_no_hard_delete();
drop function if exists private.ht_audit_log_no_mutate();
drop function if exists private.ht_audit_row();
drop function if exists private.ht_actor();

drop table if exists private.ht_fase0_dropped_constraints;
drop table if exists private.ht_fk_rewrite_backup;
drop table if exists private.ht_fase0_added_indexes;
drop table if exists private.ht_fase0_added_columns;
drop table if exists private.ht_fase0_audit_tables;

do $drop_schema$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
  ) and not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  ) then
    drop schema if exists private;
  end if;
end
$drop_schema$;

commit;
