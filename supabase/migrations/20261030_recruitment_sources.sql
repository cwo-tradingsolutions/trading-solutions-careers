-- ============================================================================
-- FUENTES CONFIGURABLES + canal de llegada del candidato
-- 30-oct-2026
--
-- SOLO ARCHIVO. No aplicar esta migración hasta el GO de Kelly.
-- No correr este SQL contra una base real desde el PR.
--
-- No borra postings ni candidatos. Reemplaza el CHECK de
-- ht_vacancy_postings.source por una FK a ht_recruitment_sources.
-- Las 14 publicaciones que ya existen (careers, linkedin) siguen siendo
-- válidas: esas claves están en la semilla, y la semilla se inserta ANTES
-- de crear la FK.
--
-- Una fuente no se borra. Se desactiva (active = false) desde hr-admin.
-- ============================================================================

create table if not exists ht_recruitment_sources (
  key        text primary key,
  label      text not null,
  active     boolean not null default true,
  sort_order integer not null default 0
);

insert into ht_recruitment_sources (key, label, active, sort_order) values
  ('careers',   'Careers',   true, 10),
  ('linkedin',  'LinkedIn',  true, 20),
  ('turpial',   'Turpial',   true, 30),
  ('magneto',   'Magneto',   true, 40),
  ('referidos', 'Referidos', true, 50),
  ('otro',      'Otro',      true, 60)
on conflict (key) do nothing;

-- El CHECK inline se llama ht_vacancy_postings_source_check.
alter table ht_vacancy_postings drop constraint if exists ht_vacancy_postings_source_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ht_vacancy_postings_source_fkey'
  ) then
    alter table ht_vacancy_postings
      add constraint ht_vacancy_postings_source_fkey
      foreign key (source) references ht_recruitment_sources (key);
  end if;
end $$;

-- Canal de llegada. No reemplaza ht_candidates.source (public_form, linkedin
-- import, etc.). Las filas históricas quedan con arrival_source null y la
-- pantalla dice «sin dato».
alter table ht_candidates add column if not exists arrival_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ht_candidates_arrival_source_fkey'
  ) then
    alter table ht_candidates
      add constraint ht_candidates_arrival_source_fkey
      foreign key (arrival_source) references ht_recruitment_sources (key);
  end if;
end $$;

create index if not exists idx_candidates_arrival
  on ht_candidates (vacancy_id, arrival_source);

-- Verificación: la semilla está, el CHECK viejo no, la FK sí, la columna sí.
select
  (select count(*) from ht_recruitment_sources
     where key in ('careers','linkedin','turpial','magneto','referidos','otro')) as fuentes_semilla,
  (select count(*) from pg_constraint
     where conname = 'ht_vacancy_postings_source_check') as check_viejo,
  (select count(*) from pg_constraint
     where conname = 'ht_vacancy_postings_source_fkey') as fk_postings,
  (select count(*) from information_schema.columns
     where table_name = 'ht_candidates' and column_name = 'arrival_source') as columna_llegada;
-- Esperado: fuentes_semilla = 6 · check_viejo = 0 · fk_postings = 1 · columna_llegada = 1
