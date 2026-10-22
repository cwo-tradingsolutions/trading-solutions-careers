# Consolidar Neon en Supabase — plan

_21-oct-2026. Paso 1 del plan de `MIGRACION-GCP.md`: quita una base entera del alcance del corte a Google Cloud._

## Por qué esto va antes de la migración

El ATS corre hoy sobre **dos bases a la vez**: Supabase (126 rutas, esquema `ht_*` / `ts_*`) y Neon (15 rutas, esquema viejo). Si migramos así, hay que mover dos bases, mantener las dos sincronizadas durante el corte y arrastrar `DATABASE_URL` a Google Cloud.

Y no es código muerto. Dos de las rutas de Neon son **las pantallas que ve el candidato**: `/api/portal/[token]` y `/api/assessments/[token]`, con enlaces ya enviados a gente que está en proceso.

## Las 15 rutas y lo que tocan

| Ruta | Tablas de Neon |
|---|---|
| `/api/talent-pool` | `talent_pool` |
| `/api/talent-pool/[id]` | `talent_pool`, `matching_results` |
| `/api/cv-parse` | `talent_pool` |
| `/api/candidates/import` | `talent_pool`, `applications` |
| `/api/vacancies` | `vacancies` |
| `/api/vacancies/[id]` | `vacancies`, `matching_results` |
| `/api/matching` | `talent_pool`, `vacancies`, `matching_results` |
| `/api/assessments` | `assessments`, `assessment_tokens`, `recruiter_config` |
| `/api/assessments/[token]` | `assessments`, `assessment_tokens`, `vacancies` |
| `/api/portal/[token]` | `applications`, `assessment_tokens`, `vacancies` |
| `/api/recruiter-config` | `recruiter_config` |
| `/api/agents/interview-prep` | `talent_pool`, `vacancies`, `applications`, `assessment_tokens` |
| `/api/agents/interview-synthesize` | `applications`, `assessment_tokens` |
| `/api/agents/market-research` | `vacancies` |
| `/api/assessment-preview` | `assessment_preview_runs`, `assessment_preview_responses` |

## El cruce contra Supabase

Aquí está la decisión de fondo. Las tablas de Neon se parten en tres grupos:

### Grupo A — ya existe el equivalente en Supabase, con otro nombre y otra forma

| Neon | Supabase | Filas hoy en Supabase |
|---|---|---|
| `talent_pool` | `ht_candidates` | 950 |
| `vacancies` | `ht_vacancies` | 23 |
| `recruiter_config` | `ts_recruiters` | 1 |

Estas **no se copian, se reescriben**. Ya existe `/api/headhunting/sync-from-neon`, que mapea `talent_pool` → `ht_candidates` por correo; sirve de referencia del mapeo de campos, no como solución (es de una sola pasada).

El trabajo real es cambiar las consultas de esas rutas para que lean el esquema nuevo. Es lo más laborioso del plan y donde está casi todo el riesgo.

### Grupo B — no existe nada equivalente, hay que crearlas

`assessment_tokens` · `matching_results` · `applications` · `assessment_preview_runs` · `assessment_preview_responses` · `google_oauth_tokens`

Estas se crean en Supabase con su mismo esquema y se copian tal cual. Es mecánico y de bajo riesgo: `pg_dump` de esas tablas desde Neon, `psql` contra Supabase, y cambiar el cliente en el código.

**Ojo con `assessment_tokens`**: ahí viven los tokens de los enlaces que los candidatos ya tienen en su correo. Si se pierden o cambian, los enlaces mueren. Se copian con su valor original, no se regeneran.

### Grupo C — el caso raro

`assessments` **existe en las dos bases**. En Supabase tiene 3 filas y hay además `assessment_responses` con 45. En Neon es otra cosa, acompañada de `assessment_tokens`.

Mismo nombre, dos bases, contenidos distintos. Esto hay que mirarlo columna por columna antes de tocar nada: puede ser la misma tabla duplicada en dos momentos del proyecto, o dos conceptos distintos que coincidieron de nombre. No asumir ninguna de las dos.

## Orden sugerido

1. **Inventariar Neon de verdad.** Todo lo anterior sale de leer el código, no la base: no tengo acceso a Neon. Hace falta un `\dt` y un conteo de filas por tabla para saber qué hay vivo y qué quedó de pruebas.
2. **Resolver el Grupo C** — decidir qué es cada `assessments`.
3. **Grupo B primero**, que es mecánico y no cambia lógica. Cada tabla migrada es una ruta menos dependiendo de Neon.
4. **Grupo A al final**, ruta por ruta, empezando por las que no ve el candidato (`market-research`, `matching`, `talent-pool`) y dejando `/api/portal/[token]` y `/api/assessments/[token]` de últimas, cuando el camino ya esté probado.
5. **Verificar que nadie llama a Neon**: `grep -rl "@neondatabase\|@/lib/db" src/` tiene que devolver vacío.
6. **Recién ahí** quitar `DATABASE_URL` y las siete variables `PG*`/`POSTGRES_*` de Vercel, y apagar Neon.

## Las 7 huérfanas

Estas no las llama ninguna pantalla. Antes de migrarlas, revisar si se borran:

`/api/seed/attraction-tracking` · `/api/seed/elevare-results` · `/api/headhunting/sync-from-neon` · `/api/cv-parse/batch` · `/api/init-db`

`init-db` ya quedó cerrada tras admin y como POST el 21-oct, pero sigue ahí. Si Neon se apaga, todas estas mueren solas.

## Lo que no se puede hacer desde aquí

No tengo acceso a Neon: `DATABASE_URL` vive en Vercel y su valor está cifrado. El paso 1 lo tiene que correr alguien con esa cadena de conexión. Con eso en mano, el resto del plan se puede ejecutar y verificar.
