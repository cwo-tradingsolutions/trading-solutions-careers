import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STAGES } from "./stage-labels";
import {
  camposBoard,
  conteosEtapa,
  cuentaComoContratado,
  type CandidatoBoard,
  type EventoEtapa,
  type HitosFechas,
} from "./requisition-board";

const HSE = "d369cefb-4f1e-4ba7-bc1e-b050fdf9ae5f";
const TA = "e1d70c1a-84c1-49d2-9b76-8c66ef6fe569";

const CLAVES_HITOS: (keyof HitosFechas)[] = [
  "aprobada_el",
  "publicada_el",
  "primera_aplicacion_el",
  "terna_el",
  "entrevista_el",
  "oferta_el",
  "contratado_el",
  "cerrada_el",
];

function persona(partial: Partial<CandidatoBoard> & Pick<CandidatoBoard, "id" | "stage">): CandidatoBoard {
  return {
    vacancy_id: HSE,
    status: "active",
    email: `${partial.id}@example.com`,
    name: `Persona ${partial.id}`,
    created_at: "2026-09-01T15:00:00.000Z",
    updated_at: "2026-11-05T21:49:45.000Z",
    ...partial,
  };
}

function evento(partial: Partial<EventoEtapa> & Pick<EventoEtapa, "candidate_id" | "to_stage" | "changed_at">): EventoEtapa {
  return { source: "ui", ...partial };
}

test("abierta: estado_final null, el SLA sigue y el status de aprobación no se toca", () => {
  const campos = camposBoard({
    vacancyStatus: "open",
    approvedAt: "2026-09-07T20:10:50.000Z",
    publicadaEn: ["2026-09-08T14:00:00.000Z"],
    candidatos: [
      persona({ id: "a1", stage: "aplico", created_at: "2026-09-10T12:00:00.000Z" }),
      persona({ id: "a2", stage: "rechazado", status: "rejected", created_at: "2026-09-11T12:00:00.000Z" }),
    ],
    hireDate: null,
    closedAt: null,
  });

  assert.equal(campos.estado_final, null);
  assert.equal(campos.sla_activo, true);
  assert.equal(campos.candidatos_total, 2);
  assert.equal(campos.conteos.aplico, 1);
  assert.equal(campos.conteos.contratado, 0);
  assert.equal(campos.hitos_fechas.aprobada_el, "2026-09-07T20:10:50.000Z");
  assert.equal(campos.hitos_fechas.publicada_el, "2026-09-08T14:00:00.000Z");
  assert.equal(campos.hitos_fechas.primera_aplicacion_el, "2026-09-10T12:00:00.000Z");
  assert.equal(campos.hitos_fechas.cerrada_el, null);
  assert.equal(campos.hitos_fechas.contratado_el, null);
  assert.deepEqual(Object.keys(campos.hitos_fechas), CLAVES_HITOS);
});

test("cerrada sin contratado: estado_final cerrada y el SLA apagado", () => {
  const campos = camposBoard({
    vacancyStatus: "closed",
    approvedAt: "2026-08-26T22:15:17.000Z",
    publicadaEn: ["2026-08-26T23:16:07.000Z"],
    candidatos: [
      persona({
        id: "t-oferta",
        vacancy_id: TA,
        stage: "oferta",
        status: "pending",
        created_at: "2026-09-02T15:00:00.000Z",
      }),
      persona({
        id: "t-rej",
        vacancy_id: TA,
        stage: "rechazado",
        status: "rejected",
        created_at: "2026-09-03T15:00:00.000Z",
      }),
    ],
    eventos: [
      evento({
        candidate_id: "t-oferta",
        to_stage: "oferta",
        changed_at: "2026-10-20T16:00:00.000Z",
      }),
    ],
    hireDate: null,
    closedAt: null,
  });

  assert.equal(campos.estado_final, "cerrada");
  assert.equal(campos.sla_activo, false);
  assert.equal(campos.conteos.oferta, 1);
  assert.equal(campos.conteos.contratado, 0);
  assert.equal(campos.hitos_fechas.oferta_el, "2026-10-20T16:00:00.000Z");
  assert.equal(campos.hitos_fechas.contratado_el, null);
  assert.equal(campos.hitos_fechas.cerrada_el, null);
});

