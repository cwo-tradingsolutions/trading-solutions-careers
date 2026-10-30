import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KELLY_GATES } from "../stage-labels";
import {
  MIN_N,
  MUESTRA,
  SIN_CANAL,
  SIN_CODIGO,
  SIN_HITO,
  SIN_PAIS,
  buildDashboard,
  buildDrill,
  canalDe,
  daySpan,
  exampleInput,
  fueraDeSlaEnGate,
  slaActual,
  maxGateIndex,
  median,
  offerAccept,
  paisDe,
  pasosConversion,
  slaDeGate,
  type DashEvent,
  type DashboardInput,
  emptyFilters,
} from "./metrics";

const T0 = "2026-01-01T00:00:00.000Z";

function at(days: number): string {
  return new Date(new Date(T0).getTime() + days * 86_400_000).toISOString();
}

function ev(to_stage: string, days: number, source: string | null = "ui"): DashEvent {
  return { candidate_id: "c", to_stage, changed_at: at(days), source };
}

describe("median y muestra", () => {
  it("mediana par e impar", () => {
    assert.equal(median([20, 48, 22, 40, 24, 30]), 27);
    assert.equal(median([10, 12, 14, 18, 21, 30]), 16);
    assert.equal(median([4]), 4);
  });

  it("n < 5 no publica el valor", () => {
    const input = baseInput();
    input.vacancies = input.vacancies.slice(0, 3);
    input.milestones = [0, 1, 2].map((i) => ({
      vacancy_id: `v${i}`,
      hr_request_date: at(0),
      hire_date: at(10 + i),
    }));
    const d = buildDashboard(input);
    assert.equal(d.kpis.ttf.n, 3);
    assert.equal(d.kpis.ttf.insufficient, true);
    assert.equal(d.kpis.ttf.value, null);
    assert.equal(MUESTRA, "Muestra insuficiente");
    assert.ok(MIN_N === 5);
  });
});

describe("nulos visibles", () => {
  it("canal y país vacíos tienen cubo propio", () => {
    assert.equal(canalDe(null), SIN_CANAL);
    assert.equal(canalDe(""), SIN_CANAL);
    assert.equal(canalDe("  "), SIN_CANAL);
    assert.equal(canalDe("LinkedIn"), "LinkedIn");
    assert.equal(paisDe(null), SIN_PAIS);
    assert.equal(paisDe(""), SIN_PAIS);
    const d = buildDashboard(exampleInput());
    assert.ok(d.channels.some((c) => c.source === SIN_CANAL && c.applicants >= 5));
    assert.ok(d.options.countries.includes(SIN_PAIS));
    const sinPais = d.vacancies.filter((v) => v.country === SIN_PAIS);
    assert.ok(sinPais.length > 0);
  });
});

describe("gates desde stage-labels", () => {
  it("agrupa con kellyGateFromStage y no inventa códigos", () => {
    assert.equal(maxGateIndex(["hiring_lead_interview"]), 8);
    assert.equal(maxGateIndex(["bateria_psicometrica"]), 6);
    assert.equal(maxGateIndex(["cwo_interview"]), 7);
    assert.equal(maxGateIndex(["onboarding"]), 12);
    assert.equal(maxGateIndex(["rechazado"]), 0);
    assert.equal(KELLY_GATES.length, 12);
    const oferta = KELLY_GATES.find((g) => g.id === "oferta")!;
    const docs = KELLY_GATES.find((g) => g.id === "docs")!;
    const onb = KELLY_GATES.find((g) => g.id === "onboarding")!;
    assert.ok(docs.n > oferta.n);
    assert.equal(onb.stages.includes("contratado" as never), true);
    assert.equal(onb.n, 12);
  });
});

