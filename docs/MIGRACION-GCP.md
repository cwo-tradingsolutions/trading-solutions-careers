# Migración de las apps de Trading Solutions a Google Cloud

_Evaluación técnica · 20-oct-2026 · preparada para la conversación con Franklin Castellar (IT)._

Kelly pidió evaluar mover todo lo que hoy vive en **Vercel + Supabase** a **Google Cloud**. Este documento dice qué hay, qué cuesta moverlo, y qué recomiendo. Las cifras salen de contar sobre el código, no de estimaciones.

---

## 1. Qué hay hoy

Tres aplicaciones Next.js 14, todas desplegadas en Vercel:

| App | Carpeta | Rutas de API | Base de datos | Para qué |
|---|---|---|---|---|
| **ATS / Careers** | `trading-solutions-careers` | 166 | Supabase **y** Neon | Reclutamiento: portal público de vacantes, funnel, batería de pruebas, informes |
| **WXM** | `wxm-app` | 8 | Supabase | Desempeño, 9-box, aprendizaje, núcleo de personas |
| **Career Lines OS** | `Wellness-app` | 21 | **Vercel KV** (Redis) | Líneas de carrera, diagnóstico 360, encuestas |

Dependencias de plataforma que hay que reemplazar:

- **4 cron de Vercel** (solo en el ATS): recordatorios cada 6 h, digest diario 13:00 UTC, morning-brief 11:00 UTC, sincronización de contactos cada hora.
- **Deployment Protection de Vercel**, que hoy es el candado del sitio de WXM mientras se migran datos reales (ver `wxm-app/SEGURIDAD.md`).
- **Optimización de imágenes de Vercel**, con dominios remotos permitidos (`images.unsplash.com`, `cdn.prod.website-files.com`).
- **`outputFileTracingIncludes`** para que `pdfkit` encuentre sus fuentes al generar el informe de vacante.
- **Vercel KV** en Career Lines OS: `surveyStore`, `exitSurveyStore` y `onboardingEvalStore` guardan ahí encuestas y evaluaciones de onboarding. Es Redis y no existe en GCP; el reemplazo es **Memorystore**. El código ya acepta un `REDIS_URL` normal como alterno, así que el cambio es de datos, no de código.

Un dato que importa para el alcance: **ninguna de las 195 rutas usa Edge runtime.** Todas declaran `runtime = "nodejs"`. Eso significa que corren sin cambios en un contenedor normal.

---

## 2. La parte fácil: Vercel → Cloud Run

Es un cambio de empaquetado, no de código.

| Hoy en Vercel | En GCP |
|---|---|
| Despliegue de Next.js | **Cloud Run** con `output: "standalone"` y un Dockerfile |
| 4 cron de `vercel.json` | **Cloud Scheduler** pegándole a las mismas URLs, con token en la cabecera |
| Deployment Protection | **IAP** (Identity-Aware Proxy) delante del servicio |
| Variables de entorno | **Secret Manager** |
| Git push → deploy | **Cloud Build** desde el mismo repo |
| CDN e imágenes | **Cloud CDN**, o `images.unoptimized` si no se quiere montar el loader |

Lo único que exige atención es `pdfkit`: en Vercel hace falta `outputFileTracingIncludes` porque el rastreo de archivos no ve su `require` dinámico. En un contenedor el problema desaparece — las fuentes están en la imagen.

**Esfuerzo: días.** Un Dockerfile por app, un pipeline de Cloud Build, los 4 Scheduler y las variables en Secret Manager.

---

## 3. La parte difícil: Supabase → ?

Aquí está el 90% del riesgo. Supabase no es "una base Postgres": son cuatro productos, y el código usa los cuatro.

| Qué se usa | Cuánto | Si se va a Cloud SQL "pelado" |
|---|---|---|
| Consultas `supabase.from(...)` | **645 llamadas** | Eso es **PostgREST**, no SQL. Cloud SQL no lo trae. Habría que reescribir las 645. |
| Supabase Auth | 24 llamadas: `signInWithPassword`, `admin.createUser`, `resetPasswordForEmail`, `onAuthStateChange` | Identity Platform existe, pero la API es distinta. Reescritura + importar los hashes de contraseña. |
| Supabase Storage | 3 buckets: `personal-docs`, `personal-fotos`, `candidate-files` | Cloud Storage sirve y también firma URLs, pero cambia el código de cada subida y descarga. |
| Postgres puro | 55 tablas, 72 políticas RLS, 7 funciones | **Esto sí migra tal cual.** RLS es Postgres estándar, no una invención de Supabase. |

Lo que **no** se usa, y que simplifica mucho: no hay Realtime (las 18 apariciones de `.channel` resultaron ser una columna con ese nombre, no suscripciones) y no hay Edge Functions.

### Las tres opciones

**A. Cloud SQL + reescribir la capa de datos.**
Lo más "nativo de GCP" y lo más caro. Son 645 puntos de reescritura, más Auth, más Storage, en tres apps en producción con datos reales. No es una migración, es rehacer el acceso a datos. Semanas de trabajo y mucho riesgo de regresión. **No lo recomiendo.**

