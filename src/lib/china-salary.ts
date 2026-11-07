/**
 * Expectativa mensual en CNY del prefiltro China (respuestas nuevas).
 *
 * La pregunta del formulario ya era mensual («Monthly salary expectation»).
 * La nueva también lo es. No se mezcla con un monto anual.
 *
 * Por encima del tope la decisión pasa a revisión con el mismo bloqueo
 * blando `salario_sobre_tope` que ya usaba el salario en USD. No hay
 * auto-rechazo. El número no se escribe en avisos, anuncios ni en el JSON
 * que pinta la ficha: vive solo en este módulo.
 */

import { parseSalarioCny } from "./prefilter-salary";

export const TOPE_REVISION_SALARIO_CNY = 23400;

export type BloqueoSalarioCny = {
  regla: "salario_sobre_tope";
  severidad: "blando";
  categoria: "pretension_salarial";
  sub_detail: "salario_sobre_tope";
  valor: string;
};

export type SalarioCny =
  | { ok: false; error: "salary_cny_invalid" }
  | { ok: true; amount: number; overBudget: boolean; bloqueo: BloqueoSalarioCny | null };

export function evaluarSalarioCny(raw: unknown): SalarioCny {
  const amount = parseSalarioCny(raw);
  if (amount == null) return { ok: false, error: "salary_cny_invalid" };
  const overBudget = amount > TOPE_REVISION_SALARIO_CNY;
  return {
    ok: true,
    amount,
    overBudget,
    bloqueo: overBudget
      ? {
          regla: "salario_sobre_tope",
          severidad: "blando",
          categoria: "pretension_salarial",
          sub_detail: "salario_sobre_tope",
          valor: String(amount),
        }
      : null,
  };
}

type Decision = "pass" | "review" | "reject";

/**
 * Suma el bloqueo salarial sin borrar los knock-outs que ya estaban
 * (inglés, presencial, autorización) y sin convertir la decisión en reject.
 */
export function incorporarTopeCny<T extends { regla: string }>(
  decision: Decision,
  bloqueos: T[],
  raw: unknown,
):
  | { ok: false; error: "salary_cny_invalid" }
  | { ok: true; decision: Decision; bloqueos: T[]; amount: number; overBudget: boolean } {
  const salario = evaluarSalarioCny(raw);
  if (!salario.ok) return salario;
  const next = bloqueos.slice();
  let out = decision;
  if (salario.bloqueo) {
    next.push(salario.bloqueo as unknown as T);
    if (out === "pass") out = "review";
  }
  return { ok: true, decision: out, bloqueos: next, amount: salario.amount, overBudget: salario.overBudget };
}