describe("conversión salta gates sin código", () => {
  it("el paso es 5→7 y 7→9, no un 0% falso en 6 u 8", () => {
    const steps = pasosConversion();
    const sinCodigo = new Set(KELLY_GATES.filter((g) => g.stages.length === 0).map((g) => g.n));
    assert.deepEqual([...sinCodigo].sort(), [6, 8]);
    for (const s of steps) {
      assert.equal(sinCodigo.has(s.from.n), false);
      assert.equal(sinCodigo.has(s.to.n), false);
    }
    assert.ok(steps.some((s) => s.from.n === 5 && s.to.n === 7));
    assert.ok(steps.some((s) => s.from.n === 7 && s.to.n === 9));
    assert.equal(steps.some((s) => s.from.n === 6 || s.to.n === 6 || s.from.n === 8 || s.to.n === 8), false);

    const rows = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, maxGate: 5 })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, maxGate: 7 })),
    ];
    const input = baseInput();
    input.candidates = rows.map((r) => ({
      id: r.id,
      name: r.id,
      vacancy_id: "v0",
      stage: r.maxGate >= 7 ? "terna" : "recruiter_interview",
      source: "web",
      created_at: at(0),
      rejected: false,
    }));
    input.events = rows.flatMap((r) => [
      { candidate_id: r.id, to_stage: "aplico", changed_at: at(0), source: "ui" },
      {
        candidate_id: r.id,
        to_stage: r.maxGate >= 7 ? "terna" : "recruiter_interview",
        changed_at: at(1),
        source: "ui",
      },
    ]);
    const d = buildDashboard(input);
    const cinco = d.funnel.find((g) => g.n === 5)!;
    const seis = d.funnel.find((g) => g.n === 6)!;
    const siete = d.funnel.find((g) => g.n === 7)!;
    const ocho = d.funnel.find((g) => g.n === 8)!;
    assert.equal(seis.sinCodigo, true);
    assert.equal(ocho.sinCodigo, true);
    assert.equal(seis.reached, 0);
    assert.equal(ocho.reached, 0);
    assert.equal(seis.label, "Psicométricas");
    assert.equal(cinco.conversionToNext?.toN, 7);
    assert.equal(cinco.conversionToNext?.num, 4);
    assert.equal(cinco.conversionToNext?.den, 14);
    assert.equal(siete.conversionToNext?.toN, 9);
    assert.equal(d.funnel.length, 12);
    assert.equal(SIN_CODIGO, "sin código aún");
    // Gates 9–11 vacíos se quedan en la serie.
    for (const n of [9, 10, 11]) {
      const row = d.funnel.find((g) => g.n === n)!;
      assert.equal(row.empty, true);
      assert.ok(row.label.length > 0);
    }
  });
});

