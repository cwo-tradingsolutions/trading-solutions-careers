import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  etiquetaAvisoPrefiltro,
  parseSalaryRangeUsd,
  presentarExpectativaChina,
  textoSalarioAviso,
} from "./prefilter-salary.ts";

describe("parseSalaryRangeUsd", () => {
  it("lee miles con punto, coma o prefijo USD", () => {
    for (const raw of ["2.300", "2,300", "USD 2300"]) {
      const r = parseSalaryRangeUsd(raw);
      assert.ok(r, raw);
      assert.equal(r.min, 2300);
      assert.equal(r.max, 2300);
    }
  });

  it("toma el mínimo y el máximo de un rango", () => {
    const r = parseSalaryRangeUsd("1800-2000");
    assert.deepEqual(r, { min: 1800, max: 2000 });
  });

  it("ignora los centavos de un monto europeo", () => {
    const r = parseSalaryRangeUsd("1.500,00");
    assert.deepEqual(r, { min: 1500, max: 1500 });
  });

  it("no inventa un número cuando el texto no trae monto", () => {
    assert.equal(parseSalaryRangeUsd("a convenir"), null);
    assert.equal(parseSalaryRangeUsd(""), null);
    assert.equal(parseSalaryRangeUsd(null), null);
  });
});

describe("etiqueta del aviso", () => {
  it("PASA cuando la decisión es pass", () => {
    const e = etiquetaAvisoPrefiltro("pass", []);
    assert.equal(e.label, "PASA");
    assert.equal(e.emoji, "✅");
    assert.equal(e.enRojo, false);
  });

  it("REVISIÓN amarilla si el único bloqueo es el salario", () => {
    const e = etiquetaAvisoPrefiltro("review", [{ regla: "salario_sobre_tope" }]);
    assert.equal(e.label, "REVISIÓN");
    assert.equal(e.emoji, "🟡");
    assert.equal(e.enRojo, false);
  });

  it("no pone ROJO cuando el salario no vino informado", () => {
    const e = etiquetaAvisoPrefiltro("review", []);
    assert.equal(e.label, "REVISIÓN");
    assert.equal(e.emoji, "🟡");
    assert.equal(e.enRojo, false);
    assert.equal(textoSalarioAviso({}), "Salario no informado");
    assert.equal(textoSalarioAviso({ salary: "" }), "Salario no informado");
    assert.equal(textoSalarioAviso({ salary_usd: "1800-2000" }), "1800-2000");
    assert.equal(textoSalarioAviso({ salary: "4 – 5 M" }), "4 – 5 M");
    assert.equal(textoSalarioAviso({ salary_usd: "23401" }), "23401");
    assert.equal(textoSalarioAviso({ salary_cny: 18000 }), "18000 CNY");
    assert.equal(textoSalarioAviso({ salary_cny: "no", salary_usd: "1800-2000" }), "1800-2000");
  });

  it("EN ROJO solo con un bloqueo que no es el tope", () => {
    const e = etiquetaAvisoPrefiltro("review", [
      { regla: "salario_sobre_tope" },
      { regla: "autorizacion_trabajo" },
    ]);
    assert.equal(e.label, "EN ROJO · decide tú");
    assert.equal(e.emoji, "🔴");
    assert.equal(e.enRojo, true);
  });
});

describe("expectativa China ya guardada", () => {
  it("muestra un USD histórico como USD, aunque el texto sea 23401", () => {
    const exp = presentarExpectativaChina({
      salary_usd_expectation: "23401",
      salary_over_budget: true,
    });
    assert.ok(exp);
    assert.equal(exp.moneda, "USD");
    assert.equal(exp.texto, "23401");
    assert.equal(exp.etiqueta, "Expectativa (USD/mes)");
    assert.equal(exp.marcar, true);
    assert.equal(presentarExpectativaChina({ salary_usd: "1800-2000" })?.texto, "1800-2000");
    assert.equal(presentarExpectativaChina({ salary_usd: "1800-2000" })?.marcar, false);
  });

  it("una respuesta nueva en CNY no relee el USD y no trae el tope en el texto", () => {
    const exp = presentarExpectativaChina({
      salary_cny: 23401,
      salary_usd: "1800-2000",
      salary_cny_over_budget: true,
      salary_over_budget: true,
    });
    assert.ok(exp);
    assert.equal(exp.moneda, "CNY");
    assert.equal(exp.texto, "23401");
    assert.equal(exp.etiqueta, "Expectativa (CNY/mes)");
    assert.equal(exp.marcar, true);
    assert.equal(exp.texto.includes("23400"), false);
  });
});
