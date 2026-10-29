/**
 * Lectura del salario en USD que el candidato escribe en el prefiltro
 * (China y Panamá). El tope se compara contra el mínimo del rango:
 * «1800-2000» no es 18002000, y «2.300» no es 2.3.
 */

export type SalaryRangeUsd = { min: number; max: number };

export function parseSalaryRangeUsd(raw: unknown): SalaryRangeUsd | null {
  const toks = String(raw ?? "").match(/\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g) ?? [];
  const nums = toks
    .map((t) => {
      const m = t.match(/^(\d{1,3}(?:[.,]\d{3})+)(?:[.,]\d{1,2})?$/);
      return m ? Number(m[1].replace(/[.,]/g, "")) : Number(t.replace(",", "."));
    })
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 2);
  return nums.length ? { min: Math.min(...nums), max: Math.max(...nums) } : null;
}

export type SalaryCapFlag = {
  range: SalaryRangeUsd | null;
  salaryOverBudget: boolean;
  bloqueo: {
    regla: "salario_sobre_tope";
    severidad: "blando";
    categoria: "pretension_salarial";
    sub_detail: "salario_sobre_tope";
    valor: string;
  } | null;
};

/** Sobre el tope (mínimo del rango) marca revisión. Vacío o ilegible no marca nada. */
export function flagSalarioSobreTope(raw: unknown, capUsd: number): SalaryCapFlag {
  const range = parseSalaryRangeUsd(raw);
  const salaryOverBudget = range !== null && range.min > capUsd;
  if (!salaryOverBudget) {
    return { range, salaryOverBudget: false, bloqueo: null };
  }
  return {
    range,
    salaryOverBudget: true,
    bloqueo: {
      regla: "salario_sobre_tope",
      severidad: "blando",
      categoria: "pretension_salarial",
      sub_detail: "salario_sobre_tope",
      valor: String(raw ?? ""),
    },
  };
}
