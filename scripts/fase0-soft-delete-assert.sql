-- Corre después de la migración, sobre la fixture. Falla con excepción si algo no cuadra.

do $$
declare
  n int;
begin
  select count(*) into n
  from pg_constraint con
  join pg_class parent on parent.oid = con.confrelid
  where con.contype = 'f' and parent.relname = 'ht_candidates' and con.confdeltype = 'c';
  if n <> 0 then
    raise exception 'quedaron % FK ON DELETE CASCADE hacia ht_candidates', n;
  end if;

  select count(*) into n
  from pg_constraint con
  join pg_class parent on parent.oid = con.confrelid
  where con.contype = 'f' and parent.relname = 'ht_candidates' and con.confdeltype = 'n';
  if n <> 0 then
    raise exception 'quedaron % FK ON DELETE SET NULL hacia ht_candidates', n;
  end if;

  select count(*) into n
  from pg_constraint con
  join pg_class parent on parent.oid = con.confrelid
  where con.contype = 'f' and parent.relname = 'ht_candidates' and con.confdeltype = 'r';
  if n <> 19 then
    raise exception 'se esperaban 19 FK RESTRICT hacia ht_candidates, hay %', n;
  end if;

  if to_regclass('public.ht_audit_log') is null then
    raise exception 'falta ht_audit_log';
  end if;
  if to_regclass('public.ht_candidates_active') is null then
    raise exception 'falta ht_candidates_active';
  end if;
end $$;

insert into ht_vacancies (id, title)
values ('22222222-2222-2222-2222-222222222222', 'Ops');

insert into ht_candidates (id, name, email, vacancy_id, stage, status)
values (
  '11111111-1111-1111-1111-111111111111',
  'Ana Prueba',
  'ana-fase0@example.com',
  '22222222-2222-2222-2222-222222222222',
  'aplico',
  'pending'
);

insert into ht_candidate_stage_events (candidate_id, to_stage)
values ('11111111-1111-1111-1111-111111111111', 'aplico');

insert into ht_responses (candidate_id)
values ('11111111-1111-1111-1111-111111111111');

-- Sin el trigger, el RESTRICT de la FK tiene que frenar el DELETE.
do $$
declare
  ok boolean := false;
begin
  alter table ht_candidates disable trigger fase0_no_hard_delete;
  begin
    begin
      delete from ht_candidates where id = '11111111-1111-1111-1111-111111111111';
    exception
      when foreign_key_violation then
        ok := true;
    end;
    alter table ht_candidates enable trigger fase0_no_hard_delete;
    if not ok then
      raise exception 'el DELETE físico no falló por RESTRICT';
    end if;
  exception
    when others then
      alter table ht_candidates enable trigger fase0_no_hard_delete;
      raise;
  end;
end $$;

-- Con el trigger, falla aunque alguien hubiera borrado los hijos antes.
do $$
begin
  delete from ht_candidates where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'el DELETE físico de ht_candidates no falló';
exception
  when restrict_violation then
    null;
end $$;

do $$
declare
  hijos int;
begin
  select count(*) into hijos from ht_candidate_stage_events
  where candidate_id = '11111111-1111-1111-1111-111111111111';
  if hijos <> 1 then
    raise exception 'el historial de etapas no sobrevivió al DELETE físico (hay %)', hijos;
  end if;
  select count(*) into hijos from ht_responses
  where candidate_id = '11111111-1111-1111-1111-111111111111';
  if hijos <> 1 then
    raise exception 'ht_responses no sobrevivió al DELETE físico';
  end if;
end $$;

update ht_candidates
set deleted_at = now(), deleted_by = 'kelly', delete_reason = 'prueba local'
where id = '11111111-1111-1111-1111-111111111111';

do $$
declare
  n int;
begin
  select count(*) into n from ht_candidates_active
  where id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then
    raise exception 'la vista de vivos todavía muestra al candidato oculto';
  end if;
  select count(*) into n from ht_candidates
  where id = '11111111-1111-1111-1111-111111111111';
  if n <> 1 then
    raise exception 'el borrado lógico se llevó la fila';
  end if;
  select count(*) into n from ht_candidate_stage_events
  where candidate_id = '11111111-1111-1111-1111-111111111111';
  if n <> 1 then
    raise exception 'el borrado lógico se llevó el historial';
  end if;
  select count(*) into n from ht_audit_log
  where table_name = 'ht_candidates' and row_id = '11111111-1111-1111-1111-111111111111' and action = 'insert';
  if n < 1 then
    raise exception 'el trigger no registró el INSERT';
  end if;
  select count(*) into n from ht_audit_log
  where table_name = 'ht_candidates' and row_id = '11111111-1111-1111-1111-111111111111' and action = 'soft_delete';
  if n < 1 then
    raise exception 'el trigger no registró el soft_delete';
  end if;
  select count(*) into n from ht_audit_log
  where table_name = 'ht_candidate_stage_events' and action = 'insert';
  if n < 1 then
    raise exception 'el trigger no registró el historial de etapas';
  end if;
end $$;

update ht_candidates
set deleted_at = null, deleted_by = null, delete_reason = null
where id = '11111111-1111-1111-1111-111111111111';

do $$
declare
  n int;
begin
  select count(*) into n from ht_audit_log
  where table_name = 'ht_candidates' and action = 'restore';
  if n < 1 then
    raise exception 'el trigger no registró el restore';
  end if;
  select count(*) into n from ht_candidates_active
  where id = '11111111-1111-1111-1111-111111111111';
  if n <> 1 then
    raise exception 'el restore no devolvió al candidato a la vista de vivos';
  end if;
end $$;

-- El log no se edita ni se borra.
do $$
declare
  audit_id bigint;
  ok boolean := false;
begin
  select id into audit_id from ht_audit_log limit 1;
  begin
    update ht_audit_log set actor = 'nadie' where id = audit_id;
  exception
    when insufficient_privilege then
      ok := true;
  end;
  if not ok then
    raise exception 'ht_audit_log aceptó un UPDATE';
  end if;
  ok := false;
  begin
    delete from ht_audit_log where id = audit_id;
  exception
    when insufficient_privilege then
      ok := true;
  end;
  if not ok then
    raise exception 'ht_audit_log aceptó un DELETE';
  end if;
end $$;
