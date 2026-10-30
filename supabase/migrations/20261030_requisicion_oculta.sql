-- ============================================================================
-- OCULTAR REQUISICIONES · duplicada y hecha fuera del ATS
-- 30-oct-2026
--
-- SOLO ARCHIVO. No aplicar esta migración hasta el GO de Kelly.
-- No correr este SQL contra Supabase, Neon, ni ninguna otra base real
-- desde el PR. El deploy con GO es el único momento en que se aplica.
--
-- No borra filas. Ocultar es hidden_at + hidden_reason + hidden_by, y una
-- fila nueva en ht_requisition_events. El status no se toca: el CHECK sigue
-- siendo pedida, con_perfil, devuelta, aprobada, rechazada, publicada.
--
-- Las dos claves de hidden_reason viven en un solo sitio del código:
-- HIDDEN_REASONS en src/lib/requisition-board.ts. Este CHECK repite esas
-- mismas cadenas.
--
-- Es idempotente: se puede correr más de una vez. El backup conserva la
-- foto de la primera corrida (antes de ocultar). El UPDATE no pisa una fila
-- que ya tiene hidden_at. El evento no se duplica.
--
-- Va en una transacción: si el assert del paso 5 falla, los UPDATE se
-- revierten. Las tablas nuevas no tienen policy para anon ni authenticated.
-- ============================================================================

begin;

-- ─── 1) Columnas ────────────────────────────────────────────────────────────
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

-- ─── 2) Backup de las dos filas y sus eventos, ANTES del cambio ────────────
-- Tabla de backup (la foto operativa) y, en el README de esta migración,
-- el SELECT que la exporta a JSON. on conflict do nothing: una segunda
-- corrida no pisa la foto previa al ocultamiento.
create table if not exists ht_requisitions_backup_20261030 (
  requisition_id uuid primary key,
  backed_up_at   timestamptz not null default now(),
  row_data       jsonb not null,
  events_data    jsonb not null
);

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

-- ─── 3) Conteos ANTES, una sola vez ─────────────────────────────────────────
-- Esperado en la línea base del 30-oct-2026 ~12:25 Bogotá:
--   ht_requisitions 11 (publicada 9, pedida 1, rechazada 1)
--   hidden 0
--   ht_requisition_events 28
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

-- ─── 4) Ocultar. El status no entra en el SET. ─────────────────────────────
-- 22c60d38 es la duplicada. La canónica 63f67118-1827-484d-8623-3f90e3758d35
-- no se nombra en ningún UPDATE: sigue publicada.
-- 8e597f02 es Coordinador de Flota, armada fuera del ATS.

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

-- Un evento por id. from_status = to_status = el status que ya tenía.
-- No inventa un estado. No se inserta de nuevo si la nota ya está.
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

-- ─── 5) El status de las dos filas tiene que seguir igual que el backup ────
do $$
begin
  if exists (
    select 1
    from ht_requisitions_backup_20261030 b
    join ht_requisitions r on r.id = b.requisition_id
    where r.status is distinct from (b.row_data->>'status')
  ) then
    raise exception 'el status de una requisicion ocultada cambio; esta migracion no debe tocarlo';
  end if;

  if exists (
    select 1 from ht_requisitions
    where id = '63f67118-1827-484d-8623-3f90e3758d35'
      and hidden_at is not null
  ) then
    raise exception 'la requisicion canonica 63f67118 no se oculta';
  end if;

  if exists (
    select 1 from ht_requisitions
    where id = '22c60d38-590b-4789-a1df-fe3d8f77d2ec'
      and hidden_reason is distinct from 'duplicada'
  ) then
    raise exception '22c60d38 existe y no quedo con hidden_reason duplicada';
  end if;

  if exists (
    select 1 from ht_requisitions
    where id = '8e597f02-a1dd-47ba-94f6-db4521224077'
      and hidden_reason is distinct from 'fuera_del_ats'
  ) then
    raise exception '8e597f02 existe y no quedo con hidden_reason fuera_del_ats';
  end if;
end $$;

-- ─── 6) Conteos DESPUÉS ─────────────────────────────────────────────────────
-- Esperado sobre la línea base:
--   ht_requisitions 11 (publicada 9, pedida 1, rechazada 1) — igual que antes
--   hidden 2
--   ht_requisition_events 30
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

-- ─── 7) Verificación (también está en el README, para correrla sola) ───────
select
  v.phase,
  v.metric,
  v.n,
  case v.metric
    when 'ht_requisitions' then 11
    when 'publicada' then 9
    when 'pedida' then 1
    when 'rechazada' then 1
    when 'hidden' then case v.phase when 'before' then 0 when 'after' then 2 end
    when 'events' then case v.phase when 'before' then 28 when 'after' then 30 end
  end as esperado,
  v.n = case v.metric
    when 'ht_requisitions' then 11
    when 'publicada' then 9
    when 'pedida' then 1
    when 'rechazada' then 1
    when 'hidden' then case v.phase when 'before' then 0 when 'after' then 2 end
    when 'events' then case v.phase when 'before' then 28 when 'after' then 30 end
  end as coincide
from ht_migration_verify_20261030 v
order by v.phase, v.metric;

-- Si algún conteo no coincide con la línea base, se aborta. El commit de
-- abajo no corre y la transacción queda revertida (rollback, no commit).
do $$
declare
  malas int;
begin
  select count(*) into malas
  from ht_migration_verify_20261030 v
  where v.n is distinct from (
    case v.metric
      when 'ht_requisitions' then 11
      when 'publicada' then 9
      when 'pedida' then 1
      when 'rechazada' then 1
      when 'hidden' then case v.phase when 'before' then 0 when 'after' then 2 end
      when 'events' then case v.phase when 'before' then 28 when 'after' then 30 end
    end
  );
  if malas > 0 then
    raise exception 'coincide=false: la linea base no cuadra; rollback, no commit';
  end if;
end $$;

commit;
