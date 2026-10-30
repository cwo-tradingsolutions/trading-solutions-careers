# Migraciones Requisiciones/Vacantes · 30-oct-2026

Archivos. No se aplicaron contra ninguna base desde este PR. Se aplican en el deploy, con GO de Kelly.

## Orden

`20261030_recruitment_sources.sql` corre **antes** de desplegar el código. El formulario de Careers escribe `ht_candidates.arrival_source` solo cuando hay un `?src=` válido. Si esa columna no existe y el insert la manda, PostgREST rechaza la fila y el candidato no entra al funnel. Por eso la migración va primero.

`20261030_requisicion_oculta.sql` va en el mismo paso, también antes de servir el código que filtra `hidden_at`.

El backup `ht_requisitions_backup_20261030` no se borra acá. Se deja hasta que Kelly pida dropearlo, después de verificar el GO.

- `20261030_requisicion_oculta.sql` — `hidden_at`, `hidden_reason`, `hidden_by`. Oculta dos filas. No cambia `status`. No borra.
- `20261030_recruitment_sources.sql` — tabla `ht_recruitment_sources`, FK en `ht_vacancy_postings.source`, columna `ht_candidates.arrival_source`.

Las claves de `hidden_reason` (`duplicada`, `fuera_del_ats`) están en `HIDDEN_REASONS` (`src/lib/requisition-board.ts`). El CHECK de la migración usa las mismas cadenas.

Las cuatro tarjetas son Publicadas, Archivadas, Cerradas y Ocultas. El nombre de la cuarta es exactamente «Ocultas». Adentro, cada fila lleva el chip de su motivo: «Duplicada» o «Fuera del ATS». Las definiciones están en `TARJETAS_CONTEO`, en el mismo archivo.

## Backup

La migración de ocultar escribe, **antes** del `UPDATE`, la tabla `ht_requisitions_backup_20261030` con las dos filas y sus eventos:

| requisition_id | motivo |
|---|---|
| `22c60d38-590b-4789-a1df-fe3d8f77d2ec` | `duplicada` |
| `8e597f02-a1dd-47ba-94f6-db4521224077` | `fuera_del_ats` |

`hidden_by` queda en `cwo@tradingsolutions.com`. La canónica `63f67118-1827-484d-8623-3f90e3758d35` no entra en ningún `UPDATE`.

Export JSON de ese backup (solo lectura):

```sql
select jsonb_pretty(jsonb_build_object(
  'exported_at', now(),
  'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'requisition_id', requisition_id,
      'backed_up_at', backed_up_at,
      'requisition', row_data,
      'events', events_data
    ) order by requisition_id)
    from ht_requisitions_backup_20261030
  ), '[]'::jsonb)
));
```

Una segunda corrida no pisa el backup (`on conflict do nothing`).

## Verificación

La migración guarda el antes en `ht_migration_verify_20261030` y el después al final. Esta consulta se puede correr sola, después, y no escribe:

```sql
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
```

Línea base del 30-oct-2026, antes: `ht_requisitions` 11 (publicada 9, pedida 1, rechazada 1), eventos 28, ocultas 0.

Después, sobre esa misma línea base: los mismos conteos por status, `hidden` 2, eventos 30.

Foto en vivo (no usa la tabla de verificación):

```sql
select
  (select count(*) from ht_requisitions) as requisitions,
  (select count(*) from ht_requisitions where status = 'publicada') as publicada,
  (select count(*) from ht_requisitions where status = 'pedida') as pedida,
  (select count(*) from ht_requisitions where status = 'rechazada') as rechazada,
  (select count(*) from ht_requisitions where hidden_at is not null) as hidden,
  (select count(*) from ht_requisition_events) as events,
  (select status from ht_requisitions where id = '22c60d38-590b-4789-a1df-fe3d8f77d2ec') as status_duplicada,
  (select hidden_reason from ht_requisitions where id = '22c60d38-590b-4789-a1df-fe3d8f77d2ec') as razon_duplicada,
  (select status from ht_requisitions where id = '8e597f02-a1dd-47ba-94f6-db4521224077') as status_flota,
  (select hidden_reason from ht_requisitions where id = '8e597f02-a1dd-47ba-94f6-db4521224077') as razon_flota,
  (select status from ht_requisitions where id = '63f67118-1827-484d-8623-3f90e3758d35') as status_canonica,
  (select hidden_at is null from ht_requisitions where id = '63f67118-1827-484d-8623-3f90e3758d35') as canonica_visible;
```

Esperado después: 11, 9, 1, 1, 2, 30, `rechazada`, `duplicada`, `pedida`, `fuera_del_ats`, `publicada`, `true`.

Si la base ya no es esa línea base (entró otra requisición entre el 30-oct y el GO), `coincide` sale en falso. Los dos `UPDATE` igual solo tocan esos uuid y no les cambian el status. Hay que leer el resultado antes de dar por buena la corrida.
