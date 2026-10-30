# Despliegue en Cloud Run — runbook

_Paso 2 del plan de `MIGRACION-GCP.md`. Escrito para que lo ejecute IT._

Este paso levanta las tres apps en Cloud Run **contra la Supabase actual**. No toca datos y es reversible: si algo falla, Vercel sigue sirviendo y no hubo que mover nada.

## Lo que ya está en el repo

| Archivo | Qué hace |
|---|---|
| `Dockerfile` en cada app | Build en tres etapas; la imagen final solo lleva el servidor standalone |
| `.dockerignore` en cada app | Deja fuera `node_modules`, `.next`, `.git`, `.env*`, parches y SQL |
| `output: "standalone"` en cada `next.config` | Se activa **solo** con `BUILD_TARGET=container` |

El interruptor por variable es a propósito: en Vercel esa variable no existe, el valor queda `undefined` y el build sigue siendo exactamente el de hoy. Se puede trabajar en la migración sin congelar los despliegues normales.

Verificado el 21-oct-2026: WXM compila en modo contenedor y genera `.next/standalone` (27 MB, con su propio `node_modules`).

## 0. El entorno, confirmado el 21-oct-2026

| | |
|---|---|
| Organización | `tradingsolutions.com` · ID 891073484107 |
| Proyecto | `smooth-bonfire-w9hrj` · número 330104072511, dentro de una carpeta de la organización |
| Facturación | cuenta `0189C7-F5843D-071E0F`, activa |
| Región | **`us-west1`** (Oregon) |

La región no es arbitraria: los dos proyectos de Supabase corren en `us-west-2`, que también es Oregon. Poner el cómputo al lado de los datos ahorra latencia en cada consulta, y el ATS hace muchas por pantalla.

Desde Cloud Shell no hace falta `gcloud auth login`: ya entra autenticado como `cwo@`.

```bash
gcloud config set project smooth-bonfire-w9hrj
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com
```

```bash
gcloud artifacts repositories create trading --repository-format=docker --location=us-west1
```

## 1. Secretos

Las variables se parten en dos grupos, y la diferencia importa:

- **`NEXT_PUBLIC_*`** se incrustan en el bundle del navegador **en tiempo de build**. Van como `--build-arg`, no como variable de ejecución. Si se pasan solo en ejecución, el cliente queda apuntando a `undefined`.
- **Todas las demás** se inyectan en ejecución desde Secret Manager. Nunca como build-arg: quedarían dentro de la imagen.

Crear cada secreto:

```bash
printf '%s' 'VALOR' | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-
```

Inventario por app, sacado del código:

**ATS / Careers** — `ADMIN_SECRET`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `DATABASE_URL`, `DIGEST_RECIPIENT`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_API_KEY`, `EMAIL_BCC`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_MAILBOX_ALLOWED_EMAILS`, `HANDOFF_EMAIL`, `INTERNAL_NEWSLETTER_EMAIL`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_COMPANY_ID`, `MARY_PSICO_EMAIL`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VACANCY_ID_FULLSTACK_JUNIOR`, `WXM_SERVICE_SECRET`

`GOOGLE_MAILBOX_ALLOWED_EMAILS` is the comma-separated allowlist for the ATS Google mailbox. The OAuth callback stores tokens only when the verified Google account is on this list. Unset or empty fails closed and does not overwrite the production token (row id = 1). Expected value: `jointheteam@tradingsolutions.com`. Comparison is case-insensitive. This hotfix does not set the variable in Vercel or GCP; ops adds it before anyone reconnects Gmail.
Build-args: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**WXM** — `ATS_BASE_URL`, `ENCUESTA_BCC`, `ENCUESTA_FROM`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TALLY_WEBHOOK_SECRET`, `WXM_SERVICE_SECRET`
Build-args: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Career Lines OS** — `ANTHROPIC_API_KEY`, `GMAIL_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `REDIS_URL`, `WOS_360_SECRET`, `WOS_SESSION_SECRET`
Build-args: `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_POSTHOG_KEY`

## 2. Construir y desplegar

Una vez por app. El ejemplo es el ATS:

```bash
gcloud builds submit --tag us-west1-docker.pkg.dev/TU_PROYECTO_GCP/trading/careers:v1 --build-arg NEXT_PUBLIC_SUPABASE_URL=https://mojbhvphztnadndhnraf.supabase.co --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=LA_ANON_KEY
```

```bash
gcloud run deploy careers --image us-west1-docker.pkg.dev/TU_PROYECTO_GCP/trading/careers:v1 --region us-west1 --port 8080 --cpu 1 --memory 1Gi --min-instances 0 --max-instances 10 --timeout 300 --set-secrets ADMIN_SECRET=ADMIN_SECRET:latest,CRON_SECRET=CRON_SECRET:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,RESEND_API_KEY=RESEND_API_KEY:latest,DATABASE_URL=DATABASE_URL:latest
```

