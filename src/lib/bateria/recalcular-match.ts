/**
 * Plan para rellenar perfil_cargo y match_data de una sesión que ya tiene
 * scores. Usa calcularMatch, el mismo motor que cerrarSesion, y no toca
 * scores, validity, status ni duration.
 */

import { calcularMatch, type MatchDetalle } from "./match";
import { perfilPorTitulo } from "./perfiles-cargo";
import type { Scores } from "./scoring";

export type FilaSesionMatch = {
  id: string;
  status: string | null;
  vacancy_title: string | null;
  perfil_cargo: string | null;
  scores: unknown;
  match_data: unknown;
};

export type PlanRecalculo =
  | { id: string; accion: "omitir"; motivo: string }
  | {
      id: string;
      accion: "actualizar";
      perfil_cargo: string;
      match_data: MatchDetalle;
      antes: { perfil_cargo: string | null; match_global: number | null };
    };

export function planRecalculoMatch(fila: FilaSesionMatch): PlanRecalculo {
  if (fila.status !== "completed") {
    return {
      id: fila.id,
      accion: "omitir",
      motivo: `status=${fila.status ?? "null"}; solo se recalcula una sesión completed`,
    };
  }
  const perfil = perfilPorTitulo(fila.vacancy_title);
  if (!perfil) {
    return {
      id: fila.id,
      accion: "omitir",
      motivo: `el título no tiene perfil: ${fila.vacancy_title ?? "(vacío)"}`,
    };
  }
  if (fila.perfil_cargo && fila.perfil_cargo !== perfil) {
    return {
      id: fila.id,
      accion: "omitir",
      motivo: `perfil_cargo ya es ${fila.perfil_cargo}; no se pisa`,
    };
  }
  const scores = comoScores(fila.scores);
  const match = scores ? calcularMatch(scores, perfil) : null;
  if (!match) {
    return { id: fila.id, accion: "omitir", motivo: "scores no alcanzan para calcularMatch" };
  }
  return {
    id: fila.id,
    accion: "actualizar",
    perfil_cargo: perfil,
    match_data: match,
    antes: { perfil_cargo: fila.perfil_cargo, match_global: globalDe(fila.match_data) },
  };
}

function comoScores(raw: unknown): Scores | null {
  const v = typeof raw === "string" ? parsear(raw) : raw;
  if (!v || typeof v !== "object") return null;
  const s = v as Scores;
  if (!s.personalidad || !s.disc) return null;
  return s;
}

function globalDe(raw: unknown): number | null {
  const v = typeof raw === "string" ? parsear(raw) : raw;
  if (!v || typeof v !== "object" || !("global" in v)) return null;
  const g = (v as { global: unknown }).global;
  return typeof g === "number" && Number.isFinite(g) ? g : null;
}

function parsear(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
