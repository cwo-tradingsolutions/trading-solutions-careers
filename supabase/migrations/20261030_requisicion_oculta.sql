-- ============================================================================
-- OCULTAR REQUISICIONES · duplicada y hecha fuera del ATS
-- 30-oct-2026
--
-- SOLO ARCHIVO. No aplicar esta migración hasta el GO de Kelly.
-- No correr este SQL contra Supabase, Neon, ni ninguna otra base real
-- desde el PR.
--
-- Dos transacciones.
--   A) DDL de hidden_at / hidden_reason / hidden_by y el índice. Siempre
--      se commitea. Si la base no es la foto del 30-oct, las columnas
--      igual quedan: el API filtra por hidden_at y no puede quedarse sin ellas.
--   B) Oculta las dos filas. El chequeo compara contra un «antes» tomado
--      en esta misma corrida y valida esos ids, no un total fijo de 11/9/1/1/28.
--      Si B falla, solo B se revierte. A ya está commiteado.
--
-- No borra filas. El status no se toca. Es idempotente.
-- HIDDEN_REASONS en src/lib/requisition-board.ts es el único sitio del código
-- con las dos claves. Este CHECK repite esas cadenas.
-- ============================================================================

-- ─── A) Columnas. Siempre se quedan. ────────────────────────────────────────
begin;

alter table ht_requisitions add column if not exists hidden_at timestamptz;
alter table ht_requisitions add column if not exists hidden_reason text;
alter table ht_requisitions add column if not exists hidden_by text;

alter table ht_requisitions drop constraint if exists ht_requisitions_hidden_reason_check;
alter table ht_requisitions
  add constraint ht_requisitions_hidden_reason_check
  check (hidden_reason is null or hidden_reason in ('duplicada','fuera_del_ats'));

create index if not exists idx_req_visible
  on ht_requisitions (client_id, created_at desc)
  where hidden_at is null;

commit;

-- ─── B) Ocultar las dos filas. Si esto aborta, las columnas siguen. ─────────
begin;

create table if not exists ht_requisitions_backup_20261030 (
  requisition_id uuid primary key,
  backed_up_at   timestamptz not null default now(),
  row_data       jsonb not null,
  events_data    jsonb not null
);

alter table ht_requisitions_backup_20261030 enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table ht_requisitions_backup_20261030 from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table ht_requisitions_backup_20261030 from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on table ht_requisitions_backup_20261030 to service_role';
  end if;
end $$;

-- Foto de las dos filas ANTES de tocarlas. on conflict do nothing: una
-- segunda corrida no pisa la primera foto.
insert into ht_requisitions_backup_20261030 (requisition_id, row_data, events_data)
select
  r.id,
  to_jsonb(r),
  coalesce(
    (
      select jsonb_agg(to_jsonb(e) order by e.changed_at)
      from ht_requisition_events e
      where e.requisition_id = r.id
    ),
    '[]'::jsonb
  )
from ht_requisitions r
where r.id in (
  '22c60d38-590b-4789-a1df-fe3d8f77d2ec',
  '8e597f02-a1dd-47ba-94f6-db4521224077'
)
on conflict (requisition_id) do nothing;

-- «Antes» de esta corrida. Vive solo en la transacción B.
create temp table _req_hide_before on commit drop as
select
  r.id,
  r.status,
  r.hidden_at,
  (
    select count(*)::int
    from ht_requisition_events e
    where e.requisition_id = r.id
  ) as event_count
from ht_requisitions r
where r.id in (
  '22c60d38-590b-4789-a1df-fe3d8f77d2ec',
  '8e597f02-a1dd-47ba-94f6-db4521224077'
);

-- Conteos informativos. No abortan la migración si no son 11/9/1/1/28.
create table if not exists ht_migration_verify_20261030 (
  phase       text not null check (phase in ('before','after')),
  metric      text not null,
  n           integer not null,
  captured_at timestamptz not null default now(),
  primary key (phase, metric)
);

alter table ht_migration_verify_20261030 enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table ht_migration_verify_20261030 from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table ht_migration_verify_20261030 from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on table ht_migration_verify_20261030 to service_role';
  end if;
end $$;

insert into ht_migration_verify_20261030 (phase, metric, n)
select 'before', x.metric, x.n
from (
  select 'ht_requisitions'::text as metric, count(*)::int as n from ht_requisitions
  union all
  select 'publicada', count(*)::int from ht_requisitions where status = 'publicada'
  union all
  select 'pedida', count(*)::int from ht_requisitions where status = 'pedida'
  union all
  select 'rechazada', count(*)::int from ht_requisitions where status = 'rechazada'
  union all
  select 'hidden', count(*)::int from ht_requisitions where hidden_at is not null
  union all
  select 'events', count(*)::int from ht_requisition_events
) x
where not exists (
  select 1 from ht_migration_verify_20261030 where phase = 'before'
);

