# Supabase autohospedado en GCP — plan de ejecución

_Opción B, decidida el 21-oct-2026. Cuenta: Workspace de Trading Solutions (`cwo@`)._

Este documento es el paso 5 del plan de `MIGRACION-GCP.md`. El paso 2 (Cloud Run) está en `GCP-DESPLIEGUE.md` y es independiente: conviene hacerlo primero, contra la Supabase actual, para no mover cómputo y datos en el mismo corte.

---

## 1. Arquitectura

**Una VM de Compute Engine con el `docker-compose` oficial de Supabase. No GKE, no Cloud SQL.**

El porqué del "no Cloud SQL" está en `MIGRACION-GCP.md`: Supabase autohospedado necesita `superuser`, `bypassrls` y crear sus propios roles, y Cloud SQL no lo permite. El Postgres va dentro del stack, sobre un disco persistente.

El porqué del "no GKE": el camino oficialmente soportado es `docker-compose`. Kubernetes agrega una capa que hay que operar, y con dos proyectos y 72 personas no compra nada.

Son **dos proyectos de Supabase**, así que son **dos stacks**:

| Proyecto hoy | Org | Qué contiene | Alcance actual |
|---|---|---|---|
| `zceglqnsebffghvciasd` (wxm) | **Trading Solutions** | 64 empleados, expedientes, desempeño, aprendizaje | Accesible ✓ |
| `mojbhvphztnadndhnraf` (elevare-careers) | **HUBI** | candidatos, vacantes, funnel, batería | **NO accesible ✗** |

> **Bloqueo confirmado el 21-oct-2026.** La cuenta de Supabase conectada solo ve la organización *Trading Solutions*, y ahí hay **un solo proyecto**: `wxm`. La base del ATS —con todos los datos de candidatos— vive en la organización **HUBI** y no se alcanza desde esta cuenta.
>
> O sea que hoy se puede planear y ejecutar la migración de WXM, pero **la del ATS no**: no hay forma de volcarla. Antes de tocar el ATS hay que o bien conectar la cuenta dueña de HUBI, o transferir ese proyecto a la organización de Trading Solutions — que además es lo que corresponde, porque los datos de candidatos de Trading no deberían estar en la organización de otra empresa.

Los dos caben en una sola VM. El mínimo documentado es 4 GB y 2 núcleos **por stack**, así que una `e2-standard-4` (4 vCPU, 16 GB) los sostiene con margen. Importante: el stack solo corre sobre Linux — Debian/Ubuntu o RHEL/CentOS/Fedora.

---

## 2. Qué se migra y qué no

Esto es lo que más sorpresas da, así que va primero.

**Se migra con los volcados de la CLI:** esquema, datos, roles, políticas RLS, funciones, triggers y la tabla `auth.users` con sus contraseñas.

**NO se migra y hay que hacerlo aparte:**

| Qué | Dónde está hoy | Cómo se resuelve |
|---|---|---|
| **Los archivos de Storage** | 4 buckets: `personal-docs`, `personal-fotos` (WXM); `candidate-files`, `proctoring-snapshots` (ATS) | Descargar y volver a subir, bucket por bucket. Los volcados de SQL traen las *filas*, no los archivos. |
| **Secretos JWT y llaves de API** | Supabase gestionado | Se generan nuevos en el stack. Hay que repartirlos a las apps. |
| **Proveedores OAuth** | Config del proyecto | Reconfigurar en el `.env` y actualizar las URLs de redirección, que hoy apuntan a `*.supabase.co`. |
| **Configuración de SMTP** | Config del proyecto | Rehacer. |

**Consecuencia que hay que avisar antes, no después:** los secretos JWT cambian, así que **todas las sesiones abiertas mueren y todo el mundo tiene que volver a entrar**. Las contraseñas siguen sirviendo porque `auth.users` viaja con sus hashes; lo que se pierde es la sesión. Para WXM eso son las 64 personas. Conviene hacerlo un viernes en la tarde y avisar el jueves.

**Versión de Postgres — confirmado, no es hipótesis.** Leído del proyecto el 21-oct-2026: `wxm` corre **Postgres 17.6.1** (engine 17, canal GA, región `us-west-2`). El autohospedado trae **15** por defecto. Hay que fijar la imagen en 17 o probar el restore en una instancia de prueba. Si esto se descubre el día del corte, el corte se cae.

