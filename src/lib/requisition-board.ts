/**
 * Lo que el líder ve en el tablero, distinto de lo que dice la columna
 * `ht_requisitions.status`.
 *
 * El circuito de aprobación termina en `publicada`. Cerrar la vacante o
 * pasar un candidato a `contratado` no tiene otro valor que escribir: el
 * check de la tabla solo acepta los seis estados de la aprobación. Por eso
 * el tablero deriva Closed / Hired al armar la respuesta, sin migrar ni
 * reescribir filas. WXM pinta `status_label`; en estos dos casos el label
 * sale en inglés porque My Requisitions no tiene rama propia para ellos.
 */
import { STATUS_HINT, STATUS_LABEL, type RequisitionStatus } from "./requisitions";
import { LEGACY_STAGE_MAP, normalizeStage } from "./stage-labels";

/** Una pausa no es un cierre: la búsqueda se puede retomar. */
const VACANTE_CERRADA = new Set(["closed", "cancelled", "filled"]);

/**
 * Stages que cuentan como contratación, incluido el code viejo que
 * `normalizeStage` ya traduce a `contratado`. Sirve para filtrar en la
 * consulta sin traer el resto del pipeline.
 */
export const ETAPAS_CONTRATADO: string[] = [
  "contratado",
  ...Object.entries(LEGACY_STAGE_MAP)
    .filter(([, canon]) => canon === "contratado")
    .map(([code]) => code),
];

export type EstadoTableroCodigo = RequisitionStatus | "cerrada" | "contratada";

export type EstadoTablero = {
  status: EstadoTableroCodigo;
  status_label: string;
  status_label_es: string;
  status_hint: string | null;
  status_hint_es: string | null;
  /** La búsqueda ya no corre. El reloj de SLA del tablero tiene que parar. */
  terminal: boolean;
};

const HIRED_HINT_EN = "Someone was hired. The search SLA is no longer counting.";
const HIRED_HINT_ES = "Hay una persona contratada. El SLA de la búsqueda ya no corre.";
const CLOSED_HINT_EN = "The vacancy is closed. The search SLA is no longer counting.";
const CLOSED_HINT_ES = "La vacante está cerrada. El SLA de la búsqueda ya no corre.";

export function vacanteCerrada(status: string | null | undefined): boolean {
  return !!status && VACANTE_CERRADA.has(status);
}

export function esContratado(stage: string | null | undefined): boolean {
  return normalizeStage(stage) === "contratado";
}

/**
 * Hired gana sobre Closed: una vacante cerrada con alguien en `contratado`
 * es una contratación, no una cancelación. Si la vacante sigue abierta pero
 * ya hay un contratado, igual es Hired — el líder no debe seguir viendo
 * Posted mientras el SLA corre.
 */
export function estadoTablero(input: {
  reqStatus: string;
  vacancyStatus?: string | null;
  tieneContratado: boolean;
}): EstadoTablero {
  if (input.tieneContratado) {
    return {
      status: "contratada",
      status_label: "Hired",
      status_label_es: "Contratada",
      status_hint: HIRED_HINT_EN,
      status_hint_es: HIRED_HINT_ES,
      terminal: true,
    };
  }

  if (vacanteCerrada(input.vacancyStatus)) {
    return {
      status: "cerrada",
      status_label: "Closed",
      status_label_es: "Cerrada",
      status_hint: CLOSED_HINT_EN,
      status_hint_es: CLOSED_HINT_ES,
      terminal: true,
    };
  }

  const conocido = (Object.keys(STATUS_LABEL) as string[]).includes(input.reqStatus);
  const status = input.reqStatus as RequisitionStatus;
  const label = conocido ? STATUS_LABEL[status] : input.reqStatus;
  const hint = conocido ? STATUS_HINT[status] ?? null : null;
  return {
    status,
    status_label: label,
    status_label_es: label,
    status_hint: hint,
    status_hint_es: hint,
    terminal: false,
  };
}

/**
 * Reloj que consume WXM para pintar Overdue (días desde la aprobación contra
 * la meta de 22). En una búsqueda terminada los dos números salen vacíos:
 * no hay meta que incumplir. La fecha de aprobación se conserva aparte;
 * este reloj no la borra.
 */
export function relojSla(
  terminal: boolean,
  diasDesdeAprobacion: number | null,
  metaDias: number,
  diasEnEstado: number | null,
): {
  dias_desde_aprobacion: number | null;
  meta_dias: number | null;
  dias_en_estado: number | null;
  sla_activo: boolean;
} {
  if (!terminal) {
    return {
      dias_desde_aprobacion: diasDesdeAprobacion,
      meta_dias: metaDias,
      dias_en_estado: diasEnEstado,
      sla_activo: true,
    };
  }
  return {
    dias_desde_aprobacion: null,
    meta_dias: null,
    dias_en_estado: null,
    sla_activo: false,
  };
}
