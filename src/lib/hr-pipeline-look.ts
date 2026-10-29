/**
 * Look Universe del pipeline HR Admin (preview).
 * Etiquetas humanas en la UI. El code técnico queda en tooltip.
 * Rojo solo cuando el SLA ya se pasó: «acción hoy».
 */
import { normalizeStage, stageLabel, stageSla } from "./stage-labels";

const UI_LABEL: Record<string, string> = {
  aplico: "Aplicó",
  prefiltro_enviado: "Prefiltro enviado",
  prefiltro_pasado: "Prefiltro pasado",
  prefiltro_revision: "Revisión de prefiltro",
  pruebas: "Pruebas de batería",
  prueba_tecnica: "Assessment presencial",
  recruiter_interview: "Entrevista con reclutador",
  terna: "Terna para el líder",
  examenes_medicos: "Exámenes médicos",
  estudio_seguridad: "Estudio de seguridad",
  documentacion_ingreso: "Documentación de ingreso",
  oferta: "Oferta",
  contratado: "Contratado",
  rechazado: "Rechazado",
};

/** Empleador de la vacante en este ATS. Comp llena el empleador de la carta. */
export const HIRING_EMPLOYER = "Trading Solutions";

export function stageLabelUi(code: string | null | undefined): string {
  if (!code) return "—";
  const id = normalizeStage(code);
  return UI_LABEL[id] ?? stageLabel(code);
}

export function stageTechTip(code: string | null | undefined): string {
  if (!code) return "";
  return `stage: ${code}`;
}

export function daysSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** Pasado el SLA de la etapa. Es el único caso que pinta rojo. */
export function accionHoy(days: number, sla: number | null | undefined): boolean {
  if (sla == null || sla <= 0) return false;
  return days > sla;
}

export function slaFor(code: string | null | undefined): number | null {
  return stageSla(code);
}

export function shortCandidateId(id: string): string {
  const compact = id.replace(/-/g, "").toUpperCase();
  return `ATS-${compact.slice(0, 5) || "—"}`;
}

export function paisDe(input: {
  vacancyCountry?: string | null;
  location?: string | null;
  city?: string | null;
}): string | null {
  const vac = input.vacancyCountry?.trim();
  if (vac) return vac;
  const loc = input.location?.trim();
  if (loc) {
    const parts = loc.split(",").map((part) => part.trim()).filter(Boolean);
    return parts[parts.length - 1] || loc;
  }
  const city = input.city?.trim();
  return city || null;
}

export function nombreCorto(nombre: string | null | undefined): { initials: string; short: string } {
  const parts = (nombre || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { initials: "·", short: "Sin dueño" };
  const first = parts[0];
  const second = parts.length > 1 ? parts[1] : "";
  const initials = ((first[0] || "") + (second[0] || "")).toUpperCase() || "·";
  const short = second ? `${first} ${second[0]}.` : first;
  return { initials, short };
}

export type CompChipStatus = "sent" | "fail";

export function compStatusOf(value: unknown): CompChipStatus | null {
  if (value === "sent" || value === "comp:sent") return "sent";
  if (value === "fail" || value === "error" || value === "comp:fail") return "fail";
  return null;
}

export function compEventNote(status: string | undefined): "comp:sent" | "comp:fail" | null {
  if (status === "sent") return "comp:sent";
  if (status === "error") return "comp:fail";
  return null;
}

export function mergeCompStatus<T extends { id?: string; comp_preview_status?: unknown }>(
  rows: T[],
  events: { candidate_id?: string; note?: string | null }[] | null,
): Array<T & { comp_preview_status: CompChipStatus | null }> {
  const fromEvents: Record<string, CompChipStatus> = {};
  for (const event of events || []) {
    const id = event.candidate_id;
    if (!id || fromEvents[id]) continue;
    const status = compStatusOf(event.note);
    if (status) fromEvents[id] = status;
  }
  return rows.map((row) => {
    const id = row.id || "";
    return {
      ...row,
      comp_preview_status: compStatusOf(row.comp_preview_status) ?? fromEvents[id] ?? null,
    };
  });
}