describe("SLA por código, sin sumar", () => {
  it("Prefiltro y Médicos no tienen un SLA suma", () => {
    const pre = slaDeGate(KELLY_GATES.find((g) => g.id === "prefiltro")!);
    const med = slaDeGate(KELLY_GATES.find((g) => g.id === "medicos_seguridad")!);
    assert.equal(pre.sla, null);
    assert.deepEqual(pre.codes.map((c) => c.sla), [5, 2, 2]);
    assert.equal(pre.codes.reduce((s, c) => s + c.sla, 0), 9);
    assert.equal(med.sla, null);
    assert.deepEqual(med.codes.map((c) => c.sla), [3, 5]);
    const uno = slaDeGate(KELLY_GATES.find((g) => g.id === "nuevo")!);
    assert.equal(uno.sla, 3);
  });

  it("un código pasado de su SLA saca al candidato aunque la suma del gate no", () => {
    // 6 días en el código actual (enviado, SLA 5). La suma del gate es 9: no se usa.
    const passed = [ev("prefiltro_enviado", 0)];
    assert.equal(fueraDeSlaEnGate(passed, "prefiltro_enviado", at(6)), true);
    assert.equal(daySpan(at(0), at(6)) < 9, true);

    // 3 + 1 + 1, el código actual dentro de su SLA.
    const inside = [ev("prefiltro_enviado", 0), ev("prefiltro_pasado", 3), ev("prefiltro_revision", 4)];
    assert.equal(fueraDeSlaEnGate(inside, "prefiltro_revision", at(5)), false);

    // El código actual es pasado (SLA 2) y ya lleva 3 días.
    const ahoraPasado = [ev("prefiltro_enviado", 0), ev("prefiltro_pasado", 3)];
    assert.equal(fueraDeSlaEnGate(ahoraPasado, "prefiltro_pasado", at(6)), true);

    // Justo en el SLA no es fuera (> estricto).
    assert.equal(fueraDeSlaEnGate([ev("prefiltro_enviado", 0)], "prefiltro_enviado", at(5)), false);

    // Backfill no cuenta como incumplimiento.
    assert.equal(
      fueraDeSlaEnGate([ev("prefiltro_enviado", 0, "backfill")], "prefiltro_enviado", at(30)),
      false,
    );
  });

  it("solo cuenta quien se pasa en el código actual", () => {
    // 6 días en enviado (SLA 5) y hoy 1 día en pasado (SLA 2): el incumplimiento ya pasó.
    const yaNo = [ev("prefiltro_enviado", 0), ev("prefiltro_pasado", 6)];
    assert.equal(slaActual(yaNo, "prefiltro_pasado", at(7)).breached, false);
    assert.equal(fueraDeSlaEnGate(yaNo, "prefiltro_pasado", at(7)), false);

    // Sigue en enviado y ya va en 6 días.
    const ahora = [ev("prefiltro_enviado", 0)];
    assert.equal(fueraDeSlaEnGate(ahora, "prefiltro_enviado", at(6)), true);

    const input = baseInput();
    input.now = at(7);
    input.vacancies = [
      { id: "v", title: "V", area: "A", country: "Colombia", status: "open", owner_recruiter_id: null },
    ];
    input.candidates = [
      { id: "past", name: "Pasado", vacancy_id: "v", stage: "prefiltro_pasado", source: "web", created_at: at(0), rejected: false },
      { id: "now", name: "Ahora", vacancy_id: "v", stage: "prefiltro_enviado", source: "web", created_at: at(0), rejected: false },
    ];
    input.events = [
      { candidate_id: "past", to_stage: "prefiltro_enviado", changed_at: at(0), source: "ui" },
      { candidate_id: "past", to_stage: "prefiltro_pasado", changed_at: at(6), source: "ui" },
      { candidate_id: "now", to_stage: "prefiltro_enviado", changed_at: at(0), source: "ui" },
    ];
    const d = buildDashboard(input);
    assert.equal(d.kpis.sla.n, 2);
    assert.equal(d.kpis.sla.over, 1);
  });

  it("backfill actual o historial que no cuadra queda fuera del porcentaje", () => {
    const backfillAhora = [ev("prefiltro_enviado", 0), ev("prefiltro_pasado", 2, "backfill")];
    const clock = slaActual(backfillAhora, "prefiltro_pasado", at(9));
    assert.equal(clock.evaluable, false);
    assert.equal(clock.approx, true);
    assert.equal(clock.breached, false);

    const noCuadra = slaActual([ev("prefiltro_enviado", 0)], "prefiltro_pasado", at(6));
    assert.equal(noCuadra.evaluable, false);
    assert.equal(noCuadra.approx, true);
  });

  it("el filtro de etapa mueve el SLA y no el embudo", () => {
    const all = buildDashboard(exampleInput());
    const only = buildDashboard({
      ...exampleInput(),
      filters: { ...emptyFilters(), stageGateId: "prefiltro" },
    });
    assert.equal(only.funnel.find((g) => g.n === 1)?.reached, all.funnel.find((g) => g.n === 1)?.reached);
    assert.ok((only.kpis.sla.n ?? 0) < all.kpis.sla.n);
    assert.equal(only.kpis.sla.over, 3);
  });
});

describe("periodo de TTH y offer, conteo de abiertas, TTF con canal", () => {
  it("quien aplicó antes y se contrató en el periodo entra a TTH y a offer", () => {
    const input = baseInput();
    input.now = at(40);
    input.filters = { ...emptyFilters(), from: at(10), to: at(20) };
    input.vacancies = [
      { id: "v", title: "V", area: "A", country: "Colombia", status: "closed", owner_recruiter_id: null },
    ];
    input.candidates = [{
      id: "h",
      name: "Antes",
      vacancy_id: "v",
      stage: "contratado",
      source: "web",
      created_at: at(0),
      rejected: false,
    }];
    input.events = [
      { candidate_id: "h", to_stage: "aplico", changed_at: at(0), source: "ui" },
      { candidate_id: "h", to_stage: "oferta", changed_at: at(12), source: "ui" },
      { candidate_id: "h", to_stage: "contratado", changed_at: at(15), source: "ui" },
    ];
    const d = buildDashboard(input);
    assert.equal(d.kpis.tth.n, 1);
    assert.equal(d.kpis.tth.insufficient, true);
    assert.equal(d.kpis.offer.accepted, 1);
    assert.equal(d.kpis.offer.n, 1);
    assert.equal(d.kpis.conversion.n, 0);
  });

  it("dos vacantes abiertas se muestran aunque n<5", () => {
    const input = baseInput();
    input.vacancies = [
      { id: "o1", title: "A", area: "A", country: "Colombia", status: "open", owner_recruiter_id: null },
      { id: "o2", title: "B", area: "A", country: "Colombia", status: "open", owner_recruiter_id: null },
    ];
    input.milestones = [];
    const d = buildDashboard(input);
    assert.equal(d.kpis.open.value, 2);
    assert.equal(d.kpis.open.n, 2);
    assert.equal(d.kpis.open.insufficient, false);
    assert.equal(d.kpis.open.agingInsufficient, true);
  });

  it("el filtro de canal no saca del TTF una vacante sin candidatos de ese canal", () => {
    const input = baseInput();
    input.filters = { ...emptyFilters(), source: "LinkedIn" };
    input.vacancies = [
      { id: "v", title: "V", area: "A", country: "Colombia", status: "closed", owner_recruiter_id: null },
    ];
    input.milestones = [{ vacancy_id: "v", hr_request_date: at(0), hire_date: at(10) }];
    input.candidates = [{
      id: "c",
      name: "C",
      vacancy_id: "v",
      stage: "aplico",
      source: "Referido",
      created_at: at(1),
      rejected: false,
    }];
    const d = buildDashboard(input);
    assert.equal(d.kpis.ttf.n, 1);
  });
});