test("contratada: un stage hired o contratado gana sobre la vacante closed", () => {
  const campos = camposBoard({
    vacancyStatus: "closed",
    approvedAt: "2026-09-07T20:10:50.000Z",
    candidatos: [
      persona({
        id: "h1",
        stage: "hired",
        status: "completed",
        name: "No Debe Salir",
        email: "no-sale@example.com",
        created_at: "2026-09-12T15:00:00.000Z",
        updated_at: "2026-10-07T22:17:39.000Z",
      }),
      persona({ id: "h2", stage: "aplico", status: "rejected" }),
    ],
    eventos: [
      evento({
        candidate_id: "h1",
        to_stage: "hired",
        changed_at: "2026-10-07T22:17:39.000Z",
        source: "ui",
      }),
      evento({
        candidate_id: "h1",
        to_stage: "contratado",
        changed_at: "2026-09-01T00:00:00.000Z",
        source: "backfill",
      }),
    ],
    hireDate: "2026-10-01",
    closedAt: null,
  });

  assert.equal(campos.estado_final, "contratada");
  assert.equal(campos.sla_activo, false);
  assert.equal(campos.conteos.contratado, 1);
  assert.equal(campos.hitos_fechas.contratado_el, "2026-10-07T22:17:39.000Z");
  assert.equal(campos.hitos_fechas.cerrada_el, null);

  const serializado = JSON.stringify(campos);
  assert.equal(serializado.includes("No Debe Salir"), false);
  assert.equal(serializado.includes("no-sale@example.com"), false);
  assert.equal(serializado.includes("salario"), false);
  assert.equal(serializado.includes("salary"), false);
});

test("conteos en cerradas: rechazados entran al total, hired entra a la etapa, abiertas no se inflan", () => {
  const cerrada = [
    persona({ id: "c1", stage: "contratado", status: "completed" }),
    persona({ id: "c2", stage: "oferta", status: "pending" }),
    persona({ id: "c3", stage: "rechazado", status: "rejected" }),
    persona({ id: "c4", stage: "aplico", status: "rejected" }),
    persona({
      id: "c5",
      stage: "aplico",
      status: "active",
      email: "recruiting@tradingsolutions.com",
    }),
    persona({
      id: "c6",
      stage: "hired",
      status: "completed",
      email: "interna@tradingsolutions.com",
    }),
  ];
  const conteos = conteosEtapa(cerrada);
  const campos = camposBoard({ vacancyStatus: "closed", candidatos: cerrada });

  assert.equal(campos.candidatos_total, 5);
  assert.equal(conteos.contratado, 2);
  assert.equal(conteos.oferta, 1);
  assert.equal(conteos.aplico, 0);
  assert.equal(conteos.rechazado, undefined);
  for (const stage of STAGES) {
    if (stage.id !== "contratado" && stage.id !== "oferta") {
      assert.equal(conteos[stage.id], 0, stage.id);
    }
  }

  const abierta = camposBoard({
    vacancyStatus: "open",
    candidatos: [
      persona({ id: "o1", stage: "terna", status: "active" }),
      persona({
        id: "o2",
        stage: "aplico",
        status: "active",
        email: "staff@tradingsolutions.com",
      }),
    ],
  });
  assert.equal(abierta.estado_final, null);
  assert.equal(abierta.sla_activo, true);
  assert.equal(abierta.candidatos_total, 1);
  assert.equal(abierta.conteos.terna, 1);
  assert.equal(abierta.conteos.aplico, 0);
});

test("onboarding cuenta como contratado; rechazado con stage hired no", () => {
  assert.equal(cuentaComoContratado({ stage: "onboarding", status: "completed" }), true);
  assert.equal(cuentaComoContratado({ stage: "contratado", status: "completed" }), true);
  assert.equal(cuentaComoContratado({ stage: "hired", status: "rejected" }), false);
  assert.equal(cuentaComoContratado({ stage: "oferta", status: "pending" }), false);

  const abiertaConAlta = camposBoard({
    vacancyStatus: "open",
    candidatos: [persona({ id: "x", stage: "onboarding", status: "completed" })],
  });
  assert.equal(abiertaConAlta.estado_final, "contratada");
  assert.equal(abiertaConAlta.sla_activo, false);
});

test("paused sigue abierta; cancelled y filled sin alta quedan cerradas", () => {
  assert.equal(
    camposBoard({
      vacancyStatus: "paused",
      candidatos: [persona({ id: "p", stage: "aplico" })],
    }).estado_final,
    null,
  );
  assert.equal(camposBoard({ vacancyStatus: "cancelled", candidatos: [] }).estado_final, "cerrada");
  assert.equal(camposBoard({ vacancyStatus: "filled", candidatos: [] }).estado_final, "cerrada");
  assert.equal(camposBoard({ vacancyStatus: null, candidatos: [] }).estado_final, null);
});

