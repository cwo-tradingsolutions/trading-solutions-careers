import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluarSalarioCny, incorporarTopeCny, TOPE_REVISION_SALARIO_CNY } from "./china-salary";
import {
  PREFILTER_TEMPLATES,
  TEMPLATE_REQUIRED_FIELDS,
  TEMPLATE_SALARY_CAP,
  TEMPLATE_SALARY_CAP_USD,
} from "./prefilter-templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("23399 y 23400 no marcan; 23401 queda en revisión y no se rechaza", () => {
  assert.equal(TOPE_REVISION_SALARIO_CNY, 23400);
  for (const raw of [23399, 23400, "23399", "23400"]) {
    const r = incorporarTopeCny("pass", [], raw);
    assert.equal(r.ok, true, String(raw));
    if (!r.ok) continue;
    assert.equal(r.overBudget, false, String(raw));
    assert.equal(r.decision, "pass", String(raw));
    assert.equal(r.bloqueos.length, 0, String(raw));
    assert.notEqual(r.decision, "reject");
  }
  for (const raw of [23401, "23401"]) {
    const r = incorporarTopeCny("pass", [], raw);
    assert.equal(r.ok, true);
    if (!r.ok) continue;
    assert.equal(r.overBudget, true);
    assert.equal(r.decision, "review");
    assert.notEqual(r.decision, "reject");
    assert.equal(r.bloqueos.length, 1);
    assert.equal(r.bloqueos[0].regla, "salario_sobre_tope");
    assert.equal((r.bloqueos[0] as { severidad?: string }).severidad, "blando");
  }
});

test("null, negativo, texto e Infinity no son un salario y no arman una decisión", () => {
  for (const raw of [null, undefined, -1, "-5", 0, "0", "veinte mil", "23,401", "1800-2000", "Infinity", Infinity, -Infinity, Number.NaN, "", "  "]) {
    const r = evaluarSalarioCny(raw);
    assert.equal(r.ok, false, String(raw));
    if (r.ok) continue;
    assert.equal(r.error, "salary_cny_invalid");
  }
});

test("los knock-outs de inglés, presencial y autorización se quedan", () => {
  const previos = [
    { regla: "autorizacion_trabajo", sub_detail: "sin_autorizacion_trabajo_china" },
    { regla: "ingles_minimo", sub_detail: "ingles_b1" },
    { regla: "disponibilidad_presencial", sub_detail: "sin_disponibilidad_presencial" },
  ];
  const bajo = incorporarTopeCny("review", previos, 23400);
  assert.equal(bajo.ok, true);
  if (!bajo.ok) return;
  assert.equal(bajo.decision, "review");
  assert.deepEqual(bajo.bloqueos.map((b) => b.regla), [
    "autorizacion_trabajo",
    "ingles_minimo",
    "disponibilidad_presencial",
  ]);

  const sobre = incorporarTopeCny("review", previos, 23401);
  assert.equal(sobre.ok, true);
  if (!sobre.ok) return;
  assert.equal(sobre.decision, "review");
  assert.notEqual(sobre.decision, "reject");
  assert.deepEqual(sobre.bloqueos.map((b) => b.regla), [
    "autorizacion_trabajo",
    "ingles_minimo",
    "disponibilidad_presencial",
    "salario_sobre_tope",
  ]);
});