**B. Autohospedar Supabase sobre GCP.** ← elegida el 21-oct-2026
Supabase es open source y se despliega con su `docker-compose` oficial. Las 645 llamadas, el RLS, el Auth y el Storage siguen funcionando **sin tocar una línea**.

> **Corrección del 21-oct-2026.** La primera versión de este documento decía "GKE o Compute Engine, con **Cloud SQL** como Postgres detrás". **Eso no funciona.** Supabase autohospedado necesita un Postgres donde tenga `superuser` y `bypassrls`, y crear roles propios (`supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, `authenticator`). Cloud SQL no da superusuario y no tiene `pgjwt` en su lista de extensiones permitidas. La única forma es un Postgres **bajo control total**: el contenedor del propio stack, sobre una VM con disco persistente.
>
> La consecuencia práctica importa: con Cloud SQL los respaldos, el failover y la recuperación a un punto en el tiempo venían de fábrica. Con Postgres en una VM, **no existe ninguna de las tres hasta que las montemos**. Pasan de ser una casilla a ser trabajo nuestro.

Lo que hay que aceptar: actualizaciones, respaldos, monitoreo y disponibilidad quedan de nuestro lado. Ya no los hace Supabase.

**C. Mover solo el cómputo y dejar la base donde está.**
Las apps en Cloud Run, la base en Supabase gestionado. Es el 30% del esfuerzo y resuelve "que la app viva en infraestructura corporativa". Si lo que molesta es que el *hosting* esté en cuentas personales, esto ya lo arregla. Si el requisito es que **los datos** estén bajo control de la empresa, no alcanza.

---

## 4. Costo, a grandes rasgos

Son órdenes de magnitud para dimensionar la conversación, no una cotización.

| | Hoy | Opción B (autohospedado) | Opción C (mixta) |
|---|---|---|---|
| Cómputo apps | Vercel Pro ~US$20 | Cloud Run ~US$20–40 | Cloud Run ~US$20–40 |
| Base de datos | Supabase Pro ~US$25 | VM `e2-standard-4` ~US$100 | Supabase Pro ~US$25 |
| Disco + snapshots | — | ~US$20 | — |
| Cloud Storage | incluido | ~US$5 | incluido |
| **Total/mes** | **~US$45** | **~US$145–165** | **~US$50–70** |
| Respaldos y failover | de fábrica | **los montamos nosotros** | de fábrica |
| Quién responde si se cae | Supabase | **nosotros** | Supabase |

La diferencia real no es la factura, es el costo operativo nuevo. Si la razón para mover es gobierno del dato e infraestructura corporativa, se justifica. Si es ahorrar, la migración cuesta más de lo que ahorra.

---

## 5. Lo que hay que resolver *antes* de mover

**El ATS corre sobre dos bases de datos a la vez.** 126 rutas usan Supabase (esquema `ht_*` / `ts_*`) y **20 siguen en Neon** con el esquema viejo (`vacancies`, `talent_pool`, `assessments`), incluidas rutas vivas como `/api/vacancies`, `/api/talent-pool`, `/api/cv-parse` y `/api/portal/[token]`. Existe hasta `/api/headhunting/sync-from-neon` para sincronizarlas.

Migrar así significa mover dos bases y mantener la sincronización durante el corte. **Consolidar en Supabase primero y mover después** es más barato que hacer las dos cosas a la vez.

---

## 6. Orden de trabajo sugerido

1. **Consolidar Neon → Supabase** en el ATS. Elimina una base entera del alcance.
2. **Contenerizar las tres apps** y levantarlas en Cloud Run contra la Supabase actual. Reversible: si algo falla, se vuelve a Vercel sin tocar datos.
3. **Mover los 4 cron** a Cloud Scheduler y verificar una semana completa.
4. **Decidir B o C** con la factura real de los pasos 2 y 3 sobre la mesa.
5. Si es B: montar Supabase autohospedado, migrar con `pg_dump`/`pg_restore`, copiar los 3 buckets, cortar en una ventana de fin de semana.
6. **Rotar todas las llaves** al cerrar — Supabase, Google OAuth, `ADMIN_SECRET`, `WXM_SERVICE_SECRET`, Resend. Es el momento natural para hacerlo y ya hay una `service_role` pendiente de rotar.

---

## 7. Qué necesita Franklin para decidir

- ¿El requisito es que el **hosting** sea corporativo, o que los **datos** estén en infraestructura de la empresa? De eso depende si basta la opción C.
- ¿Hay alguien en IT que opere un Postgres y un GKE, o se prefiere pagar servicio gestionado?
- ¿Existe ya una organización de Google Cloud de Trading Solutions con facturación, o hay que crearla?
- ¿Qué ventana de indisponibilidad tolera el ATS? Hay procesos de selección activos y candidatos con enlaces de prueba vigentes.
