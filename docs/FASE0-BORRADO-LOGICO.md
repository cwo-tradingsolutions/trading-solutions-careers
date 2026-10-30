# Fase 0 · borrado lógico + historial

Preview. No aplicar en el proyecto `mojbhvphztnadndhnraf` y no mezclar a `release/prod-c-hotfixes` hasta que Kelly dé el OK y haya un respaldo con conteos.

## Archivos

- Migración: `supabase/migrations/20261029_fase0_soft_delete.sql`
- Rollback: `supabase/rollbacks/20261029_fase0_soft_delete_rollback.sql`
- Prueba local: `scripts/fase0-soft-delete-local-test.sh`

La migración corre en una transacción. Si algo falla, no queda a medias. Reescribe las FK mirando `pg_constraint`, no una lista fija de nombres: en producción entran las 14 CASCADE que declara el repo (si la tabla existe; `ts_interviews` puede no estar) y también `ht_responses`, `ht_results` y `ht_ai_interviews`, que el código usa pero cuyo `CREATE TABLE` no está en el repositorio.

Las dos FK `ON DELETE SET NULL` (`ts_people.linked_candidate_id`, `ts_referrals.linked_candidate_id`) también pasan a `RESTRICT`. Si se dejaran, un DELETE físico borraría el vínculo. El rollback les devuelve `SET NULL`.

`ts_bat_sessions.ht_candidate_id` no tiene FK. Igual recibe `deleted_at`.

Un `DELETE` de `ht_candidates` falla siempre (`fase0_no_hard_delete`), tenga hijos o no. Ocultar es `UPDATE deleted_at`.

## Orden cuando se aplique de verdad

1. Respaldo verificado, con conteos, y OK de Kelly.
2. Correr la migración en una ventana corta: el cambio de FK toma un lock exclusivo breve en cada tabla hija.
3. Recién después, desplegar el código. Si el código sale antes, las lecturas piden `deleted_at` y fallan.

## Plan de prueba

Local, sin red hacia Supabase:

```bash
scripts/fase0-soft-delete-local-test.sh
```

El script arma un Postgres vacío en un directorio temporal y se niega a correr si `DATABASE_URL` apunta a Supabase. Comprueba:

1. Cero FK `CASCADE` o `SET NULL` hacia `ht_candidates`; 19 quedan en `RESTRICT` (17 cascade del fixture + 2 set null).
2. `DELETE` de un candidato con historial falla por la FK aunque se apague el trigger, y falla por el trigger con él prendido. Los hijos siguen.
3. `UPDATE deleted_at` esconde la fila en `ht_candidates_active` y no toca el historial.
4. `ht_audit_log` tiene `insert`, `soft_delete` y `restore`. Un `UPDATE` o `DELETE` del log falla.
5. El rollback devuelve las FK, quita columnas y log, y el `DELETE` físico vuelve a borrar en cascada.

En la app, después de `npx tsc --noEmit` y `npx next build`:

- `DELETE /api/headhunting/candidates/:id` y `DELETE /api/headhunting/candidates?id=` hacen `UPDATE deleted_at`. No borran hijos.
- `POST /api/headhunting/candidates/:id/restore` limpia `deleted_at`.
- Listados y lecturas de `ht_candidates` (y de las tablas hijas de la lista en `src/lib/soft-delete.ts`) no devuelven `deleted_at IS NOT NULL`. El dedup por correo sí ve los ocultos, para no crear un segundo registro.
- Borrar un adjunto oculta la fila y no borra el objeto del storage.
- El botón Agendar de HR Admin queda deshabilitado, con tooltip «Próximamente». La ruta responde 410 y no llama a Resend. El modal y el cuerpo de la ruta siguen en el código.
