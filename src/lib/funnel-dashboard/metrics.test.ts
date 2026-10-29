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
    assert.equal(fueraDeSlaEnGate(passed, "prefiltro", at(6)), true);
    assert.equal(daySpan(at(0), at(6)) < 9, true);

    // 3 + 1 + 1, el código actual dentro de su SLA.
    const inside = [ev("prefiltro_enviado", 0), ev("prefiltro_pasado", 3), ev("prefiltro_revision", 4)];
    assert.equal(fueraDeSlaEnGate(inside, "prefiltro", at(5)), false);

    // El código actual es pasado (SLA 2) y ya lleva 3 días.
    const ahoraPasado = [ev("prefiltro_enviado", 0), ev("prefiltro_pasado", 3)];
    assert.equal(fueraDeSlaEnGate(ahoraPasado, "prefiltro", at(6)), true);

    // Justo en el SLA no es fuera (> estricto).
    assert.equal(fueraDeSlaEnGate([ev("prefiltro_enviado", 0)], "prefiltro", at(5)), false);

    // Backfill no cuenta como incumplimiento.
    assert.equal(
      fueraDeSlaEnGate([ev("prefiltro_enviado", 0, "backfill")], "prefiltro", at(30)),
      false,
    );
  });

  it("solo cuenta quien se pasa en el código actual", () => {
    // 6 días en enviado (SLA 5) y hoy 1 día en pasado (SLA 2): el incumplimiento ya pasó.
    const yaNo = [ev("prefiltro_enviado", 0), ev("prefiltro_pasado", 6)];
    assert.equal(fueraDeSlaEnGate(yaNo, "prefiltro", at(7)), false);

    // Sigue en enviado y ya va en 6 días.
    const ahora = [ev("prefiltro_enviado", 0)];
    assert.equal(fueraDeSlaEnGate(ahora, "prefiltro", at(6)), true);

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
