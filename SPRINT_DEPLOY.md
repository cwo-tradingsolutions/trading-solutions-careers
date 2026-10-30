# Sprint Deploy · Trading Solutions ATS · 2026-05-02

Empaquetado de todo el sprint. Cubre 8 features mayores que cierran el ATS como sistema corporativo alineado con RYS Standard.

---

## 1 · Pasos de deploy en orden

### A) Migraciones Supabase (4 SQL files — pegar en SQL Editor en orden)

Las 4 migraciones son **idempotentes**, podés re-correr sin riesgo. Todas viven en `supabase/migrations/`.

```
1. 20260502_candidate_experience.sql    → tabla ts_candidate_experience (NPS)
2. 20260502_people_onboarding.sql       → tablas ts_people + ts_onboarding
3. 20260502_rys_vacancy_type.sql        → vacancy_type + matriz híbrida targets
4. 20260502_interviews.sql              → tabla ts_interviews
```

Cada una abre la tabla con `CREATE TABLE IF NOT EXISTS` y los `ALTER TABLE` están en bloques `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL` para que sea seguro re-correr.

### B) Commit + push

```bash
cd "Talento/careers-ats"
git add -A
git commit -m "feat: bulk import TPs al People file (CSV parser + dry run + idempotent by email)"
git push
```

Vercel deploya automáticamente.

### C) Variables de entorno (verificar en Vercel)

Ya configuradas en deploys previos, sólo confirmar que existen:

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client (bypass RLS) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente público (encuesta NPS) |
| `DATABASE_URL` | Neon (legacy applications + gmail tokens) |
| `ANTHROPIC_API_KEY` | Market Research IA · scoring |
| `MAIL_RECIPIENT_ALLOWLIST` | Destinatarios permitidos fuera de producción. Staging: `cwo@tradingsolutions.com,jointheteam@tradingsolutions.com` |
| `NEXT_PUBLIC_APP_URL` | Para Elevare assessment links |

No se agregaron nuevas envs en este sprint.

---

## 2 · Features incluidas en el sprint

### 1. Tab cleanup + Market Research IA por vacante
- 12 tabs → 6 tabs: Dashboard · Vacantes · Funnel · **Onboarding** · CV Bank · Agentes IA
- Botón ✨ "Estudio de mercado IA" en cada vacante abierta + columna "🤖 Ver" en cerradas
- Endpoint `POST /api/headhunting/vacancies/[id]/market-research` cachea reportes Claude (compensación COP, sourcing, riesgos, recomendaciones tácticas)

### 2. Today's Focus en Dashboard
- Hero gradiente morado/slate al inicio del Dashboard
- Pills: Entrevistas hoy · Aging · Decisiones · Vacantes urgentes · Sin movimiento · Quick wins
- Cards específicos con jump directo a Funnel/Vacantes
- Endpoint `/api/dashboard/today`

### 3. NPS Survey end-to-end
- Tabla `ts_candidate_experience` con NPS + 5 ratings + would_recommend + comments
- Endpoint público `/api/candidate-experience/[token]` (sin auth)
- Página pública `/encuesta/[token]` (TS-style, mobile-friendly)
- Bulk action "📊 Enviar encuesta NPS" para rechazados/contratados
- Strip NPS en Dashboard cuando ≥5 surveys

### 4. Onboarding + People file
- Tablas `ts_people` (TPs + nuevos hires) y `ts_onboarding`
- 28 tareas estándar TS distribuidas en Day1 / Week1 / Day30 / Day60 / Day90 (más para Lead/C-Suite)
- Auto-creación al pasar candidato a `contratado` (idempotente)
- Tab Onboarding con KPI tiles · cards por persona · drawer detalle con checkboxes · check-ins editables
- **Bulk import TPs (CSV)** — modal con drag/drop, dry run preview, columnas extra → psychometric_profile JSONB

### 5. Analytics deep
- Funnel completo con conversión por stage (semáforo)
- Top 3 drop-offs
- Sources LinkedIn vs Orgánica + hire rate por canal
- Tiempo promedio por stage
- Tabla comparación de vacantes cerradas
- Endpoint `/api/dashboard/analytics`

### 6. RYS Corporate Standard alignment
- Nueva columna `vacancy_type` ('reemplazo' | 'incremental') en vacantes
- **Matriz híbrida de targets** (RYS + mercado Colombia freight forwarding):

| | Reemplazo | Incremental |
|---|---|---|
| **Entry / Lead** | 35d (RYS) | 50d (RYS) |
| **C-Suite** | 60d (mercado) | 80d (mercado) |