test("el template china pide salary_cny y los demás templates no se mueven", () => {
  assert.equal(PREFILTER_TEMPLATES.china.label, "China Builder Team (EN · knock-outs only)");
  assert.deepEqual(PREFILTER_TEMPLATES.china.sections, ["china_core", "about_you"]);
  assert.equal(TEMPLATE_REQUIRED_FIELDS.china.includes("salary_cny"), true);
  assert.equal(TEMPLATE_REQUIRED_FIELDS.china.includes("salary_usd"), false);
  assert.doesNotMatch(PREFILTER_TEMPLATES.china.description, /23400/);

  assert.deepEqual(TEMPLATE_REQUIRED_FIELDS.comex, [
    "doc_type", "doc_number", "phone", "city",
    "salary", "availability", "relocate",
    "english_level", "edu_type",
    "years_logistics", "intl_clients", "excel_level",
    "years_sales", "pricing_exp", "leadership",
    "why_ts",
  ]);
  assert.deepEqual(TEMPLATE_REQUIRED_FIELDS.hr_lead, [
    "doc_type", "doc_number", "phone", "city",
    "salary", "availability", "relocate",
    "english_level", "edu_type",
    "years_hr", "ats_tools_used", "team_size_led",
    "psychometrics_years", "bei_certified",
    "why_ts",
  ]);
  assert.deepEqual(TEMPLATE_REQUIRED_FIELDS.finance, [
    "doc_type", "doc_number", "phone", "city",
    "salary", "availability", "relocate",
    "english_level", "edu_type",
    "years_finance", "accounting_systems", "ifrs_familiar",
    "why_ts",
  ]);
  assert.deepEqual(TEMPLATE_REQUIRED_FIELDS.tech, [
    "doc_type", "doc_number", "phone", "city",
    "salary", "availability", "relocate",
    "english_level", "edu_type",
    "why_ts",
  ]);
  assert.deepEqual(TEMPLATE_REQUIRED_FIELDS.sig_sst, [
    "doc_type", "doc_number", "phone", "city",
    "salary", "availability", "relocate",
    "english_level", "edu_type",
    "license_status", "course_50h", "course_20h", "postgrad_sig",
    "auditor_certs", "systems_managed",
    "years_sig", "years_leading_sig", "cert_audit_cycles",
    "excel_level", "case_answer",
    "why_ts",
  ]);
  assert.deepEqual(TEMPLATE_REQUIRED_FIELDS.customer_doc, [
    "doc_type", "doc_number", "phone", "city",
    "salary", "availability", "relocate",
    "english_level", "edu_type",
    "years_doc_comex", "docs_handled", "invoice_reconciliation",
    "difference_story", "case_choice", "case_why",
    "why_ts",
  ]);
  assert.deepEqual(TEMPLATE_REQUIRED_FIELDS.panama_ops, [
    "full_name", "email", "phone", "current_city",
    "work_authorized_panama", "onsite_panama_city",
    "years_freight_panama", "ocean_fcl_lcl", "air_freight",
    "bl_awb_docs", "warehouse_ftz", "english_level",
    "start_within_30_days", "why_ts", "privacy_consent",
  ]);
  assert.equal(TEMPLATE_REQUIRED_FIELDS.panama_ops.includes("salary_cny"), false);
  assert.equal(TEMPLATE_REQUIRED_FIELDS.comex.includes("salary_cny"), false);
  assert.deepEqual(TEMPLATE_SALARY_CAP, { customer_doc: 3_500_000 });
  assert.deepEqual(TEMPLATE_SALARY_CAP_USD, { panama_ops: 1500 });
  assert.equal(PREFILTER_TEMPLATES.panama_ops.label, "Panama Operations (EN)");
});

test("23400 no aparece en el formulario, la ficha ni los avisos", () => {
  for (const rel of [
    "src/app/prefiltro/[token]/page.tsx",
    "src/components/PipelineFunnel.tsx",
    "src/lib/prefilter-templates.ts",
    "src/app/api/headhunting/prefilter/[token]/route.ts",
    "src/data/jobs.ts",
  ]) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.equal(src.includes("23400"), false, rel);
  }
  const page = readFileSync(join(root, "src/app/prefiltro/[token]/page.tsx"), "utf8");
  assert.match(page, /What is your expected monthly salary in CNY \(Chinese yuan\)\?/);
  assert.doesNotMatch(page, /salary_usd:/);
  const route = readFileSync(join(root, "src/app/api/headhunting/prefilter/[token]/route.ts"), "utf8");
  assert.match(route, /evaluarSalarioCny\(body\.salary_cny\)/);
  assert.match(route, /sin_autorizacion_trabajo_china/);
  assert.match(route, /ingles_minimo/);
  assert.match(route, /sin_disponibilidad_presencial/);
  assert.doesNotMatch(route, /CHINA_SALARY_CAP_USD|parseSalaryRangeUsd\(body\.salary_usd\)/);
});