**Extensiones — buena noticia.** Las instaladas son solo cinco, y todas son estándar del stack: `pgcrypto`, `pg_stat_statements`, `supabase_vault`, `uuid-ossp` y `plpgsql`. No hay nada exótico (ni PostGIS, ni `pg_cron`, ni `vector`), así que el restore no debería tropezar con extensiones faltantes.

---

## 3. Antes de poder empezar

Dos cosas que no dependen de nosotras:

1. **Que el administrador del Workspace habilite Google Cloud** para `cwo@tradingsolutions.com`. En un Workspace, GCP no viene activo por defecto.
2. **Una cuenta de facturación** con tarjeta corporativa. Sin eso, la VM no arranca.

Y una que sí depende de nosotras: **instalar `gcloud`**. Tu Mac no lo tiene (tampoco Homebrew). Es una descarga de Google que se instala en tu carpeta de usuario, sin tocar el sistema. Cuando me digas, te paso el comando exacto o lo corro yo.

---

## 4. Secuencia

El orden está pensado para que cada paso sea reversible hasta el último.

**4.1 Red y VM**
Crear la VM con disco persistente aparte del disco de arranque — los datos nunca en el disco del sistema. Sin IP pública para Postgres: el acceso va por IAP o por un túnel, nunca `0.0.0.0/0` al 5432.

**4.2 Levantar los dos stacks vacíos**
Clonar `supabase/supabase`, un `docker-compose` por proyecto con puertos distintos, generar secretos nuevos. Verificar que Studio abre antes de meter un solo dato.

**4.3 Ensayo general con datos reales**
Volcar `zceglqnsebffghvciasd` con la CLI (roles, esquema, datos), restaurar en el stack, y **probar WXM apuntando al stack nuevo desde un despliegue de prueba**. Aquí es donde aparecen las extensiones faltantes y el desajuste de versión de Postgres, no el día del corte.

**4.4 Copiar los 4 buckets**
Y verificar contra el conteo de filas de `storage.objects`: si la tabla dice 312 archivos, en el bucket nuevo tienen que estar los 312.

**4.5 Respaldos — antes del corte, no después**
Esto es lo que reemplaza lo que Supabase hacía por nosotras, y es la razón por la que esta opción cuesta más:
- Snapshot diario del disco persistente, con retención de 30 días.
- `pg_dump` nocturno a un bucket de Cloud Storage, con versionado y retención.
- **Una restauración de prueba al mes.** Un respaldo que nunca se restauró no es un respaldo; es un archivo.

**4.6 Monitoreo**
Uptime check contra el health de cada stack, alerta por correo a `cwo@` si cae, y alerta de disco al 80%. Sin esto te enteras de que se cayó porque alguien no pudo entrar.

**4.7 Corte**
Repintar las variables de las apps en Cloud Run hacia el stack nuevo, redesplegar, avisar a la gente que vuelva a entrar. El Supabase gestionado se deja **vivo y pagando** al menos dos semanas: es la vuelta atrás.

---

## 5. Vuelta atrás

Mientras el Supabase gestionado siga encendido, deshacer es cambiar las variables de entorno de vuelta y redesplegar. Lo único que no se recupera son los datos escritos en el stack nuevo después del corte — por eso el corte va en fin de semana y por eso se avisa.

El punto de no retorno es el día que se apague el proyecto gestionado. No antes.

---

## 6. Lo que sigue pendiente y afecta este plan

- **Las 13 rutas en Neon.** El ATS no está solo en Supabase: `/api/portal/[token]` y `/api/assessments/[token]` —las pantallas del candidato— siguen en Neon. O se consolidan antes, o hay que migrar Neon también.
- **El Vercel KV de Career Lines OS.** Encuestas y evaluaciones de onboarding viven ahí. Reemplazo: Memorystore. El código ya acepta un `REDIS_URL` normal.
- **El ATS está en la organización HUBI**, no en Trading Solutions. Este es el momento de corregirlo.

---

Fuentes consultadas el 21-oct-2026: [Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker), [Restore a Platform Project to Self-Hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform), [Can I run database in RDS?](https://github.com/orgs/supabase/discussions/4993), [Configure External PostgreSQL for Supabase](https://github.com/orgs/supabase/discussions/33843).
