/**
 * Lo que el tablero del líder puede decir de una búsqueda ya terminada,
 * distinto de `ht_requisitions.status`.
 *
 * Esa columna se queda en `publicada`: el check solo acepta el circuito de
 * aprobación. Cerrar la vacante o pasar a alguien a contratado no tiene un
 * valor que escribir, y este módulo no escribe. Closed / Hired se arman al
 * leer, en campos nuevos, para no cambiar el `status` que ya consumen otros.
 *
 * Los hitos salen de columnas y eventos registrados. Un evento `backfill`
 * se reconstruyó de `updated_at` (migración del 18-ago-2026) y no es una
 * fecha real: se omite. Si no hay fecha, el campo queda null.
 */
import { STAGES, normalizeStage } from "./stage-labels";

/** Una pausa no es un cierre: la búsqueda se puede retomar. */
const VACANTE_CERRADA = new Set(["closed", "cancelled", "filled"]);

export type EstadoFinal = "contratada" | "cerrada" | null;

export type HitosFechas = {
  aprobada_el: string | null;
  publicada_el: string | null;
  primera_aplicacion_el: string | null;
  terna_el: string | null;
  entrevista_el: string | null;
  oferta_el: string | null;
  contratado_el: string | null;
  cerrada_el: string | null;
};