- Health score y todos los reportes ahora respetan esta matriz
- Chip Reempl./Increm. en cards

### 7. Buscador global de candidatos (Cmd+K)
- Botón "Buscar candidatos ⌘K" en topbar
- Modal Spotlight-style con debounce, filtros (stage + score), keyboard nav (↑↓ Enter ESC)
- Endpoint `/api/headhunting/candidates/search` con full-text + filtros

### 8. Interview scheduling con Google Calendar
- Tabla `ts_interviews` para tracking
- Library `src/lib/ics.ts` — genera .ics universal + Google Calendar URL
- Endpoint `POST /api/headhunting/candidates/[id]/schedule-interview` está cerrado y no envía correo
- Botón global "📅 Agendar" en topbar abre modal de 3 pasos
- "Agenda de hoy" en Today's Focus

### 9. Pause AI Interview · post-Elevare → Recruiter Interview
- `assessment_completado → recruiter_interview` directo
- Stages legacy `entrevista_ia` y `bateria_psicometrica` preservados pero marcados visualmente como "pausa" / "extra opcional"
- Bulk action en `assessment_completado` ahora avanza stage en lugar de enviar email IA

---

## 3 · Verificación post-deploy (checklist)

Después de que Vercel confirme deploy exitoso:

- [ ] **Login**: `/hr-admin/login` → entra normalmente
- [ ] **6 tabs visibles**: Dashboard · Vacantes · Funnel · Onboarding · CV Bank · Agentes IA
- [ ] **Cmd+K** abre buscador desde cualquier tab
- [ ] **Botón "📅 Agendar"** en topbar abre modal de scheduling
- [ ] **Today's Focus** carga y muestra pills correctas
- [ ] **Vacancy cards** muestran chip Reempl./Increm. (después de correr SQL #3)
- [ ] **Onboarding tab**: pill "People file: X · Y TPs" + botón "📥 Importar TPs"
- [ ] **Analytics deep**: scroll abajo del Dashboard → funnel + drop-offs visibles
- [ ] **Estudio de mercado**: en Vacantes, click ✨ en cualquier card → modal con datos
- [ ] **Encuesta NPS**: probar URL `/encuesta/test-token` → debería decir "Encuesta no encontrada" (404 esperado)

### Tests funcionales rápidos

1. **Schedule interview test**: el agendado desde el encabezado está cerrado. La invitación viva sale por Gmail desde la ficha, y solo a direcciones permitidas fuera de producción.
2. **Market research test**: abrir cualquier vacante → ✨ → click "Generar". Esperar ~30s. Verificar JSON renderizado.
3. **Onboarding auto-create test**: en Funnel, mover un candidato dummy a `contratado`. Volver a Onboarding tab → debería aparecer su card.
4. **Bulk import test**: descargar template del modal de import, agregar 1-2 filas, importar (dry run primero).

---

## 4 · Estado final del sistema

**Tablas Supabase activas:**
- `ht_vacancies` (con vacancy_type)
- `ht_vacancy_milestones`
- `ht_candidates` (con assessment_token, overall_score, etc.)
- `ts_targets` (matriz role_level × vacancy_type)
- `ts_market_research` (cache de reportes IA)
- `ts_candidate_experience` (NPS surveys)
- `ts_people` (directorio + TPs)
- `ts_onboarding` (planes 30/60/90)
- `ts_interviews` (tracking entrevistas)

**Endpoints públicos (sin auth):**
- `GET/POST /api/candidate-experience/[token]` — NPS survey
- `/encuesta/[token]` — UI encuesta

**Endpoints admin (requieren admin auth):**
- `GET /api/dashboard/overview` · `today` · `analytics`
- `GET/POST /api/headhunting/candidates/...`
- `GET/POST /api/headhunting/vacancies/...`
- `GET/POST /api/people` · `/bulk-import`
- `GET /api/onboarding` · `GET/PATCH /api/onboarding/[id]`
- `POST /api/onboarding/from-candidate`
- `POST /api/admin/apply-rys-data`
- `POST /api/headhunting/candidates/[id]/schedule-interview` · `send-experience-survey`

---

## 5 · Pendientes que NO entraron al sprint

- Migrar Margarita y Diana al runner Elevare con anti-cheat (Tarea #3 — requiere coordinación caso por caso, no es feature global)
- Detail panel de candidato accesible desde search (actualmente Cmd+K → Funnel; podría abrir drawer directamente)
- Bulk re-scoring después de cambiar ideal_profile

---

**Sprint completado**: 9 features mayores · 4 tablas nuevas · 11 endpoints nuevos · 2 páginas públicas · ~3,500 líneas de código.
