import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  panamaOpsAsksSalary,
  panamaOpsNoticeLines,
  scorePanamaOps,
  type PanamaAnswers,
} from "./panama-ops-prefilter";

const pass: PanamaAnswers = {
  work_authorized_panama: "yes",
  onsite_panama_city: "yes",
  english_level: "B1",
  years_freight_panama: 4,
  ocean_fcl_lcl: "yes",
  air_freight: "yes",
  bl_awb_docs: "yes",
  warehouse_ftz: "yes",
  start_within_30_days: "yes",
  salary_usd: "1500",
};

function only(over: Partial<PanamaAnswers>) {
  return scorePanamaOps({ ...pass, ...over });
}

const work = only({ work_authorized_panama: "no" });
assert.equal(work.decision, "reject");
assert.equal(work.stage, "rechazado");
assert.equal(work.decisionLabel, "knocked_out");
assert.equal(work.emailCandidate, false);
assert.equal(work.reasons.some((r) => r.text === "Not legally authorized to work in Panama" && r.category === null), true);

const onsite = only({ onsite_panama_city: "no" });
assert.equal(onsite.decision, "reject");
assert.equal(onsite.stage, "rechazado");
assert.equal(onsite.emailCandidate, false);
assert.equal(onsite.reasons.some((r) => r.text === "Cannot work on-site in Panama City" && r.category === null), true);

for (const level of ["A1", "A2", ""]) {
  const english = only({ english_level: level });
  assert.equal(english.decision, "reject", level || "(blank)");
  assert.equal(english.stage, "rechazado");
  assert.equal(english.emailCandidate, false);
  const reason = english.reasons.find((r) => r.text === "English below B1");
  assert.ok(reason);
  assert.equal(reason.category, "idioma_insuficiente");
  assert.equal(reason.sub_detail, "ingles_a1_a2");
}

for (const level of ["B1", "B2", "C1", "C2"]) {
  const english = only({ english_level: level });
  assert.equal(english.reasons.some((r) => r.effect === "knockout"), false, level);
  assert.equal(english.decision, "pass", level);
}

const years = only({ years_freight_panama: 3 });
assert.equal(years.decision, "review");
assert.equal(years.stage, "prefiltro_revision");
assert.equal(years.decisionLabel, "review");
assert.equal(years.reasons.some((r) => r.effect === "knockout"), false);
assert.equal(
  years.reasons.some((r) => r.sub_detail === "anos_industria" && r.text === "Freight experience under 4 years"),
  true,
);

const ocean = only({ ocean_fcl_lcl: "no" });
assert.equal(ocean.decision, "review");
assert.equal(ocean.reasons.some((r) => r.text === "No ocean FCL/LCL experience" && r.sub_detail === "sin_experiencia_rol"), true);
assert.equal(ocean.reasons.some((r) => r.effect === "knockout"), false);

const air = only({ air_freight: "no" });
assert.equal(air.decision, "review");
assert.equal(air.reasons.some((r) => r.text === "No air freight experience"), true);

const bl = only({ bl_awb_docs: "no" });
assert.equal(bl.decision, "review");
assert.equal(bl.reasons.some((r) => r.text === "No BL/AWB experience"), true);

const ftz = only({ warehouse_ftz: "no" });
assert.equal(ftz.decision, "review");
assert.equal(ftz.reasons.some((r) => r.text === "No Zona Libre / FTZ experience"), true);

const start = only({ start_within_30_days: "no" });
assert.equal(start.decision, "review");
assert.equal(start.stage, "prefiltro_revision");
assert.equal(
  start.reasons.some((r) => r.category === "disponibilidad_movilidad" && r.sub_detail === "fecha_inicio"),
  true,
);

const clean = only({});
assert.equal(clean.decision, "pass");
assert.equal(clean.stage, "prefiltro_pasado");
assert.equal(clean.decisionLabel, "advance");
assert.equal(clean.reasons.length, 0);
assert.equal(clean.salary_usd, null);
assert.equal(clean.emailCandidate, false);

assert.equal(panamaOpsAsksSalary(), false);
const notice = panamaOpsNoticeLines(work);
assert.match(notice[0], /Decision reject · stage rechazado · knocked_out/);
assert.match(notice.join("\n"), /Not legally authorized to work in Panama/);

const form = readFileSync(new URL("../app/prefiltro/[token]/page.tsx", import.meta.url), "utf8");
const panamaForm = form.split("Panama Ops · Form phase")[1]?.split("Form phase")[0] ?? "";
assert.ok(panamaForm.length > 0, "panama form section missing");
assert.doesNotMatch(panamaForm, /salary/i);
assert.match(panamaForm, /start within 30 days/i);
assert.match(panamaForm, /B1 is required/i);

const payload = form.split("Panama Ops · payload")[1]?.split("try {")[0] ?? "";
assert.doesNotMatch(payload, /salary_usd/);
assert.match(payload, /start_within_30_days/);

console.log("panama-ops prefilter checks passed");
