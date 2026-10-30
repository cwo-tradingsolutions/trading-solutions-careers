-- Corre después del rollback. El candidato de la prueba sigue ahí, sin deleted_at,
-- y un DELETE físico vuelve a arrastrar a los hijos.

do $$
declare
  n int;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ht_candidates' and column_name = 'deleted_at'
  ) then
    raise exception 'deleted_at sigue en ht_candidates después del rollback';
  end if;

  if to_regclass('public.ht_audit_log') is not null then
    raise exception 'ht_audit_log sigue existiendo';
  end if;
  if to_regclass('public.ht_candidates_active') is not null then
    raise exception 'ht_candidates_active sigue existiendo';
  end if;
  if to_regnamespace('private') is not null then
    raise exception 'el esquema private no se eliminó';
  end if;

  select count(*) into n
  from pg_constraint con
  join pg_class parent on parent.oid = con.confrelid
  where con.contype = 'f' and parent.relname = 'ht_candidates' and con.confdeltype = 'c';
  if n <> 17 then
    raise exception 'después del rollback se esperaban 17 CASCADE, hay %', n;
  end if;

  select count(*) into n
  from pg_constraint con
  join pg_class parent on parent.oid = con.confrelid
  where con.contype = 'f' and parent.relname = 'ht_candidates' and con.confdeltype = 'n';
  if n <> 2 then
    raise exception 'después del rollback se esperaban 2 SET NULL, hay %', n;
  end if;

  select count(*) into n from ht_candidates
  where id = '11111111-1111-1111-1111-111111111111';
  if n <> 1 then
    raise exception 'el rollback se llevó la fila del candidato';
  end if;
end $$;

delete from ht_candidates where id = '11111111-1111-1111-1111-111111111111';

do $$
declare
  n int;
begin
  select count(*) into n from ht_candidates
  where id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then
    raise exception 'después del rollback el DELETE físico no borró al candidato';
  end if;
  select count(*) into n from ht_candidate_stage_events
  where candidate_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then
    raise exception 'después del rollback el CASCADE no borró el historial (quedan %)', n;
  end if;
  select count(*) into n from ht_responses
  where candidate_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then
    raise exception 'después del rollback el CASCADE no borró ht_responses';
  end if;
end $$;
