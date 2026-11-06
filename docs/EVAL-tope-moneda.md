# EVAL · Tope salarial por moneda (aviso HR Admin / Wellness)

**Status:** evaluation only. Not for merge. No production change. No staging deploy from this branch.

**Question (Kelly, via Mateo):** in the HR Admin / Wellness aviso form, can «Tope salarial (COP)» show the currency of the vacancy/country (USD / CNY / COP / …) instead of hardcoded COP? China Overseas Sales already uses USD caps (structured fields USD; aviso text CNY). Confirm feasibility and effort. Target: staging first. Production only with a later Kelly GO.

**Answer:** YES, with a product caveat. The label can change on staging without touching production. The number must not be treated as COP once the currency is not COP, and China needs an explicit choice between the internal USD cap and the public CNY line.

---

## Feasibility

**YES**, on the Careers aviso path (this repo).

Caveats:

1. There is no country or currency column on `ht_requisitions`. Auto-picking COP/USD/CNY from “the vacancy country” is a guess. The only structured signal today is `form_template_key` (`china` on `main`; `panama_ops` exists only on open PR #10). `location` and `lead_profile.ubicacion` are free text. Approving a requisition does **not** copy a country onto `ht_vacancies` (that table has `country`, the insert in `PATCH /api/requisitions/[id]` does not set it).
2. The Wellness number in `salary_cap_cop` is **not** what the live prefilter reads. Colombia caps are hardcoded by vacancy UUID and, for `customer_doc`, by template. China uses a constant `CHINA_SALARY_CAP_USD = 1500` and the candidate field `salary_usd`. Changing the label does not change who gets flagged.
3. The public aviso salary is a different field: `salary_public` (free text). Publish copies it as-is into Neon `salary_range` / `salary_range_en`. It can already say CNY, USD, or «A convenir». The multilingual job writer **drops** the leader’s `salario_tope` on purpose so the internal cap does not land in the public post.
4. No `CNY` / `yuan` / `RMB` string exists in this repo. Static China jobs in `src/data/jobs.ts` say «A convenir». The CNY aviso line is an operational choice when Wellness writes `salary_public` (or pastes a post), not something the code emits.
5. WXM is a different app. This GitHub org only exposes `trading-solutions-careers`. The string «Tope salarial orientativo (COP)» is **not** in Careers. Kelly named the aviso in HR Admin; that is `RequisitionsInbox`. A WXM label change is a second repo and is not required for the Careers aviso.

## What the code does today

| Surface | Currency | Reads `ht_requisitions.salary_cap_cop`? |
|---|---|---|
| Wellness form label «Tope salarial (COP)» · `src/components/RequisitionsInbox.tsx` ~L585 | hardcoded COP | writes the number into `salary_cap_cop` |
| Leader raw line «Tope salarial» · same file ~L521 | whatever string is in `lead_profile.salario_tope` | no |
| `POST /api/requisitions` | stores `lead_profile` JSON as WXM sends it | no amount column on create |
| `PATCH /api/requisitions/[id]` allowlist | persists `salary_cap_cop` | yes, blind bigint |
| Publish web | `salary_public` text only | no |
| Headhunting prefilter, Colombia | COP bands (`< 3 M` … `8 M+`) vs UUID caps / `TEMPLATE_SALARY_CAP` | **no** |
| Headhunting prefilter, `china` | USD number vs **1500**, review only, never auto-reject | **no** |
| Candidate form, China | «Monthly salary expectation in USD (gross)» | n/a |
| Apply-form agent `src/lib/agent/prefilter.ts` | COP only, jobs 1–5, parses “Salario …”; values under 1,000,000 are multiplied by 1000 | **no** (own hardcoded map) |
| PR #10 `panama_ops` (open, not on `main`) | USD cap 1500, `salary_usd`, explicitly **out of scope**: `salary_currency` UI/DB | no |

`salary_cap_cop` is `bigint` (`supabase/migrations/20260826_requisiciones.sql`). Empty is allowed. China requisitions can leave it null and the prefilter still uses 1500 USD. The helper under the input (“El prefiltro marca a quien pida por encima”) overstates the wiring: the live prefilter never reads this column.

`lead_profile` keys the inbox actually renders: `reporta_a`, `posiciones`, `ubicacion`, `modalidad`, `herramientas`, `ingles_nivel`, `ingles_para`, `formacion`, `experiencia`, `competencias`, `salario_tope`. If WXM sends `salario_monto` / `salario_moneda`, they are stored inside the JSON and **not shown**. Careers cannot confirm from this repo that China rows are filled that way; the inbox would ignore those keys today.

PR #10 (`cursor/panama-ops-prefiltro-en-dd6e`, still **OPEN**) adds the `panama_ops` template only. Its body lists `salary_currency` / `salary_cap_usd` UI and migrations as fase 2, out of scope. It does not add a currency control on the aviso form. `RequisitionsInbox` is not in that diff.

## Options

### A — Label (and a select) from signals already on the req. No migration.

Show COP / USD / CNY on the label. Keep writing the number into `salary_cap_cop`.

Works as a staging visual. It does **not** remember the currency after reload unless it is stuffed somewhere that already exists (`lead_profile` JSON or the `salary_public` string). Stuffing it into `lead_profile` mixes Wellness’s formal cap with the leader’s raw notes. Stuffing it into `salary_public` would publish the internal cap.

Auto-from-country is the weak part of A. There is no country field. A heuristic (`form_template_key === "china"` → USD, location text contains “china” → CNY, else COP) will disagree with itself on the China case Kelly already described.

**Use A only as a staging mock if the currency is a manual select and the screen says the prefilter still uses the hardcoded cap.**

### B — One amount + `salary_currency` (COP | USD | CNY). Recommended.

Add `salary_currency text not null default 'COP'`. Keep `salary_cap_cop` as the amount column in the first slice (renaming it is a client/SQL break for little gain; the name becomes a lie the moment currency is USD, so the comment and the UI must say “amount in `salary_currency`”). Do not add per-currency amount columns.

Prefilter, when wired, must branch:

- `COP` → existing COP bands and COP caps only.
- `USD` → compare `salary_usd` (china / panama_ops) to the amount. Do not run it through `extractMonthlySalaryCop` (that function multiplies numbers under 1,000,000 by 1000).
- `CNY` → no candidate question collects CNY today. A CNY amount cannot flag anyone until the form asks for CNY or a conversion rule exists.

Empty China caps stay on the hardcoded 1500 USD fallback until Wellness saves a number. That fallback is what is actually in production behavior today.

### C — Separate amount columns per currency.

Not recommended. Same product decision, more nulls, and the prefilter still has to pick a column. The public CNY line does not need a numeric column; it already has `salary_public`.

## How the currency should be chosen

**Manual select, with a suggestion. Not a silent auto-write.**

Suggested default, Wellness can override:

| Signal | Suggestion | Why |
|---|---|---|
| no signal | COP | current column and Colombia forms |
| `form_template_key = china` | USD | prefilter and candidate form are USD |
| `form_template_key = panama_ops` (after PR #10) | USD | same pattern, cap 1500 USD on that branch |
| location / `lead_profile.ubicacion` text | hint only | free text, easy to get wrong |

Do **not** map China → CNY automatically. That would make the internal cap disagree with the USD prefilter.

### Product question for Kelly

China Overseas Sales has two different salaries in practice:

- **Internal tope / prefilter:** USD. The candidate is asked for monthly gross **USD**. The code flags above **USD 1,500** and does not auto-reject.
- **Public aviso:** free text (`salary_public`). It can be written in **CNY**. The job writer is built to keep the internal tope out of the post. Nothing in this repo generates a CNY figure.

Which currency should the Wellness field «Tope salarial» store?

1. **USD** — matches the structured cap and the prefilter. The CNY line stays in «Salario en el aviso» (`salary_public`), which the candidate sees and which is not the cap.
2. **CNY** — matches the public sentence, but then the prefilter (which scores USD answers against a USD cap) must not read that number. The field would be informational only.
3. **Both** — USD in the tope field, CNY only in the aviso text. This is what the schema already almost does, once the tope label stops saying COP.

Recommendation inside the question: option 3. One internal numeric cap in the currency the prefilter asks (USD for China and Panama), and the public line left as text so it can say CNY without a second amount column.

## Touch points (Careers)

If the stg slice is label + select + persisted currency, and prefilter stays on its constants:

- `src/components/RequisitionsInbox.tsx` — label, select, payload.
- `src/app/api/requisitions/[id]/route.ts` — allow `salary_currency` on PATCH.
- `supabase/migrations/…_salary_currency.sql` — one column, default `COP`. Staging only until GO.

Not in that slice (they do not read the column today):

- `src/app/api/requisitions/[id]/publish-web/route.ts` — keep publishing `salary_public` only. Do not copy the cap into the aviso.
- `src/app/api/agents/job-post-multilang/route.ts` — keep excluding the tope.
- `src/app/api/headhunting/prefilter/[token]/route.ts` — `CHINA_SALARY_CAP_USD`, `SALARY_CAPS`, `decideFromSalary`.
- `src/lib/prefilter-templates.ts` — `TEMPLATE_SALARY_CAP` (COP). On PR #10, `TEMPLATE_SALARY_CAP_USD`.
- `src/app/prefiltro/[token]/page.tsx` — COP bands vs China `salary_usd`.
- `src/lib/agent/prefilter.ts` and `src/app/api/applications/route.ts` — COP parser for the public apply form (jobs 1–5). Do not point this at a USD amount.
- `src/components/PipelineFunnel.tsx` — already shows `salary_cap_usd` from prefilter meta for China.
- WXM reclutamiento label — other repo, not this aviso path.

Full persistence (prefilter uses the saved cap) adds the headhunting prefilter route, the template cap maps, the China/Panama form copy if the asked currency changes, and a join from `ht_vacancies.requisition_id` back to the requisition (the cap is not copied onto the vacancy at approval).

## Effort

| Slice | Size | Notes |
|---|---|---|
| (a) Staging UI: dynamic label + manual select, currency persisted, amount still in `salary_cap_cop`, prefilter unchanged, draft, not merged | **S · about 6–10 hours** | Migration on staging only. Guard: if currency ≠ COP, do not let COP readers (agent prefilter, COP bands) consume the number. Screen copy must say the live prefilter still uses its hardcoded cap. |
| (a′) Label-only, currency not saved | **S · about 2–4 hours** | Misleading after reload. Not worth a PR. |
| (b) Saved currency + prefilter actually uses the amount (COP bands vs USD number, China/Panama fallback while the field is empty, no CNY scoring) | **M · about 2–4 days** | Careers only. Includes tests that 1500 USD is not compared to 4,000,000 COP and is not multiplied by 1000. |
| (b) + WXM label and `salario_moneda` round-trip | **M to L** | WXM repo is not in this workspace. Add a separate pass after the Careers contract is fixed. |
| (c) Per-currency columns | **L** | No extra product value over B. |

PR #10 should land or be rebased under this work before Panama is part of the suggestion table. This eval does not depend on merging #10.

## Risks

- Writing USD `1500` into `salary_cap_cop` while any COP path treats “under 1,000,000” as thousands (`extractMonthlySalaryCop`) turns 1500 into 1,500,000 COP. The live headhunting prefilter does not do that today because it does not read the column. The apply-form agent would, if someone later feeds this column into it.
- A COP report or sum over `salary_cap_cop` would mix 4,000,000 COP with 1,500 USD. Currency must travel with the number before anyone aggregates.
- China rows often have an empty `salary_cap_cop`. A new required field would block aviso save unless empty stays legal and the 1500 USD constant remains the fallback.
- Putting the internal cap into `salary_public` would publish it. The job-post route already refuses to do that with `salario_tope`. Keep that split.
- Auto China → CNY would flag USD candidate answers against a yuan number, or flag nobody. That is the bug Kelly’s question is trying not to ship.
- Renaming `salary_cap_cop` in the same change as the UI is the riskier migration (every select list and the PATCH allowlist). Defer the rename.

## Explicit

- No production config, migration, or deploy in this evaluation.
- No merge.
- Staging implementation waits on Kelly’s answer: USD internal tope vs CNY aviso text.
- Production only with a later Kelly GO.
