/**
 * Fuentes de reclutamiento. Puras: no tocan la base.
 *
 * La tabla ht_recruitment_sources es la lista configurable. FUENTES, en
 * requisitions.ts, es el fallback cuando la tabla no responde. Las dos tienen
 * las mismas seis claves de la semilla.
 */

import { ETIQUETA_SIN_DATO } from "@/lib/requisition-board";
import { FUENTES } from "@/lib/requisitions";

export type FuenteLista = {
  key: string;
  label: string;
  active: boolean;
  sort_order: number;
  automatico: boolean;
};

export type LlegadaFila = {
  arrival_source: string | null;
  n: number;
};

export const FUENTE_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;

export function fuentesFallback(): FuenteLista[] {
  return FUENTES.map((f) => ({
    key: f.key,
    label: f.label,
    active: f.active,
    sort_order: f.sort_order,
    automatico: f.automatico,
  }));
}

export function conAutomatico(row: {
  key: string;
  label: string;
  active: boolean;
  sort_order: number;
}): FuenteLista {
  return { ...row, automatico: row.key === "careers" };
}

export function normalizarClaveFuente(
  source: unknown,
): { ok: true; key: string } | { ok: false; error: string } {
  const key = String(source ?? "").trim().toLowerCase();
  if (!key || !FUENTE_KEY_RE.test(key)) {
    return { ok: false, error: `Fuente desconocida: "${key}".` };
  }
  return { ok: true, key };
}

export function validarFuente(
  source: unknown,
  catalogo: { key: string; active: boolean }[],
  modo: "marcar" | "desmarcar",
): { ok: true; key: string } | { ok: false; error: string } {
  const forma = normalizarClaveFuente(source);
  if (!forma.ok) return forma;
  const key = forma.key;
  const row = catalogo.find((f) => f.key === key);
  if (!row) return { ok: false, error: `Fuente desconocida: "${key}".` };
  if (modo === "marcar" && !row.active) {
    return { ok: false, error: `La fuente "${key}" está desactivada.` };
  }
  return { ok: true, key };
}

export function validarAltaFuente(input: {
  key: unknown;
  label: unknown;
}): { ok: true; key: string; label: string } | { ok: false; error: string } {
  const key = String(input.key || "").trim().toLowerCase();
  const label = String(input.label || "").trim();
  if (!FUENTE_KEY_RE.test(key)) {
    return {
      ok: false,
      error: "La clave usa minúsculas, números y guion bajo, y empieza con una letra.",
    };
  }
  if (!label || label.length > 80) {
    return { ok: false, error: "Falta el nombre de la fuente." };
  }
  return { ok: true, key, label };
}

export function validarCambioFuente(input: {
  key: unknown;
  label?: unknown;
  active?: unknown;
}): { ok: true; key: string; label?: string; active?: boolean } | { ok: false; error: string } {
  const key = String(input.key || "").trim().toLowerCase();
  if (!FUENTE_KEY_RE.test(key)) return { ok: false, error: "Falta la clave de la fuente." };
  const out: { ok: true; key: string; label?: string; active?: boolean } = { ok: true, key };
  if (input.label !== undefined) {
    const label = String(input.label ?? "").trim();
    if (!label || label.length > 80) return { ok: false, error: "El nombre no puede quedar vacío." };
    out.label = label;
  }
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") {
      return { ok: false, error: "active tiene que ser verdadero o falso." };
    }
    out.active = input.active;
  }
  if (out.label === undefined && out.active === undefined) {
    return { ok: false, error: "No hay nada que cambiar." };
  }
  return out;
}

/**
 * ?src=<key> del formulario de Careers. Solo entra si la clave está activa.
 * No lee ni escribe ht_candidates.source.
 */
export function resolverArrivalSource(src: unknown, clavesActivas: readonly string[]): string | null {
  const key = String(src ?? "").trim().toLowerCase();
  if (!key || !FUENTE_KEY_RE.test(key)) return null;
  if (!clavesActivas.includes(key)) return null;
  return key;
}

export function enlaceConSrc(url: string, key: string): string {
  const base = String(url || "").trim();
  const src = String(key || "").trim().toLowerCase();
  if (!base || !src || src === "careers") return base;
  try {
    const u = new URL(base);
    u.searchParams.set("src", src);
    return u.toString();
  } catch {
    const join = base.includes("?") ? "&" : "?";
    return `${base}${join}src=${encodeURIComponent(src)}`;
  }
}

export function etiquetaLlegada(clave: string | null, fuentes: { key: string; label: string }[]): string {
  if (!clave) return ETIQUETA_SIN_DATO;
  return fuentes.find((f) => f.key === clave)?.label || clave;
}

export function agruparLlegada(
  filas: { vacancy_id: string; arrival_source: string | null }[],
): Map<string, LlegadaFila[]> {
  const porVacante = new Map<string, Map<string, number>>();
  for (const fila of filas) {
    const clave = fila.arrival_source ?? "";
    const delVacante = porVacante.get(fila.vacancy_id) ?? new Map<string, number>();
    delVacante.set(clave, (delVacante.get(clave) ?? 0) + 1);
    porVacante.set(fila.vacancy_id, delVacante);
  }
  const out = new Map<string, LlegadaFila[]>();
  for (const [vacancyId, counts] of porVacante) {
    const llegada: LlegadaFila[] = [];
    for (const [clave, n] of counts) {
      llegada.push({ arrival_source: clave === "" ? null : clave, n });
    }
    llegada.sort((a, b) => b.n - a.n);
    out.set(vacancyId, llegada);
  }
  return out;
}
