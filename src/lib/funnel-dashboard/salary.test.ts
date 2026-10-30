import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BENEFITS_LOAD_BY_COUNTRY,
  DAYS_PER_MONTH,
  FORMULA_COSTO,
  benefitsMultiplier,
  dailyFromMonthly,
  parseTwoEndedRange,
  resolveSalary,
} from "./salary";

describe("divisor y carga prestacional", () => {
  it("el divisor es 30 días calendario y la fórmula lo nombra", () => {
    assert.equal(DAYS_PER_MONTH, 30);
    assert.equal(FORMULA_COSTO, "salario mensual / 30 × días abierta");
    assert.equal(dailyFromMonthly(3_000_000), 100_000);
  });

  it("la carga por país está apagada: ninguna clave tiene valor", () => {
    assert.deepEqual(BENEFITS_LOAD_BY_COUNTRY, {});
    assert.equal(benefitsMultiplier("Colombia"), 1);
    assert.equal(benefitsMultiplier(null), 1);
    assert.equal(benefitsMultiplier("Colombia", { Colombia: 0.4 }), 1.4);
    assert.equal(dailyFromMonthly(3_000_000, benefitsMultiplier("Colombia")), 100_000);
  });
});

describe("salario usable", () => {
  it("el tope numérico manda sobre el texto", () => {
    const r = resolveSalary({
      capAmount: 4_000_000,
      capCurrency: "COP",
      texts: ["1.800 – 2.000 USD"],
    });
    assert.equal(r.source, "tope_interno");
    assert.equal(r.currency, "COP");
    assert.equal(r.monthly, 4_000_000);
  });

  it("sin tope, el punto medio de un rango con dos extremos", () => {
    const cop = resolveSalary({
      capAmount: null,
      capCurrency: null,
      texts: ["3.000.000 – 4.000.000 COP"],
    });
    assert.equal(cop.source, "punto_medio_rango");
    assert.equal(cop.currency, "COP");
    assert.equal(cop.monthly, 3_500_000);

    const usd = parseTwoEndedRange("$3.0M - $4.0M COP");
    assert.equal(usd?.currency, "COP");
    assert.equal(usd && (usd.min + usd.max) / 2, 3_500_000);

    const millones = parseTwoEndedRange("3 – 4 M COP");
    assert.equal(millones && (millones.min + millones.max) / 2, 3_500_000);

    const en = resolveSalary({
      capAmount: null,
      capCurrency: null,
      texts: ["1.800 – 2.000 USD"],
    });
    assert.equal(en.source, "punto_medio_rango");
    assert.equal(en.currency, "USD");
    assert.equal(en.monthly, 1_900);
  });

  it("un solo extremo, otra moneda o sin moneda es sin dato y no convierte", () => {
    for (const text of ["4.000.000 COP", "2000-3000 EUR", "1800-2000", "$1.800 - $2.000", "A convenir", "3-4-5 M COP"]) {
      const r = resolveSalary({ capAmount: null, capCurrency: null, texts: [text] });
      assert.equal(r.source, "sin_dato", text);
      assert.equal(r.monthly, null, text);
      assert.equal(r.currency, null, text);
    }
    assert.equal(parseTwoEndedRange("2.000 USD y 8.000.000 COP"), null);
  });

  it("anual, sufijo k y millones", () => {
    for (const text of [
      "USD 60,000-80,000 per year",
      "USD 60.000-80.000 anual",
      "2.000 – 3.000 USD al año",
      "2000-3000 USD per annum",
      "2,000-3,000 USD yearly",
      "USD 2000-3000 /yr",
      "USD 60,000-80,000 a year",
      "USD 60,000-80,000 A YEAR",
      "2000-3000 USD annually",
      "2000-3000 USD ANNUAL",
      "COP 48.000.000 - 60.000.000 año",
      "COP 48.000.000 - 60.000.000 AÑO",
      "48.000.000 - 60.000.000 COP /año",
      "3k-4k USD",
      "3 k - 4 k USD",
    ]) {
      assert.equal(parseTwoEndedRange(text), null, text);
      const r = resolveSalary({ capAmount: null, capCurrency: null, texts: [text] });
      assert.equal(r.source, "sin_dato", text);
      assert.equal(r.monthly, null, text);
    }
    const pesos = parseTwoEndedRange("4 y 5 millones de pesos");
    assert.equal(pesos?.currency, "COP");
    assert.equal(pesos?.min, 4_000_000);
    assert.equal(pesos?.max, 5_000_000);
    const entre = parseTwoEndedRange("Entre 4 y 5 millones de pesos");
    assert.equal(entre?.min, 4_000_000);
    assert.equal(entre?.max, 5_000_000);
    const cop = parseTwoEndedRange("COP 3.5 - 4.5 millones");
    assert.equal(cop?.min, 3_500_000);
    assert.equal(cop?.max, 4_500_000);
    const hasta = parseTwoEndedRange("4 hasta 5 millones COP");
    assert.equal(hasta?.min, 4_000_000);
    assert.equal(hasta?.max, 5_000_000);
    const conA = parseTwoEndedRange("3 a 4 M COP");
    assert.equal(conA?.min, 3_000_000);
    assert.equal(conA?.max, 4_000_000);
  });

  it("si el primer texto no sirve, prueba el siguiente", () => {
    const r = resolveSalary({
      capAmount: null,
      capCurrency: null,
      texts: ["A convenir", "1,800-2,000 USD"],
    });
    assert.equal(r.source, "punto_medio_rango");
    assert.equal(r.monthly, 1_900);
    assert.equal(r.currency, "USD");
  });
});