describe("offer accept con Docs después de Oferta", () => {
  it("gate ≥10 y gate 12, con o sin Docs", () => {
    const rows = [
      { events: [ev("oferta", 1), ev("contratado", 5)], rejected: false },
      { events: [ev("oferta", 1), ev("documentacion_ingreso", 3), ev("contratado", 6)], rejected: false },
      { events: [ev("documentacion_ingreso", 2), ev("contratado", 4)], rejected: false },
      { events: [ev("oferta", 1), ev("rechazado", 4)], rejected: true },
      { events: [ev("oferta", 1)], rejected: false },
    ];
    // Tres aceptados, un rechazado resuelto, uno pendiente. n resuelto = 4 < 5.
    const small = offerAccept(rows, { from: null, to: null });
    assert.equal(small.accepted, 3);
    assert.equal(small.resolved, 4);
    assert.equal(small.pending, 1);
    assert.equal(small.rate, null);

    const enough = offerAccept(
      [...rows, { events: [ev("oferta", 2), ev("contratado", 8)], rejected: false }],
      { from: null, to: null },
    );
    assert.equal(enough.accepted, 4);
    assert.equal(enough.resolved, 5);
    assert.equal(enough.rate, 80);
    assert.equal(enough.insufficient, false);
  });
});

describe("TTF, TTH, aging y drill", () => {
  it("la fixture de ejemplo cumple las fórmulas y no esconde gates", () => {
    const d = buildDashboard(exampleInput());
    assert.equal(d.example, true);
    assert.equal(d.kpis.ttf.value, 27);
    assert.equal(d.kpis.ttf.n, 6);
    assert.equal(d.kpis.tth.value, 16);
    assert.equal(d.kpis.tth.n, 6);
    assert.equal(d.kpis.offer.accepted, 6);
    assert.equal(d.kpis.offer.resolved, 8);
    assert.equal(d.kpis.open.n, 6);
    assert.equal(d.kpis.open.value, 6);
    assert.equal(d.kpis.open.sinHito, 2);
    assert.equal(d.kpis.open.agingInsufficient, true);
    assert.equal(d.kpis.quality90.placeholder, true);
    assert.equal(d.kpis.cost.placeholder, true);
    const sinHito = d.vacancies.filter((v) => v.agingLabel === SIN_HITO);
    assert.equal(sinHito.length, 2);
    assert.equal(d.funnel.filter((g) => g.sinCodigo).map((g) => g.n).join(","), "6,8");
    const drill = buildDrill(exampleInput(), "v7");
    assert.ok(drill.rows.length >= 1);
    assert.equal(JSON.stringify(drill).includes("email"), false);
    assert.equal(JSON.stringify(drill).includes("phone"), false);
    assert.ok(drill.rows.every((r) => r.href === null));
    assert.ok(drill.rows.every((r) => !r.stageLabel.includes("_")));
  });
});

