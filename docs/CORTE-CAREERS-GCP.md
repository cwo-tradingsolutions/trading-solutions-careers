# Corte de careers.tradingsolutions.com a Google Cloud — runbook

_28-oct-2026. Paso 5 de `GCP-DESPLIEGUE.md`, ya con la infraestructura real de `wellness-experience-management`._

**Nada de esto se ejecuta sin el GO de Kelly.** Cada fase dice si toca tráfico real o no.

---

## 1. Dónde estamos (leído de GCP y DNS el 28-oct-2026)

| Pieza | Estado |
|---|---|
| DNS de `careers.tradingsolutions.com` | **Cloudflare**, CNAME a `70862a2cfd743a39.vercel-dns-016.com`. Todo el tráfico va a **Vercel**. |
| Cloud Run `prd-careers` | Desplegado, revisión `prd-careers-00002-jtq`, 100 % del tráfico. Ingress `internal-and-cloud-load-balancing`. |
| Imagen de `prd-careers` | `sha256:f0d42863…`, construida el **27-oct 14:45** con `_APP_URL=https://careers.tradingsolutions.com`. **No incluye** lo de después: el sitio público "talla mundial" (rev F, J/K), el arreglo `current_role` de cv-parse ni el de jsonb. |
| Balanceador | IP fija `prd-ip` = **136.81.187.112**. `prd-urlmap` manda `careers.tradingsolutions.com` a `prd-careers-backend` (NEG serverless). El puerto 80 redirige a HTTPS (`prd-redirect`). |
| Certificado | `prd-cert` (clásico, administrado) para careers **y** wxm. Está en `PROVISIONING`, con los dos dominios en `FAILED_NOT_VISIBLE`. |
| Cloud Scheduler | Las 4 tareas `ats-*` existen y están **PAUSED**. |
| Secretos `prd-careers-*` | Todos los que pide el manifiesto. El correo sale por Gmail (`jointheteam@`), no por otro proveedor. |
| Datos | `copiar-careers.cloudbuild.yaml` (repo `wxm-app`) copia Supabase `elevare-careers` y Neon a la base `careers` de Cloud SQL. Hay que correrlo otra vez en la ventana del corte. |
| Vercel | Sigue sirviendo producción. Los 4 crons de `vercel.json` siguen activos. |

### Por qué el certificado no sale

Un certificado administrado clásico se valida por HTTP: Google tiene que ver el dominio apuntando a **su** IP. Hoy careers apunta a Vercel y `wxm.tradingsolutions.com` no tiene registro DNS. Además, `prd-cert` agrupa los dos dominios, así que **wxm también bloquea a careers**.

Si se cambia el DNS sin más, careers queda **sin HTTPS entre 15 y 60 minutos** mientras Google emite el certificado. Hay candidatos con enlaces de prueba vigentes, así que no conviene.

**La solución es emitir el certificado antes del corte**, con autorización por DNS en Certificate Manager. Se agrega un CNAME `_acme-challenge` en Cloudflare, que no toca el tráfico actual. Google emite el certificado mientras Vercel sigue sirviendo, y el día del corte solo se cambia un registro.

---

## 2. Decisiones que necesito de Kelly

1. **Correo.** Todo el ATS sale por Gmail desde `jointheteam@`. No hay una segunda llave de correo. En staging, `MAIL_RECIPIENT_ALLOWLIST` limita los destinatarios porque esa base tiene correos reales.
2. **Qué código sale a producción.** Recomiendo construir desde `5d69996` (HEAD de esta rama), que ya incluye el sitio público nuevo. Hay dos cambios **sin commit** (`src/middleware.ts` + `src/lib/credential-config.ts`): el middleware responde 503 si algún secreto es un marcador de Vercel. ¿Entran o no?
3. **Ventana.** Entre la copia final de datos y el cambio de DNS, lo que se escriba en Vercel se pierde. Propongo una ventana corta (~30 min) fuera de horario de Bogotá, avisando a reclutamiento.

---

## 3. Fase A — preparación, sin impacto en producción

Se puede hacer cualquier día. Vercel sigue sirviendo.

### A1. Bajar el TTL en Cloudflare

En el registro `careers`, poner TTL de **1 min** (Auto en Cloudflare es 5 min, que también sirve). Hacerlo al menos un día antes, para que los resolvers ya tengan el TTL bajo el día del corte.

### A2. Certificado de careers con autorización DNS

```bash
G=~/google-cloud-sdk/bin/gcloud; P=wellness-experience-management
$G services enable certificatemanager.googleapis.com --project $P
$G certificate-manager dns-authorizations create careers-dns-auth \
  --domain careers.tradingsolutions.com --project $P
$G certificate-manager dns-authorizations describe careers-dns-auth --project $P \
  --format="value(dnsResourceRecord.name,dnsResourceRecord.data)"
```

Ese último comando devuelve un CNAME (`_acme-challenge.careers.tradingsolutions.com` → `….authorize.certificatemanager.goog.`). Se crea en Cloudflare **en modo DNS only (nube gris)**. No toca el tráfico.

```bash
$G certificate-manager certificates create careers-cert \
  --domains careers.tradingsolutions.com --dns-authorizations careers-dns-auth --project $P
# Esperar a state: ACTIVE (normalmente < 30 min)
$G certificate-manager certificates describe careers-cert --project $P --format="value(managed.state)"
```

Se cuelga del proxy con un mapa de certificados. Así careers queda separado de wxm, que puede seguir con `prd-cert` o tener su propia entrada después:

```bash
$G certificate-manager maps create prd-cert-map --project $P
$G certificate-manager maps entries create careers-entry --map prd-cert-map \
  --hostname careers.tradingsolutions.com --certificates careers-cert --project $P
$G compute target-https-proxies update prd-https-proxy --certificate-map prd-cert-map --project $P
```

