import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canalPostulacionPublica,
  CANDIDATE_SOURCE_VALUES,
  etiquetaCanal,
  validarCanalReclutador,
  MSG_CANAL_OBLIGATORIO,
} from "./candidate-source.ts";
import { validarFechasVacante, MSG_FECHA_APERTURA, MSG_FECHA_OBJETIVO, MSG_OBJETIVO_SIN_COLUMNA } from "./vacancy-dates.ts";
import { REJECTION_CATEGORY_KEYS, validarRechazo, MSG_RECHAZO_CATEGORIA } from "./rejection-rules.ts";

describe("canal", () => {
  it("exige un origen que ya existe al crear o editar desde HR", () => {
    const vacio = validarCanalReclutador("");
    assert.equal(vacio.ok, false);
    if (!vacio.ok) assert.equal(vacio.error, MSG_CANAL_OBLIGATORIO);
    const ok = validarCanalReclutador("linkedin_recruiter");
    assert.equal(ok.ok, true);
  });

  it("no inventa orígenes", () => {
    assert.equal(CANDIDATE_SOURCE_VALUES.includes("otro" as never), false);
    assert.equal(CANDIDATE_SOURCE_VALUES.includes("careers_site" as never), false);
    const inventado = validarCanalReclutador("careers_site");
    assert.equal(inventado.ok, false);
  });

  it("la postulación pública no se bloquea y usa public_form", () => {
    assert.equal(canalPostulacionPublica({}), "public_form");
    assert.equal(canalPostulacionPublica({ ref: "interno" }), "public_form_internal");
    assert.equal(etiquetaCanal(null), "Sin canal");
    assert.equal(etiquetaCanal(""), "Sin canal");
  });
});

describe("fechas de la vacante", () => {
  it("siempre exige la apertura", () => {
    const vacio = validarFechasVacante("", "2026-12-01", true);
    assert.equal(vacio.ok, false);
    if (!vacio.ok) assert.equal(vacio.error, MSG_FECHA_APERTURA);
  });

  it("exige el cierre solo cuando la columna existe", () => {
    const sinColumna = validarFechasVacante("2026-10-01", "", false);
    assert.equal(sinColumna.ok, true);
    if (sinColumna.ok) {
      assert.equal(sinColumna.apertura, "2026-10-01");
      assert.equal(sinColumna.objetivo, null);
      assert.equal(sinColumna.aviso, MSG_OBJETIVO_SIN_COLUMNA);
    }
    const falta = validarFechasVacante("2026-10-01", "", true);
    assert.equal(falta.ok, false);
    if (!falta.ok) assert.equal(falta.error, MSG_FECHA_OBJETIVO);
    const ok = validarFechasVacante("2026-10-01", "2026-12-15", true);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.objetivo, "2026-12-15");
  });
});

describe("motivo de rechazo", () => {
  it("exige una categoría existente y deja la nota opcional", () => {
    const sin = validarRechazo({});
    assert.equal(sin.ok, false);
    if (!sin.ok) assert.equal(sin.error, MSG_RECHAZO_CATEGORIA);
    const ok = validarRechazo({ category_key: "idioma_insuficiente" });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.note, null);
    assert.equal(REJECTION_CATEGORY_KEYS.includes("idioma_insuficiente"), true);
    assert.equal(validarRechazo({ category_key: "motivo_inventado" }).ok, false);
  });
});
