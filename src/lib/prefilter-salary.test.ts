import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSalaryRangeUsd } from "./prefilter-salary.ts";

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
