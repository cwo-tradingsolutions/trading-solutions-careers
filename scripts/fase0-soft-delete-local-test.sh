#!/usr/bin/env bash
# Prueba la migración de Fase 0 contra un Postgres vacío, en localhost.
# Se niega a tocar cualquier host que no sea local y cualquier base que
# no se llame fase0_*. No usa el proyecto Supabase de producción.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for var in DATABASE_URL SUPABASE_DB_URL POSTGRES_URL; do
  val="${!var:-}"
  case "$val" in
    *mojbhvphztnadndhnraf*|*supabase.co*|*supabase.com*)
      echo "rechazado: \$$var apunta a una base real" >&2
      exit 1
      ;;
  esac
done

PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
if [[ ! -x "$PG_BIN/initdb" ]]; then
  echo "no está initdb en $PG_BIN" >&2
  exit 1
fi

WORKDIR="$(mktemp -d /tmp/fase0-pg.XXXXXX)"
PORT="${FASE0_PG_PORT:-54341}"
cleanup() {
  if [[ -f "$WORKDIR/data/postmaster.pid" ]]; then
    "$PG_BIN/pg_ctl" -D "$WORKDIR/data" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$WORKDIR/data" --auth=trust --username=postgres >/dev/null
"$PG_BIN/pg_ctl" -D "$WORKDIR/data" -l "$WORKDIR/pg.log" -o "-p $PORT -k $WORKDIR" start >/dev/null
"$PG_BIN/createdb" -h "$WORKDIR" -p "$PORT" -U postgres fase0_local

PSQL=("$PG_BIN/psql" -h "$WORKDIR" -p "$PORT" -U postgres -d fase0_local -v ON_ERROR_STOP=1)

echo "== fixture =="
"${PSQL[@]}" -f "$ROOT/scripts/fase0-soft-delete-fixture.sql"
echo "== migración =="
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261029_fase0_soft_delete.sql"
echo "== asserts =="
"${PSQL[@]}" -f "$ROOT/scripts/fase0-soft-delete-assert.sql"
echo "== FK reescritas =="
"${PSQL[@]}" -c "select child_table, conname, original_def from private.ht_fk_rewrite_backup order by child_table, conname;"
echo "== rollback =="
"${PSQL[@]}" -f "$ROOT/supabase/rollbacks/20261029_fase0_soft_delete_rollback.sql"
echo "== asserts rollback =="
"${PSQL[@]}" -f "$ROOT/scripts/fase0-soft-delete-assert-rollback.sql"
echo "OK fase0 local"
