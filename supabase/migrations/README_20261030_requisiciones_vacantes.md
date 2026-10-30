# Migraciones Requisiciones/Vacantes · 30-oct-2026

Archivos. No se aplicaron contra ninguna base desde este PR. Se aplican en el deploy, con GO de Kelly.

## Orden

`20261030_recruitment_sources.sql` corre **antes** de desplegar el código. El formulario de Careers escribe `ht_candidates.arrival_source` solo cuando hay un `?src=` válido. Si esa columna no existe y el insert la manda, PostgREST rechaza la fila y el candidato no entra al funnel. Por eso la migración va primero.

`20261030_requisicion_oculta.sql` va en el mismo paso, también antes de servir el código que filtra `hidden_at`.

Ese archivo tiene dos transacciones. La primera solo agrega `hidden_at`, `hidden_reason`, `hidden_by` y el índice, y siempre se commitea. La segunda oculta los dos uuid. Su chequeo compara cada id contra un «antes» tomado en esa misma corrida (el status no cambió, el motivo es el esperado, hay un evento nuevo si recién se ocultó, la canónica no se tocó). No exige que la tabla siga en 11/9/1/1/28.

Si la segunda aborta, las columnas se quedan y las dos filas vuelven al estado de antes de esa transacción. El API no se rompe. Hay que leer el mensaje: si un id existe y no quedó con el motivo esperado, o si el status se movió, no se fuerza. Se mira esa fila y la canónica `63f67118-1827-484d-8623-3f90e3758d35`, se decide con Kelly, y se vuelve a correr el archivo: es idempotente y no pisa un backup ya tomado. En una base vacía o de staging, donde esos uuid no están, la segunda transacción no hace nada y termina bien.

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

No compara totales. En staging puede haber más filas que el 30-oct y seguir estando bien. Esta consulta se corre sola y no escribe. Las cinco columnas tienen que salir `true`: las columnas, el CHECK y el índice existen, y cada uuid está oculto con su motivo **si la fila existe**. Si no existe, esa columna también sale `true`.

```sql
select
  (
    select count(*) = 3
    from information_schema.columns
    where table_name = 'ht_requisitions'
      and column_name in ('hidden_at', 'hidden_reason', 'hidden_by')
  ) as columnas,
  exists (
    select 1 from pg_constraint
    where conname = 'ht_requisitions_hidden_reason_check'
  ) as check_motivo,
  exists (
    select 1 from pg_indexes
    where indexname = 'idx_req_visible'
  ) as indice,
  not exists (
    select 1 from ht_requisitions
    where id = '22c60d38-590b-4789-a1df-fe3d8f77d2ec'
      and (hidden_at is null or hidden_reason is distinct from 'duplicada')
  ) as duplicada_si_existe,
  not exists (
    select 1 from ht_requisitions
    where id = '8e597f02-a1dd-47ba-94f6-db4521224077'
      and (hidden_at is null or hidden_reason is distinct from 'fuera_del_ats')
  ) as flota_si_existe;
```

La foto del 30-oct (11 requisiciones, publicada 9, pedida 1, rechazada 1, eventos 28, y después hidden 2 y eventos 30) era la base de ese día. No es el criterio. No hay `delete` ni cambio de `status`. Si la segunda transacción aborta por un id, las columnas de la primera ya quedaron.