-- 22c60d38 es la duplicada. La canónica 63f67118-1827-484d-8623-3f90e3758d35
-- no se nombra en ningún UPDATE.
-- 8e597f02 es Coordinador de Flota, armada fuera del ATS.
-- El status no entra en el SET.

update ht_requisitions
set hidden_at = now(),
    hidden_reason = 'duplicada',
    hidden_by = 'cwo@tradingsolutions.com'
where id = '22c60d38-590b-4789-a1df-fe3d8f77d2ec'
  and hidden_at is null;

update ht_requisitions
set hidden_at = now(),
    hidden_reason = 'fuera_del_ats',
    hidden_by = 'cwo@tradingsolutions.com'
where id = '8e597f02-a1dd-47ba-94f6-db4521224077'
  and hidden_at is null;

insert into ht_requisition_events (requisition_id, from_status, to_status, actor_email, note)
select
  r.id,
  r.status,
  r.status,
  'cwo@tradingsolutions.com',
  'Oculta: ' || r.hidden_reason
from ht_requisitions r
where r.id in (
  '22c60d38-590b-4789-a1df-fe3d8f77d2ec',
  '8e597f02-a1dd-47ba-94f6-db4521224077'
)
  and r.hidden_reason is not null
  and not exists (
    select 1
    from ht_requisition_events e
    where e.requisition_id = r.id
      and e.actor_email = 'cwo@tradingsolutions.com'
      and e.note = 'Oculta: ' || r.hidden_reason
      and e.from_status = r.status
      and e.to_status = r.status
  );

-- Chequeo contra el «antes» de esta corrida. No mira el total de la tabla.
do $$
begin
  if exists (
    select 1
    from _req_hide_before b
    join ht_requisitions r on r.id = b.id
    where r.status is distinct from b.status
  ) then
    raise exception 'el status de un id objetivo cambio; se revierte solo el ocultamiento, las columnas quedan';
  end if;

  if exists (
    select 1 from ht_requisitions
    where id = '22c60d38-590b-4789-a1df-fe3d8f77d2ec'
      and (
        hidden_at is null
        or hidden_reason is distinct from 'duplicada'
        or hidden_by is distinct from 'cwo@tradingsolutions.com'
      )
  ) then
    raise exception '22c60d38 existe y no quedo oculta como duplicada';
  end if;

  if exists (
    select 1 from ht_requisitions
    where id = '8e597f02-a1dd-47ba-94f6-db4521224077'
      and (
        hidden_at is null
        or hidden_reason is distinct from 'fuera_del_ats'
        or hidden_by is distinct from 'cwo@tradingsolutions.com'
      )
  ) then
    raise exception '8e597f02 existe y no quedo oculta como fuera_del_ats';
  end if;

  if exists (
    select 1
    from _req_hide_before b
    where b.hidden_at is null
      and (
        select count(*)::int from ht_requisition_events e where e.requisition_id = b.id
      ) is distinct from b.event_count + 1
  ) then
    raise exception 'falta el evento de ocultar respecto del antes de esta corrida';
  end if;

  if exists (
    select 1 from ht_requisitions
    where id = '63f67118-1827-484d-8623-3f90e3758d35'
      and hidden_at is not null
  ) then
    raise exception 'la requisicion canonica 63f67118 no se oculta';
  end if;
end $$;

insert into ht_migration_verify_20261030 (phase, metric, n)
select 'after', x.metric, x.n
from (
  select 'ht_requisitions'::text as metric, count(*)::int as n from ht_requisitions
  union all
  select 'publicada', count(*)::int from ht_requisitions where status = 'publicada'
  union all
  select 'pedida', count(*)::int from ht_requisitions where status = 'pedida'
  union all
  select 'rechazada', count(*)::int from ht_requisitions where status = 'rechazada'
  union all
  select 'hidden', count(*)::int from ht_requisitions where hidden_at is not null
  union all
  select 'events', count(*)::int from ht_requisition_events
) x
on conflict (phase, metric) do update
  set n = excluded.n,
      captured_at = now();

-- Informativo. No aborta si el total no es el del 30-oct.
select
  v.phase,
  v.metric,
  v.n
from ht_migration_verify_20261030 v
order by v.phase, v.metric;

commit;
