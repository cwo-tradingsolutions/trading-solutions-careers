/**
 * Ocultar una requisición y las cuatro tarjetas de Requisiciones.
 *
 * Ocultar no es un estado del circuito. El CHECK de ht_requisitions.status
 * sigue siendo pedida, con_perfil, devuelta, aprobada, rechazada, publicada.
 * Una fila oculta conserva ese status y suma hidden_at / hidden_reason /
 * hidden_by, más una fila en ht_requisition_events.
 *
 * HIDDEN_REASONS es el único lugar del código con las dos claves. El CHECK
 * de la migración repite las mismas cadenas.
 *
 * TARJETAS_CONTEO es el único lugar con la definición de cada conteo.
 */

import { STATUS_HINT, STATUS_LABEL, type RequisitionStatus } from "@/lib/requisitions";

export const HIDDEN_REASONS = [
  { key: "duplicada", label: "Duplicada" },
  { key: "fuera_del_ats", label: "Fuera del ATS" },
] as const;

export type HiddenReason = (typeof HIDDEN_REASONS)[number]["key"];

export const HIDDEN_ACTOR = "cwo@tradingsolutions.com";

export const POR_CONSTRUIR = "por construir";

export const ETIQUETA_SIN_DATO = "sin dato";

export type ConteoClave = "publicadas" | "archivadas" | "cerradas" | "ocultas";

export const TARJETAS_CONTEO: {
  key: ConteoClave;
  label: string;
  definicion: string;
}[] = [
  {
    key: "publicadas",
    label: "Publicadas",
    definicion: "Requisición publicada con la vacante abierta",
  },
  {
    key: "archivadas",
    label: "Archivadas",
    definicion: "Requisición publicada cuya vacante ya está cerrada",
  },
  {
    key: "cerradas",
    label: "Cerradas",
    definicion: "Rechazada y no oculta",
  },
  {
    key: "ocultas",
    label: "Duplicadas/ocultas",
    definicion: "Ocultas",
  },
];

export type FilaConteo = {
  status: string;
  hidden_at?: string | null;
  hidden_reason?: string | null;
  /** open | closed | paused | null. Paused no es abierta ni cerrada. */
  vacancy_status?: string | null;
};

export function estaOculta(row: { hidden_at?: string | null }): boolean {
  return row.hidden_at != null && String(row.hidden_at).trim() !== "";
}

export function etiquetaOculta(reason: string | null | undefined): string | null {
  const hit = HIDDEN_REASONS.find((r) => r.key === reason);
  return hit ? hit.label : null;
}

/**
 * Lo que pinta la tarjeta. Una fila oculta no usa STATUS_LABEL ni STATUS_HINT:
 * la duplicada rechazada no puede decir «Rechazada · El CWO no la aprobó».
 */
export function etiquetaTarjeta(row: {
  status: RequisitionStatus;
  hidden_at?: string | null;
  hidden_reason?: string | null;
}): { label: string; hint: string | null; oculta: boolean } {
  if (estaOculta(row) || (row.hidden_reason != null && String(row.hidden_reason).trim() !== "")) {
    return {
      label: etiquetaOculta(row.hidden_reason) ?? "Oculta",
      hint: null,
      oculta: true,
    };
  }
  return {
    label: STATUS_LABEL[row.status],
    hint: STATUS_HINT[row.status] ?? null,
    oculta: false,
  };
}

/** null = no entra en ninguna de las cuatro tarjetas (sigue en el circuito). */
export function clasificarConteo(row: FilaConteo): ConteoClave | null {
  if (estaOculta(row)) return "ocultas";
  if (row.status === "rechazada") return "cerradas";
  if (row.status === "publicada" && row.vacancy_status === "open") return "publicadas";
  if (row.status === "publicada" && row.vacancy_status === "closed") return "archivadas";
  return null;
}

export function contarTarjetas(rows: FilaConteo[] | null): Record<ConteoClave, number | null> {
  if (rows == null) {
    return { publicadas: null, archivadas: null, cerradas: null, ocultas: null };
  }
  const counts: Record<ConteoClave, number | null> = {
    publicadas: 0,
    archivadas: 0,
    cerradas: 0,
    ocultas: 0,
  };
  let publicadaSinClasificar = 0;
  for (const row of rows) {
    const bucket = clasificarConteo(row);
    if (bucket) {
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    } else if (row.status === "publicada" && !estaOculta(row)) {
      publicadaSinClasificar += 1;
    }
  }
  // Hay publicadas pero ninguna vacante open/closed: el conteo no se puede
  // armar. Mostrar 0 sería decir que no hay, y sí hay.
  if (publicadaSinClasificar > 0 && counts.publicadas === 0 && counts.archivadas === 0) {
    counts.publicadas = null;
    counts.archivadas = null;
  }
  return counts;
}

export function textoConteo(n: number | null): string {
  return n == null ? POR_CONSTRUIR : String(n);
}

export function decidirIncludeHidden(opts: {
  includeHidden: boolean;
  esAdmin: boolean;
}): { ok: true; incluir: boolean } | { ok: false; status: 403; error: string } {
  if (!opts.includeHidden) return { ok: true, incluir: false };
  if (!opts.esAdmin) {
    return { ok: false, status: 403, error: "include_hidden es solo para hr-admin" };
  }
  return { ok: true, incluir: true };
}

/** El listado por defecto esconde las ocultas. include_hidden las deja. */
export function aplicarVisibilidad<Q extends { is(column: string, value: null): Q }>(
  q: Q,
  incluirOcultas: boolean,
): Q {
  if (incluirOcultas) return q;
  return q.is("hidden_at", null);
}

export function quiereIncludeHidden(valor: string | null): boolean {
  return valor === "1";
}
