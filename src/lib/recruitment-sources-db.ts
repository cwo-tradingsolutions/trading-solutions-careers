/**
 * Lectura y edición de ht_recruitment_sources.
 * Si la tabla no está (migración sin aplicar), se devuelve FUENTES.
 */

import { supabaseAdmin } from "@/lib/supabase";
import {
  agruparLlegada,
  conAutomatico,
  fuentesFallback,
  type FuenteLista,
  type LlegadaFila,
} from "@/lib/recruitment-sources";

export type VacanteFuentes = {
  vacancy_id: string;
  title: string;
  status: string | null;
  web_vacancy_id: number | null;
  requisition_id: string | null;
  sources: string[];
  llegada: LlegadaFila[];
};

export async function cargarFuentes(): Promise<{ fuentes: FuenteLista[]; desde: "tabla" | "fallback" }> {
  try {
    const { data, error } = await supabaseAdmin
      .from("ht_recruitment_sources")
      .select("key, label, active, sort_order")
      .order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) {
      return { fuentes: fuentesFallback(), desde: "fallback" };
    }
    return {
      fuentes: (data as { key: string; label: string; active: boolean; sort_order: number }[]).map(conAutomatico),
      desde: "tabla",
    };
  } catch {
    return { fuentes: fuentesFallback(), desde: "fallback" };
  }
}

const PAGINA = 1000;

const TOPE = 50_000;

/**
 * PostgREST corta en 1000 filas. Se pide de a páginas, ordenadas por id.
 * Truncado solo si hay más que el tope: se pide tope+1 y, si llega, se
 * descarta esa fila de más.
 */
async function leerCandidatosPorPagina(): Promise<{
  rows: { vacancy_id: string; arrival_source: string | null }[];
  truncated: boolean;
} | null> {
  const todos: { vacancy_id: string; arrival_source: string | null }[] = [];
  for (let desde = 0; todos.length <= TOPE; desde += PAGINA) {
    const falta = TOPE + 1 - todos.length;
    const tam = Math.min(PAGINA, falta);
    const { data, error } = await supabaseAdmin
      .from("ht_candidates")
      .select("vacancy_id, arrival_source")
      .order("id", { ascending: true })
      .range(desde, desde + tam - 1);
    if (error) {
      console.error("[vacancy-sources] llegada:", error.message);
      return null;
    }
    const lote = (data || []) as { vacancy_id: string; arrival_source: string | null }[];
    todos.push(...lote);
    if (lote.length < tam) return { rows: todos, truncated: false };
  }
  console.error("[vacancy-sources] llegada truncada: hay más de", TOPE, "filas");
  return { rows: todos.slice(0, TOPE), truncated: true };
}

export async function clavesFuenteActivas(): Promise<string[]> {
  const { fuentes } = await cargarFuentes();
  return fuentes.filter((f) => f.active).map((f) => f.key);
}

export async function cargarTableroFuentes(): Promise<{
  fuentes: FuenteLista[];
  desde: "tabla" | "fallback";
  vacantes: VacanteFuentes[];
  llegada_truncada: boolean;
}> {
  const { fuentes, desde } = await cargarFuentes();
  try {
    const { data: vacs, error: vacErr } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, status, requisition_id");
    if (vacErr) return { fuentes, desde, vacantes: [], llegada_truncada: false };

    const { data: reqs } = await supabaseAdmin
      .from("ht_requisitions")
      .select("id, vacancy_id, web_vacancy_id");
    const webPorVacante = new Map<string, number | null>();
    const reqPorVacante = new Map<string, string>();
    for (const r of (reqs || []) as { id: string; vacancy_id: string | null; web_vacancy_id: number | null }[]) {
      if (!r.vacancy_id) continue;
      webPorVacante.set(r.vacancy_id, r.web_vacancy_id ?? null);
      reqPorVacante.set(r.vacancy_id, r.id);
    }

    const { data: postings } = await supabaseAdmin
      .from("ht_vacancy_postings")
      .select("vacancy_id, source");
    const sourcesPorVacante = new Map<string, string[]>();
    for (const p of (postings || []) as { vacancy_id: string; source: string }[]) {
      const arr = sourcesPorVacante.get(p.vacancy_id) ?? [];
      arr.push(p.source);
      sourcesPorVacante.set(p.vacancy_id, arr);
    }

    let llegadaPorVacante = new Map<string, LlegadaFila[]>();
    let llegadaTruncada = false;
    const cands = await leerCandidatosPorPagina();
    if (cands) {
      llegadaTruncada = cands.truncated;
      llegadaPorVacante = agruparLlegada(cands.rows.filter((c) => c.vacancy_id));
    }

    const vacantes: VacanteFuentes[] = ((vacs || []) as {
      id: string;
      title: string | null;
      status: string | null;
      requisition_id: string | null;
    }[]).map((v) => ({
      vacancy_id: v.id,
      title: v.title || "Vacante",
      status: v.status,
      web_vacancy_id: webPorVacante.get(v.id) ?? null,
      requisition_id: v.requisition_id ?? reqPorVacante.get(v.id) ?? null,
      sources: sourcesPorVacante.get(v.id) ?? [],
      llegada: llegadaPorVacante.get(v.id) ?? [],
    }));

    return { fuentes, desde, vacantes, llegada_truncada: llegadaTruncada };
  } catch {
    return { fuentes, desde, vacantes: [], llegada_truncada: false };
  }
}
