/**
 * Costo salarial base. Solo el salario mensual, sin carga prestacional.
 *
 * El divisor son días calendario, el mismo reloj que TTF. People Analytics
 * puede cambiarlo a 21.67 (días hábiles) en este único sitio.
 */
export const DAYS_PER_MONTH = 30;

export const FORMULA_COSTO = `salario mensual / ${DAYS_PER_MONTH} × días abierta`;

/**
 * Carga prestacional por país, como fracción encima del salario base
 * (0.4 = 40%). Apagada: ninguna clave tiene valor, así que el costo
 * es solo el salario base. La clave es el país tal como está en la vacante.
 */
export const BENEFITS_LOAD_BY_COUNTRY: Readonly<Record<string, number>> = {};

export type SalaryCurrency = "COP" | "USD";
export type SalarySource = "tope_interno" | "punto_medio_rango" | "sin_dato";

export type ResolvedSalary = {
  source: SalarySource;
  currency: SalaryCurrency | null;
  /** Mensual base. No se manda al cliente. */
  monthly: number | null;
};

export function benefitsMultiplier(
  country: string | null | undefined,
  table: Readonly<Record<string, number>> = BENEFITS_LOAD_BY_COUNTRY,
): number {
  const key = (country ?? "").trim();
  if (!key) return 1;
  const load = table[key];
  if (load == null || !Number.isFinite(load) || load < 0) return 1;
  return 1 + load;
}

export function dailyFromMonthly(monthly: number, multiplier = 1): number {
  return (monthly * multiplier) / DAYS_PER_MONTH;
}

/**
 * Tope numérico interno si existe. Si no, punto medio de un rango con
 * los dos extremos y moneda explícita COP o USD. Un solo extremo, otra
 * moneda, o moneda ambigua: sin dato. No hay conversión.
 */
export function resolveSalary(input: {
  capAmount: number | null;
  capCurrency: SalaryCurrency | null;
  texts: readonly (string | null | undefined)[];
}): ResolvedSalary {
  if (
    input.capAmount != null &&
    Number.isFinite(input.capAmount) &&
    input.capAmount > 0 &&
    input.capCurrency
  ) {
    return { source: "tope_interno", currency: input.capCurrency, monthly: input.capAmount };
  }
  for (const text of input.texts) {
    const parsed = parseTwoEndedRange(text);
    if (!parsed) continue;
    return {
      source: "punto_medio_rango",
      currency: parsed.currency,
      monthly: (parsed.min + parsed.max) / 2,
    };
  }
  return { source: "sin_dato", currency: null, monthly: null };
}

function currencyOf(text: string): SalaryCurrency | null {
  const hasCop = /\bCOP\b|pesos?(?:\s+colombianos)?|\bCOL\$/i.test(text);
  const hasUsd = /\bUSD\b|\bUS\$|dólares|dolares|\bdollars?\b/i.test(text);
  const hasOther = /\b(EUR|MXN|PEN|CNY|GBP|BRL)\b|€|¥/i.test(text);
  if (hasOther || (hasCop && hasUsd) || (!hasCop && !hasUsd)) return null;
  return hasCop ? "COP" : "USD";
}

function amount(token: string): number | null {
  const s = token.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    const [int, dec] = s.split(",");
    const n = Number(int.replace(/\./g, "") + (dec ? `.${dec}` : ""));
    return Number.isFinite(n) ? n : null;
  }
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (/^\d+([.,]\d+)?$/.test(s)) {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractNumbers(text: string): number[] {
  const tokens = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const rangeMillions = text.match(
    /(\d+(?:[.,]\d+)?)\s*[–\-\u2013]\s*(\d+(?:[.,]\d+)?)\s*M\b/i,
  );
  if (rangeMillions && tokens.length === 2) {
    const a = Number(rangeMillions[1].replace(",", ".")) * 1_000_000;
    const b = Number(rangeMillions[2].replace(",", ".")) * 1_000_000;
    return [a, b].filter((n) => Number.isFinite(n) && n > 0);
  }
  const prepared = text.replace(/(\d+(?:[.,]\d+)?)\s*M\b/gi, (_, raw: string) => {
    const v = Number(String(raw).replace(",", "."));
    return Number.isFinite(v) ? String(Math.round(v * 1_000_000)) : raw;
  });
  const toks =
    prepared.match(
      /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?/g,
    ) ?? [];
  const nums: number[] = [];
  for (const tok of toks) {
    const n = amount(tok);
    if (n != null && n > 0) nums.push(n);
  }
  return nums;
}

/** null si no hay dos extremos distintos en COP o USD explícitos. */
export function parseTwoEndedRange(
  raw: string | null | undefined,
): { min: number; max: number; currency: SalaryCurrency } | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const currency = currencyOf(text);
  if (!currency) return null;
  const nums = extractNumbers(text);
  if (nums.length !== 2) return null;
  const min = Math.min(nums[0], nums[1]);
  const max = Math.max(nums[0], nums[1]);
  if (!(max > min)) return null;
  return { min, max, currency };
}
