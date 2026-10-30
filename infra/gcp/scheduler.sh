#!/bin/bash
# Tareas programadas del ATS en Cloud Scheduler: las mismas 4 de vercel.json,
# a la misma hora (UTC), con el header que ya validan las rutas
# (Authorization: Bearer CRON_SECRET). Se crean EN PAUSA; se reanudan el día
# del cambio, en la misma ventana en que se quitan los crons de Vercel, para
# que nunca corran dos veces (correos duplicados a candidatos).
#
#   bash infra/gcp/scheduler.sh            # crea o actualiza, en pausa
#   bash infra/gcp/scheduler.sh reanudar   # día del cambio, con GO de Kelly
set -euo pipefail
G=~/google-cloud-sdk/bin/gcloud
P=wellness-experience-management
R=us-west1
BASE=https://careers.tradingsolutions.com

TAREAS=(
  "ats-run-reminders|/api/cron/run-reminders|0 */6 * * *"
  "ats-digest-email|/api/cron/digest-email|0 13 * * 1-5"
  "ats-morning-brief|/api/cron/morning-brief|0 11 * * *"
  "ats-sync-contactos|/api/cron/sync-contactos|15 * * * *"
)

if [ "${1:-}" = reanudar ]; then
  for t in "${TAREAS[@]}"; do
    $G scheduler jobs resume "${t%%|*}" --location $R --project $P >/dev/null && echo "reanudada: ${t%%|*}"
  done
  exit 0
fi

# El secreto va en el header de la tarea; solo los dueños del proyecto lo ven.
CRON=$($G secrets versions access latest --secret prd-careers-CRON_SECRET --project $P)
for t in "${TAREAS[@]}"; do
  IFS='|' read -r NOMBRE RUTA HORARIO <<<"$t"
  ACCION=create
  $G scheduler jobs describe "$NOMBRE" --location $R --project $P >/dev/null 2>&1 && ACCION=update
  $G scheduler jobs $ACCION http "$NOMBRE" --location $R --project $P \
    --schedule "$HORARIO" --time-zone "Etc/UTC" --uri "$BASE$RUTA" --http-method GET \
    --attempt-deadline 600s --max-retry-attempts 1 \
    --$( [ $ACCION = create ] && echo headers || echo update-headers )="Authorization=Bearer $CRON" >/dev/null
  [ $ACCION = create ] && $G scheduler jobs pause "$NOMBRE" --location $R --project $P >/dev/null
  echo "$ACCION: $NOMBRE ($HORARIO UTC) → $RUTA"
done
unset CRON
echo "Listo. Quedan en pausa hasta el día del cambio."