> Cuando el proxy tiene un mapa de certificados, el mapa reemplaza a `sslCertificates`. Hoy nadie entra por ese proxy (ningún DNS apunta a la IP), así que el cambio no afecta a nadie. Para wxm hay que agregar después su propia `dns-authorization` y su entrada en el mapa.

### A3. Imagen nueva para producción

Según la decisión 2:

```bash
cd ~/Documents/trading-solutions-careers
G=~/google-cloud-sdk/bin/gcloud
$G builds submit . --config infra/gcp/careers.cloudbuild.yaml \
  --project wellness-experience-management --region us-west1 \
  --service-account projects/wellness-experience-management/serviceAccounts/sa-build@wellness-experience-management.iam.gserviceaccount.com \
  --substitutions _TAG=prd-$(git rev-parse --short HEAD),_APP_URL=https://careers.tradingsolutions.com
```

Se fija el digest resultante en `infra/gcp/prd-careers.service.yaml` (no el tag) y se aplica:

```bash
$G run services replace infra/gcp/prd-careers.service.yaml \
  --project wellness-experience-management --region us-west1
```

Esto no toca a usuarios reales: el servicio solo recibe tráfico por el balanceador, y el balanceador todavía no tiene DNS.

### A4. Ensayo completo contra el balanceador, sin cambiar DNS

Con el certificado en `ACTIVE`, se prueba el dominio real forzando la IP solo en esta máquina:

```bash
R="--resolve careers.tradingsolutions.com:443:136.81.187.112"
curl -sI $R https://careers.tradingsolutions.com/ | head -3
curl -s  $R https://careers.tradingsolutions.com/api/vacancies | head -c 300
```

Para recorrerlo en el navegador, agregar en `/etc/hosts` la línea `136.81.187.112 careers.tradingsolutions.com`, y quitarla al terminar. Lista de verificación:

1. El sitio público carga con el diseño nuevo, y una vacante abre y deja aplicar. **Hacerlo con una vacante de prueba**: escribe en Cloud SQL, no en Supabase.
2. `/hr-admin` pide login y entra.
3. Un enlace `/portal/[token]` y uno de `/assessments/[token]` existentes abren. Son los que tienen los candidatos.
4. Subir y descargar un CV, para probar el bucket `…-careers-archivos`.
5. Login con Google y LinkedIn. El dominio es el mismo, así que las URIs de redirección registradas siguen sirviendo.
6. Disparar cada cron a mano con `curl` y `Authorization: Bearer` contra la IP. Con las tareas en pausa, `gcloud scheduler jobs run` no aplica.

Si algo falla aquí, se corrige sin que nadie lo note.

---

## 4. Fase B — el corte (ventana, con GO de Kelly)

Orden pensado para que nada corra dos veces y no se pierdan datos.

| # | Paso | Cómo |
|---|---|---|
| B1 | Avisar a reclutamiento: no tocar el ATS durante ~30 min | — |
| B2 | Apagar los crons de Vercel | Vercel → proyecto `trading-solutions-careers` → Settings → Cron Jobs → **Disable**. Así no depende de un deploy. |
| B3 | Copia final de datos | `copiar-careers.cloudbuild.yaml` (repo `wxm-app`, comando en su cabecera). Comparar conteos de las tablas clave (`ht_candidates`, `ht_applications`, `neon.assessments`, `neon.vacancies`) entre origen y destino. |
| B4 | **Cambio de DNS** | Cloudflare: borrar el CNAME `careers` → Vercel y crear **A `careers` → `136.81.187.112`**, **DNS only (nube gris)**, TTL 1 min. |
| B5 | Verificar | `dig +short careers.tradingsolutions.com` debe dar `136.81.187.112`. `curl -sI https://careers.tradingsolutions.com` debe responder sin cabeceras `x-vercel-*`. Repetir la lista de A4. |
| B6 | Reanudar crons en GCP | `bash infra/gcp/scheduler.sh reanudar` |
| B7 | Avisar que el ATS está arriba | — |

**Por qué DNS only:** con la nube naranja el tráfico pasaría por Cloudflare antes de llegar a Google. Con DNS only, Cloudflare solo resuelve el nombre y todo el servicio queda en GCP.

### Vuelta atrás

Hasta que se borre el proyecto de Vercel, volver es: restaurar el CNAME a Vercel, pausar los schedulers (`gcloud scheduler jobs pause …`) y reactivar los crons de Vercel. Lo que se haya escrito en Cloud SQL después del corte **no vuelve solo** a Supabase/Neon. Por eso conviene decidir la vuelta atrás en la primera hora, no al día siguiente.

---

## 5. Fase C — cierre (una semana después, sin incidentes)

1. En Vercel: quitar el dominio `careers.tradingsolutions.com` del proyecto y después borrar el proyecto. Es irreversible; requiere GO de Kelly.
2. En el repo: borrar `vercel.json` y `.vercel/`, y quitar del manifiesto el comentario "valores que hoy viven en Vercel".
3. Supabase `elevare-careers` y Neon: pausarlos (no borrarlos) hasta confirmar que ya nadie los lee.
4. Rotar llaves (`MIGRACION-GCP.md` §6): `ADMIN_SECRET` (ya existe `prd-careers-ADMIN_SECRET-next-20261027`), `CRON_SECRET` (después, `python3 -I infra/gcp/scheduler_cabeceras.py --apply`), `WXM_SERVICE_SECRET` y las de OAuth.
5. Separar los buckets de staging y producción (pendiente de la auditoría del 27-oct).
