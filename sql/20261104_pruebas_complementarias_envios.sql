-- ============================================================
-- Pruebas complementarias · registro de cada borrador (UP)
-- Idempotente: se puede correr varias veces.
-- Rollback: sql/20261104_pruebas_complementarias_envios.down.sql
-- ============================================================
-- EL PROBLEMA
-- El botón «Pruebas complementarias» escribía
-- ht_candidates.tests_battery_sent_at, columna que nunca existió, dentro de un
-- try/catch vacío. supabase-js no lanza: devuelve { error }, y nadie lo
-- miraba. Resultado: ningún envío de ese botón quedó registrado.
--
-- POR QUÉ UNA TABLA Y NO UNA COLUMNA
-- Una columna guarda solo el último envío y no dice qué pruebas iban ni si fue
-- un borrador real o una vista previa. La tabla deja una fila por borrador,
-- con las pruebas incluidas y el id del borrador en Gmail. No se marca
-- `ht_external_test_results.estado='enviada'` porque un borrador no es un
-- envío: lo envía una persona desde Gmail, cuando pega los enlaces.
--
-- No toca datos existentes: no borra ni modifica filas de ningún otro lado.

create table if not exists public.ht_pruebas_complementarias_envios (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.ht_candidates(id) on delete cascade,
  vacancy_id    uuid,
  -- 'borrador_gmail' = se creó el borrador en Gmail (no se envió)
  -- 'dry_run'        = vista previa (staging o ?dry_run=1): Gmail no se tocó
  modo          text not null check (modo in ('borrador_gmail', 'dry_run')),
  idioma        text not null default 'es' check (idioma in ('es', 'en')),
  pruebas       jsonb not null default '[]'::jsonb,   -- claves de ts_test_providers
  placeholders  jsonb not null default '[]'::jsonb,   -- las que quedaron sin enlace
  draft_id      text,
  gmail_email   text,
  creado_por    text,
  created_at    timestamptz not null default now()
);

create index if not exists ht_pc_envios_cand_idx
  on public.ht_pruebas_complementarias_envios (candidate_id, created_at desc);

alter table public.ht_pruebas_complementarias_envios enable row level security;

-- Mismo dueño que el resto de tablas del ATS. Solo el servidor (service_role,
-- que entra por PostgREST) la usa; anon/authenticated no reciben permiso.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'careers_owner') then
    execute 'alter table public.ht_pruebas_complementarias_envios owner to careers_owner';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.ht_pruebas_complementarias_envios to service_role';
  end if;
end $$;

-- PostgREST: recargar el esquema para que vea la tabla nueva.
notify pgrst, 'reload schema';

-- Verificación
select 'ht_pruebas_complementarias_envios' as tabla,
       to_regclass('public.ht_pruebas_complementarias_envios') is not null as existe;
