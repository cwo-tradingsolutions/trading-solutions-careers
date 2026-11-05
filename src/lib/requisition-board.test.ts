import assert from "node:assert/strict";
import test from "node:test";
import {
  ETAPAS_CONTRATADO,
  esContratado,
  estadoTablero,
  relojSla,
} from "./requisition-board";

const HSE = {
  vacancyId: "d369cefb-4f1e-4ba7-bc1e-b050fdf9ae5f",
  requisitionId: "102afa5c-ca0a-4a6f-9f52-66b8015b5cf8",
};
const TA = {
  vacancyId: "e1d70c1a-84c1-49d2-9b76-8c66ef6fe569",
  requisitionId: "067f092b-d8f9-4bbd-931e-638e04eea9b8",
};

test("HSE cerrada con contratado se ve Hired y el SLA no queda vencido", () => {
  const estado = estadoTablero({
    reqStatus: "publicada",
    vacancyStatus: "closed",
    tieneContratado: true,
  });
  const reloj = relojSla(estado.terminal, 49, 22, 49);

  assert.equal(estado.status, "contratada");
  assert.equal(estado.status_label, "Hired");
  assert.equal(estado.status_label_es, "Contratada");
  assert.equal(estado.terminal, true);
  assert.equal(reloj.sla_activo, false);
  assert.equal(reloj.dias_desde_aprobacion, null);
  assert.equal(reloj.meta_dias, null);
  assert.equal(reloj.dias_en_estado, null);
  assert.equal(
    reloj.dias_desde_aprobacion != null &&
      reloj.meta_dias != null &&
      reloj.dias_desde_aprobacion > reloj.meta_dias,
    false,
  );
  assert.ok(HSE.vacancyId && HSE.requisitionId);
});

test("TA cerrada sin contratado se ve Closed, no Posted", () => {
  const estado = estadoTablero({
    reqStatus: "publicada",
    vacancyStatus: "closed",
    tieneContratado: false,
  });
  const reloj = relojSla(estado.terminal, 41, 22, 41);

  assert.equal(estado.status, "cerrada");
  assert.equal(estado.status_label, "Closed");
  assert.equal(estado.status_label_es, "Cerrada");
  assert.equal(reloj.sla_activo, false);
  assert.equal(reloj.dias_desde_aprobacion, null);
  assert.ok(TA.vacancyId);
});

test("TA todavía open en staging sigue Posted con el reloj andando", () => {
  const estado = estadoTablero({
    reqStatus: "publicada",
    vacancyStatus: "open",
    tieneContratado: false,
  });
  const reloj = relojSla(estado.terminal, 41, 22, 12);

  assert.equal(estado.status, "publicada");
  assert.equal(estado.status_label, "Publicada");
  assert.equal(estado.terminal, false);
  assert.equal(reloj.sla_activo, true);
  assert.equal(reloj.dias_desde_aprobacion, 41);
  assert.equal(reloj.meta_dias, 22);
  assert.equal(reloj.dias_en_estado, 12);
});

test("un contratado con la vacante todavía abierta ya es Hired", () => {
  const estado = estadoTablero({
    reqStatus: "publicada",
    vacancyStatus: "open",
    tieneContratado: true,
  });
  assert.equal(estado.status_label, "Hired");
  assert.equal(estado.terminal, true);
});

test("cancelled y filled sin contratado son Closed; paused sigue en el circuito", () => {
  assert.equal(
    estadoTablero({ reqStatus: "publicada", vacancyStatus: "cancelled", tieneContratado: false })
      .status_label,
    "Closed",
  );
  assert.equal(
    estadoTablero({ reqStatus: "publicada", vacancyStatus: "filled", tieneContratado: false })
      .status_label,
    "Closed",
  );
  const pausa = estadoTablero({
    reqStatus: "publicada",
    vacancyStatus: "paused",
    tieneContratado: false,
  });
  assert.equal(pausa.status, "publicada");
  assert.equal(pausa.status_label, "Publicada");
  assert.equal(pausa.terminal, false);
});

test("sin vacante, el circuito de aprobación no se reescribe", () => {
  for (const reqStatus of ["pedida", "con_perfil", "devuelta", "aprobada", "rechazada"] as const) {
    const estado = estadoTablero({ reqStatus, vacancyStatus: null, tieneContratado: false });
    assert.equal(estado.status, reqStatus);
    assert.equal(estado.terminal, false);
  }
});

test("onboarding histórico cuenta como contratado; rechazado no", () => {
  assert.equal(esContratado("contratado"), true);
  assert.equal(esContratado("onboarding"), true);
  assert.equal(esContratado("oferta"), false);
  assert.equal(esContratado("rechazado"), false);
  assert.ok(ETAPAS_CONTRATADO.includes("contratado"));
  assert.ok(ETAPAS_CONTRATADO.includes("onboarding"));
  assert.equal(ETAPAS_CONTRATADO.includes("oferta"), false);
});