export type CandidatoBoard = {
  id: string;
  vacancy_id?: string | null;
  stage: string | null;
  status: string | null;
  email?: string | null;
  name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EventoEtapa = {
  candidate_id: string;
  to_stage: string | null;
  changed_at: string | null;
  source?: string | null;
};

export type CamposBoard = {
  estado_final: EstadoFinal;
  sla_activo: boolean;
  candidatos_total: number;
  conteos: Record<string, number>;
  hitos_fechas: HitosFechas;
};

const HITOS_VACIOS: HitosFechas = {
  aprobada_el: null,
  publicada_el: null,
  primera_aplicacion_el: null,
  terna_el: null,
  entrevista_el: null,
  oferta_el: null,
  contratado_el: null,
  cerrada_el: null,
};

/**
 * Stage crudo → etapa canónica del tablero.
 * `hired` no está en el mapa legacy y si no se traduce el contratado
 * desaparece del conteo. `shortlist` es la terna con el nombre viejo.
 */
export function etapaCanon(stage: string | null | undefined): string {
  if (!stage) return "";
  const raw = stage.trim().toLowerCase();
  if (raw === "hired") return "contratado";
  if (raw === "shortlist") return "terna";
  if (raw === "offer") return "oferta";
  return normalizeStage(raw);
}

export function vacanteCerrada(status: string | null | undefined): boolean {
  return !!status && VACANTE_CERRADA.has(status.trim().toLowerCase());
}

/** Contratado, el code viejo `onboarding`, o el stage `hired`. */
export function cuentaComoContratado(c: {
  stage: string | null;
  status: string | null;
}): boolean {
  if (c.status === "rejected") return false;
  return etapaCanon(c.stage) === "contratado";
}

/**
 * Misma población que el filtro SQL histórico del tablero
 * (`email NOT ILIKE '%@tradingsolutions.com'`, que también deja fuera
 * los null). Un contratado entra igual: si no, una vacante cubierta por
 * alguien con correo interno volvería a verse sin contratación.
 */
export function cuentaEnTablero(c: CandidatoBoard): boolean {
  if (cuentaComoContratado(c)) return true;
  if (c.email == null) return false;
  return !c.email.toLowerCase().includes("@tradingsolutions.com");
}

export function esVivo(c: { stage: string | null; status: string | null }): boolean {
  return c.status !== "rejected" && etapaCanon(c.stage) !== "rechazado";
}

export function estadoFinalDe(input: {
  vacancyStatus?: string | null;
  tieneContratado: boolean;
}): EstadoFinal {
  if (input.tieneContratado) return "contratada";
  if (vacanteCerrada(input.vacancyStatus)) return "cerrada";
  return null;
}

/** El reloj de WXM se apaga solo con false. Abierta lo deja en true. */
export function slaActivoDe(estado: EstadoFinal): boolean {
  return estado == null;
}

export function conteosEtapa(candidatos: CandidatoBoard[]): Record<string, number> {
  const conteos: Record<string, number> = {};
  for (const s of STAGES) conteos[s.id] = 0;
  for (const c of candidatos) {
    if (!cuentaEnTablero(c) || !esVivo(c)) continue;
    const etapa = etapaCanon(c.stage);
    if (etapa in conteos) conteos[etapa] += 1;
  }
  return conteos;
}

export function isoONull(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function laMasTemprana(valores: Array<string | null | undefined>): string | null {
  let mejor: string | null = null;
  let mejorMs = Infinity;
  for (const valor of valores) {
    const iso = isoONull(valor);
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (ms < mejorMs) {
      mejorMs = ms;
      mejor = iso;
    }
  }
  return mejor;
}

function eventoReal(ev: EventoEtapa): boolean {
  if (!ev.changed_at) return false;
  return (ev.source || "").toLowerCase() !== "backfill";
}

function primerEvento(
  eventos: EventoEtapa[],
  coincide: (toStage: string) => boolean,
): string | null {
  return laMasTemprana(
    eventos
      .filter((ev) => eventoReal(ev) && ev.to_stage && coincide(ev.to_stage))
      .map((ev) => ev.changed_at),
  );
}

const ENTREVISTA = new Set([
  "recruiter_interview",
  "entrevista_ia",
  "entrevista",
  "interview",
  "hiring_manager_interview",
]);

function esTerna(toStage: string): boolean {
  const raw = toStage.trim().toLowerCase();
  if (raw === "shortlist" || raw === "terna") return true;
  return etapaCanon(toStage) === "terna";
}

function esEntrevista(toStage: string): boolean {
  const raw = toStage.trim().toLowerCase();
  if (ENTREVISTA.has(raw)) return true;
  // hiring_lead_interview y cwo_interview caen en terna, no en esta fecha.
  if (esTerna(toStage)) return false;
  return etapaCanon(toStage) === "recruiter_interview";
}

function esOferta(toStage: string): boolean {
  const raw = toStage.trim().toLowerCase();
  return raw === "oferta" || raw === "offer" || etapaCanon(toStage) === "oferta";
}

function esAlta(toStage: string): boolean {
  const raw = toStage.trim().toLowerCase();
  return raw === "hired" || raw === "contratado" || raw === "onboarding" || etapaCanon(toStage) === "contratado";
}

export function hitosFechas(input: {
  approvedAt?: string | null;
  publicadaEn?: Array<string | null | undefined>;
  candidatos: CandidatoBoard[];
  eventos?: EventoEtapa[];
  hireDate?: string | null;
  /** Solo si la base tiene un cierre registrado. El route de prod pasa null. */
  closedAt?: string | null;
}): HitosFechas {
  const visibles = input.candidatos.filter(cuentaEnTablero);
  const ids = new Set(visibles.map((c) => c.id));
  const eventos = (input.eventos || []).filter((ev) => ids.has(ev.candidate_id));
  const contratadoPorEvento = primerEvento(eventos, esAlta);
  // hire_date solo completa el alta que ya vimos en un stage. Si no hay
  // contratado, una fecha suelta no convierte la búsqueda en una contratación.
  const hayAlta = input.candidatos.some(cuentaComoContratado);

  return {
    aprobada_el: isoONull(input.approvedAt),
    publicada_el: laMasTemprana(input.publicadaEn || []),
    primera_aplicacion_el: laMasTemprana(visibles.map((c) => c.created_at)),
    terna_el: primerEvento(eventos, esTerna),
    entrevista_el: primerEvento(eventos, esEntrevista),
    oferta_el: primerEvento(eventos, esOferta),
    contratado_el: contratadoPorEvento || (hayAlta ? isoONull(input.hireDate) : null),
    cerrada_el: isoONull(input.closedAt),
  };
}

/**
 * Campos que se agregan a cada vacante del board. No incluye nombres,
 * correos ni salarios: el tipo de salida no tiene dónde ponerlos.
 */
export function camposBoard(input: {
  vacancyStatus?: string | null;
  approvedAt?: string | null;
  publicadaEn?: Array<string | null | undefined>;
  candidatos: CandidatoBoard[];
  eventos?: EventoEtapa[];
  hireDate?: string | null;
  closedAt?: string | null;
}): CamposBoard {
  const tieneContratado = input.candidatos.some(cuentaComoContratado);
  const estado_final = estadoFinalDe({
    vacancyStatus: input.vacancyStatus,
    tieneContratado,
  });
  const visibles = input.candidatos.filter(cuentaEnTablero);
  return {
    estado_final,
    sla_activo: slaActivoDe(estado_final),
    candidatos_total: visibles.length,
    conteos: conteosEtapa(input.candidatos),
    hitos_fechas: hitosFechas(input),
  };
}

export { HITOS_VACIOS };