Sobre los flags: `--timeout 300` cubre con margen los `maxDuration` del código (60 s y 120 s). `--min-instances 0` deja que escale a cero y no cobre cuando nadie entra; si molesta el arranque en frío en el portal público de vacantes, subirlo a 1.

## 3. Los 4 cron

Hoy están en `vercel.json` y Vercel los corre en **UTC**. Cloud Scheduler acepta zona horaria, así que de paso quedan legibles en hora de Bogotá. Las dos columnas son el mismo momento:

| Tarea | Vercel (UTC) | Bogotá |
|---|---|---|
| `run-reminders` | `0 */6 * * *` | cada 6 h |
| `digest-email` | `0 13 * * 1-5` | 8:00 L-V |
| `morning-brief` | `0 11 * * *` | 6:00 diario |
| `sync-contactos` | `15 * * * *` | cada hora en :15 |

Las cuatro rutas aceptan `Authorization: Bearer ${CRON_SECRET}`, que es exactamente lo que mandaba Vercel. No hay que tocar código:

```bash
gcloud scheduler jobs create http careers-run-reminders --location us-west1 --schedule "0 */6 * * *" --time-zone "America/Bogota" --uri "https://CAREERS_URL/api/cron/run-reminders" --http-method GET --update-headers "Authorization=Bearer EL_CRON_SECRET"
```

Repetir para los otros tres cambiando nombre, `--schedule` y `--uri`.

**Importante:** no crear los jobs hasta que Cloud Run esté sirviendo y verificado. Si quedan activos en los dos lados al mismo tiempo, el digest y el morning-brief salen duplicados al correo.

### AI interview rescore (do not create yet)

Automatic rescore needs a Cloud Scheduler job on Cloud Run. It is not a Vercel Cron, and this hotfix does not create the job. The route accepts GET and POST. The AI interview stays off until `AI_INTERVIEW_ENABLED` is set; the route then returns 503 and does not call ElevenLabs.

Use OIDC so Cloud Run IAM accepts the call. If IAP is in front and replaces `Authorization`, send the cron secret in `X-Cron-Secret` instead. `CRON_SECRET` must be at least 16 characters. At integration time it should be added to `AUTH_SECRET_NAMES` in `hr-admin-secrets.ts` (that file belongs to #29 and is not edited here).

```bash
gcloud scheduler jobs create http careers-rescore-ai-interviews --location us-west1 --schedule "*/10 * * * *" --time-zone "America/Bogota" --uri "https://CAREERS_URL/api/cron/rescore-ai-interviews" --http-method POST --headers "X-Cron-Secret=EL_CRON_SECRET" --oidc-service-account-email SCHEDULER_SA --oidc-token-audience "https://CAREERS_URL"
```

## 4. Verificación antes de cortar

1. El portal público de vacantes carga y se puede aplicar.
2. `/hr-admin` pide login y entra con la clave de siempre.
3. En **Personal** de WXM cargan fotos y documentos — eso prueba `SUPABASE_SERVICE_ROLE_KEY`.
4. Disparar cada cron a mano con `gcloud scheduler jobs run` y revisar los logs.
5. Dejar correr **una semana** con los cron en GCP y los de Vercel apagados, antes de mover el dominio.

## 5. Cortar

Apuntar el dominio a Cloud Run y recién entonces apagar los proyectos de Vercel. Hasta ese momento la vuelta atrás es cambiar el DNS.

---

## Dos cosas que hay que resolver aparte

**Career Lines OS guarda datos en Vercel KV.** `surveyStore`, `exitSurveyStore` y `onboardingEvalStore` guardan encuestas y evaluaciones de onboarding en el KV de Vercel, que es Redis y no existe en GCP. No es caché: son datos que hay que migrar.
La buena noticia es que el código ya trae un camino alterno — si no encuentra `KV_REST_API_URL`, usa `REDIS_URL` y parsea una URL `redis://` normal. Con **Memorystore for Redis** debería funcionar sin tocar código; falta exportar las claves del KV actual e importarlas.

**El ATS sigue con dos bases.** 13 rutas vivas pegan todavía a Neon, incluidas `/api/portal/[token]` y `/api/assessments/[token]`, que son las pantallas que ven los candidatos con enlaces ya enviados. Mientras eso siga así hay que llevar `DATABASE_URL` a GCP y mantener Neon vivo. Consolidar en Supabase antes del corte quita una base entera del alcance — está detallado en `MIGRACION-GCP.md`.