describe("costo salarial base", () => {
  it("salario / 30 × días, sin created_at, y no publica el salario", () => {
    const d = buildDashboard(exampleInput());
    const cop = d.kpis.salaryCost.byCurrency.find((c) => c.currency === "COP")!;
    const usd = d.kpis.salaryCost.byCurrency.find((c) => c.currency === "USD")!;
    assert.equal(d.kpis.salaryCost.formula, "salario mensual / 30 × días abierta");
    assert.equal(d.kpis.salaryCost.openTotal, 6);
    assert.equal(d.kpis.salaryCost.openWithSalary, 2);
    assert.equal(d.kpis.salaryCost.partialCoverage, true);
    assert.equal(d.kpis.cost.placeholder, true);
    assert.ok(Math.abs((cop.openAvgDaily ?? 0) - 4_000_000 / 30) < 1e-6);
    assert.ok(Math.abs((cop.openAccumulated ?? 0) - (4_000_000 / 30) * 10) < 1e-4);
    assert.equal(cop.hiredN, 5);
    assert.equal(cop.hiredInsufficient, false);
    assert.ok(Math.abs((cop.hiredAccumulated ?? 0) - (3_000_000 / 30) * 136) < 1e-2);
    assert.equal(d.kpis.salaryCost.openByCap, 1);
    assert.equal(d.kpis.salaryCost.openByMidpoint, 1);
    assert.equal(d.kpis.salaryCost.openSinDato, 4);
    assert.equal(d.kpis.salaryCost.closedWithoutHire, 0);
    assert.ok(Math.abs((usd.openAccumulated ?? 0) - 1_900) < 1e-6);
    assert.notEqual(cop.openAccumulated, (cop.openAccumulated ?? 0) + (usd.openAccumulated ?? 0));

    const abierta = d.vacancies.find((v) => v.id === "v7")!;
    assert.equal(abierta.open, true);
    assert.equal(abierta.cost.salarySource, "tope_interno");
    assert.equal(abierta.cost.currency, "COP");
    assert.equal(JSON.stringify(abierta).includes("monthly"), false);
    assert.equal(JSON.stringify(abierta).includes("4000000"), false);
    const rango = d.vacancies.find((v) => v.id === "v8")!;
    assert.equal(rango.cost.salarySource, "punto_medio_rango");
    assert.equal(rango.cost.currency, "USD");
    const sin = d.vacancies.find((v) => v.id === "v9")!;
    assert.equal(sin.cost.salarySource, "sin_dato");
    assert.equal(sin.cost.sinDato, "sin_salario");
    assert.equal(sin.cost.dailyCost, null);

    const drill = buildDrill(exampleInput(), "v7");
    const packed = JSON.stringify(drill);
    assert.equal(packed.includes("monthly"), false);
    assert.equal(packed.includes("salary_cap"), false);
    assert.equal(packed.includes("4000000"), false);
    assert.equal(d.vacancies.filter((v) => v.open).length, 6);
    for (const closed of d.vacancies.filter((v) => !v.open)) {
      assert.equal(closed.cost.dailyCost, null);
      assert.equal(closed.cost.costToDate, null);
      assert.equal(closed.cost.daysOpen, null);
      assert.equal(closed.cost.currency, null);
      assert.equal(JSON.stringify(closed.cost).includes("3000000"), false);
    }
  });

  it("sin hr_request_date es sin dato y la cerrada sin contratación no lleva monto", () => {
    const input = baseInput();
    input.now = at(40);
    input.vacancies = [
      {
        id: "abierta",
        title: "Sin hito",
        area: "A",
        country: "Colombia",
        status: "open",
        owner_recruiter_id: null,
        salary_cap_amount: 3_000_000,
        salary_cap_currency: "COP",
      },
      {
        id: "sin-hire",
        title: "Cerrada sin contratación",
        area: "A",
        country: "Colombia",
        status: "closed",
        owner_recruiter_id: null,
        salary_cap_amount: 3_000_000,
        salary_cap_currency: "COP",
      },
      {
        id: "un-extremo",
        title: "Un extremo",
        area: "A",
        country: "Colombia",
        status: "open",
        owner_recruiter_id: null,
        salary_texts: ["4.000.000 COP"],
      },
    ];
    input.milestones = [
      { vacancy_id: "sin-hire", hr_request_date: at(0), hire_date: null },
      { vacancy_id: "un-extremo", hr_request_date: at(0), hire_date: null },
    ];
    const d = buildDashboard(input);
    const sinHito = d.vacancies.find((v) => v.id === "abierta")!;
    assert.equal(sinHito.cost.sinDato, "sin_hito");
    assert.equal(sinHito.cost.costToDate, null);
    assert.equal(sinHito.cost.daysOpen, null);
    assert.equal(sinHito.cost.salarySource, "tope_interno");
    const sinHire = d.vacancies.find((v) => v.id === "sin-hire")!;
    assert.equal(sinHire.open, false);
    assert.equal(sinHire.cost.dailyCost, null);
    assert.equal(sinHire.cost.costToDate, null);
    assert.equal(d.kpis.salaryCost.closedWithoutHire, 1);
    const unExtremo = d.vacancies.find((v) => v.id === "un-extremo")!;
    assert.equal(unExtremo.cost.salarySource, "sin_dato");
    assert.equal(unExtremo.cost.dailyCost, null);
    assert.equal(d.kpis.salaryCost.byCurrency.find((c) => c.hiredN > 0), undefined);
    assert.equal(d.kpis.salaryCost.openWithSalary, 1);
    assert.equal(d.kpis.salaryCost.openTotal, 2);
    assert.equal(d.kpis.salaryCost.openByCap, 1);
    assert.equal(d.kpis.salaryCost.openByMidpoint, 0);
    assert.equal(d.kpis.salaryCost.openSinDato, 1);
  });

  it("una abierta con hire_date sigue acumulando hasta hoy", () => {
    const input = baseInput();
    input.now = at(40);
    input.vacancies = [
      {
        id: "sigue",
        title: "Abierta con hire",
        area: "A",
        country: "Colombia",
        status: "open",
        owner_recruiter_id: null,
        salary_cap_amount: 3_000_000,
        salary_cap_currency: "COP",
      },
    ];
    input.milestones = [{ vacancy_id: "sigue", hr_request_date: at(0), hire_date: at(10) }];
    const d = buildDashboard(input);
    const row = d.vacancies.find((v) => v.id === "sigue")!;
    assert.equal(row.open, true);
    assert.ok(Math.abs((row.cost.daysOpen ?? 0) - 40) < 1e-6);
    assert.ok(Math.abs((row.cost.costToDate ?? 0) - (3_000_000 / 30) * 40) < 1e-2);
  });

  it("el canal deja fuera una vacante sin candidatos de ese canal", () => {
    const input = baseInput();
    input.now = at(30);
    input.filters = { ...emptyFilters(), source: "LinkedIn" };
    input.vacancies = [
      {
        id: "li",
        title: "Con LinkedIn",
        area: "A",
        country: "Colombia",
        status: "open",
        owner_recruiter_id: null,
        salary_cap_amount: 3_000_000,
        salary_cap_currency: "COP",
      },
      {
        id: "ref",
        title: "Solo referido",
        area: "A",
        country: "Colombia",
        status: "open",
        owner_recruiter_id: null,
        salary_cap_amount: 6_000_000,
        salary_cap_currency: "COP",
      },
    ];
    input.milestones = [
      { vacancy_id: "li", hr_request_date: at(0), hire_date: null },
      { vacancy_id: "ref", hr_request_date: at(0), hire_date: null },
    ];
    input.candidates = [
      { id: "a", name: "A", vacancy_id: "li", stage: "aplico", source: "LinkedIn", created_at: at(1), rejected: false },
      { id: "b", name: "B", vacancy_id: "ref", stage: "aplico", source: "Referido", created_at: at(1), rejected: false },
    ];
    const d = buildDashboard(input);
    assert.equal(d.kpis.salaryCost.openTotal, 1);
    assert.equal(d.vacancies.find((v) => v.id === "ref")?.inCostScope, false);
    assert.equal(d.vacancies.find((v) => v.id === "li")?.inCostScope, true);
    const cop = d.kpis.salaryCost.byCurrency[0];
    assert.ok(Math.abs((cop.openAccumulated ?? 0) - (3_000_000 / 30) * 30) < 1e-2);
    assert.ok((cop.openAccumulated ?? 0) < (6_000_000 / 30) * 30);
  });
});

function baseInput(): DashboardInput {
  return {
    candidates: [],
    events: [],
    vacancies: [
      { id: "v0", title: "Vacante", area: "A", country: "Colombia", status: "closed", owner_recruiter_id: null },
      { id: "v1", title: "B", area: "A", country: "Colombia", status: "closed", owner_recruiter_id: null },
      { id: "v2", title: "C", area: "A", country: "Colombia", status: "closed", owner_recruiter_id: null },
    ],
    milestones: [],
    recruiters: [],
    agingTargetDays: 21,
    filters: emptyFilters(),
    now: at(40),
  };
}