test("hitos: solo fechas reales; backfill, updated_at y un cierre no registrado quedan null", () => {
  const campos = camposBoard({
    vacancyStatus: "closed",
    approvedAt: null,
    publicadaEn: [null, "2026-09-09T18:00:00.000Z", "2026-09-15T18:00:00.000Z"],
    candidatos: [
      persona({
        id: "f1",
        stage: "terna",
        created_at: "2026-09-12T15:04:00.000Z",
        updated_at: "2026-11-01T00:00:00.000Z",
      }),
    ],
    eventos: [
      evento({
        candidate_id: "f1",
        to_stage: "shortlist",
        changed_at: "2026-09-20T15:00:00.000Z",
        source: "backfill",
      }),
      evento({
        candidate_id: "f1",
        to_stage: "terna",
        changed_at: "2026-09-28T15:30:00.000Z",
        source: "ui",
      }),
      evento({
        candidate_id: "f1",
        to_stage: "recruiter_interview",
        changed_at: "2026-09-18T13:00:00.000Z",
        source: "system",
      }),
      evento({
        candidate_id: "f1",
        to_stage: "entrevista_ia",
        changed_at: "2026-09-25T13:00:00.000Z",
        source: "ui",
      }),
      evento({
        candidate_id: "otro",
        to_stage: "oferta",
        changed_at: "2026-08-01T00:00:00.000Z",
        source: "ui",
      }),
    ],
    hireDate: null,
    closedAt: null,
  });

  assert.equal(campos.hitos_fechas.aprobada_el, null);
  assert.equal(campos.hitos_fechas.publicada_el, "2026-09-09T18:00:00.000Z");
  assert.equal(campos.hitos_fechas.primera_aplicacion_el, "2026-09-12T15:04:00.000Z");
  assert.equal(campos.hitos_fechas.terna_el, "2026-09-28T15:30:00.000Z");
  assert.equal(campos.hitos_fechas.entrevista_el, "2026-09-18T13:00:00.000Z");
  assert.equal(campos.hitos_fechas.oferta_el, null);
  assert.equal(campos.hitos_fechas.contratado_el, null);
  assert.equal(campos.hitos_fechas.cerrada_el, null);
  assert.equal(JSON.stringify(campos.hitos_fechas).includes("2026-11-01"), false);
});

test("hire_date no fabrica un alta si nadie está contratado", () => {
  const campos = camposBoard({
    vacancyStatus: "closed",
    candidatos: [persona({ id: "solo-oferta", stage: "oferta", status: "pending" })],
    hireDate: "2026-10-07",
    closedAt: null,
  });
  assert.equal(campos.estado_final, "cerrada");
  assert.equal(campos.hitos_fechas.contratado_el, null);
  assert.equal(campos.hitos_fechas.cerrada_el, null);
});

test("contratado_el usa hire_date solo cuando no hay evento real de alta", () => {
  const campos = camposBoard({
    vacancyStatus: "closed",
    candidatos: [persona({ id: "z", stage: "contratado", status: "completed" })],
    eventos: [
      evento({
        candidate_id: "z",
        to_stage: "contratado",
        changed_at: "2026-10-02T12:00:00.000Z",
        source: "backfill",
      }),
    ],
    hireDate: "2026-10-07",
  });
  assert.equal(campos.estado_final, "contratada");
  assert.equal(campos.hitos_fechas.contratado_el, "2026-10-07T00:00:00.000Z");
});

test("el route del board agrega los campos y no selecciona salario ni reescribe status", () => {
  const src = readFileSync(new URL("../app/api/leader/board/route.ts", import.meta.url), "utf8");
  assert.match(src, /camposBoard\(/);
  assert.match(src, /estado_final: campos\.estado_final/);
  assert.match(src, /sla_activo: campos\.sla_activo/);
  assert.match(src, /candidatos_total: campos\.candidatos_total/);
  assert.match(src, /hitos_fechas: campos\.hitos_fechas/);
  assert.match(src, /status: r\.status as RequisitionStatus/);
  assert.match(src, /correoDelLider\(req\)/);
  assert.match(src, /\.ilike\("lead_email", leadEmail\)/);
  assert.equal(src.includes("salary"), false);
  assert.equal(src.includes("salario"), false);
});
