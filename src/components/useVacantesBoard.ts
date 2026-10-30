"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clasificarConteo, contarTarjetas, etiquetaOculta, type ConteoClave, type FilaConteo } from "@/lib/requisition-board";
import type { FuenteLista, LlegadaFila } from "@/lib/recruitment-sources";

type VacanteRow = {
  vacancy_id: string;
  web_vacancy_id: number | null;
  sources: string[];
  llegada: LlegadaFila[];
};

type ReqRow = FilaConteo & {
  id?: string;
  title?: string;
  web_vacancy_id?: number | null;
};

export type FilaSinVacante = { id: string; title: string; detalle: string };

export function useVacantesBoard() {
  const [fuentes, setFuentes] = useState<FuenteLista[]>([]);
  const [vacantes, setVacantes] = useState<VacanteRow[]>([]);
  const [reqs, setReqs] = useState<ReqRow[] | null>(null);
  const [filtro, setFiltro] = useState<ConteoClave | null>(null);
  const [fuenteFiltro, setFuenteFiltro] = useState("");
  const [admin, setAdmin] = useState(false);
  const [avisoChip, setAvisoChip] = useState<string | null>(null);
  const [llegadaTruncada, setLlegadaTruncada] = useState(false);
  const [chipOcupado, setChipOcupado] = useState(false);
  const seq = useRef(0);
  const enVuelo = useRef(false);

  const recargar = useCallback(async () => {
    const ticket = ++seq.current;
    const [boardRes, reqRes] = await Promise.all([
      fetch("/api/hr-admin/vacancy-sources", { cache: "no-store" }),
      fetch("/api/requisitions?include_hidden=1", { cache: "no-store" }),
    ]);
    if (ticket !== seq.current) return;
    if (boardRes.ok) {
      const board = await boardRes.json();
      setFuentes(board.fuentes || []);
      setVacantes(board.vacantes || []);
      setLlegadaTruncada(board.llegada_truncada === true);
    }
    if (reqRes.ok) {
      const body = await reqRes.json();
      setReqs(body.requisiciones || []);
    } else {
      setReqs([]);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function porWeb(webId: number): VacanteRow | undefined {
    return vacantes.find((v) => v.web_vacancy_id === webId);
  }

  function pasa(webId: number): boolean {
    const row = porWeb(webId);
    if (fuenteFiltro && !(row?.sources || []).includes(fuenteFiltro)) return false;
    if (!filtro) return true;
    // Cerradas y Ocultas no tienen vacante web. No se cruzan con esta lista.
    if (filtro === "cerradas" || filtro === "ocultas") return false;
    const req = (reqs || []).find((r) => r.web_vacancy_id === webId);
    if (!req) return false;
    return clasificarConteo(req) === filtro;
  }

  const filasSinVacante: FilaSinVacante[] =
    filtro === "cerradas" || filtro === "ocultas"
      ? (reqs || [])
          .filter((r) => clasificarConteo(r) === filtro)
          .map((r, i) => ({
            id: r.id || `req-${i}`,
            title: r.title || "Requisición",
            detalle: filtro === "ocultas" ? etiquetaOculta(r.hidden_reason) || "Oculta" : "Rechazada",
          }))
      : [];

  async function alternar(vacancyId: string, key: string, publicada: boolean) {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setChipOcupado(true);
    setAvisoChip(null);
    const previas = vacantes;
    seq.current += 1;
    setVacantes((curr) => curr.map((v) => {
      if (v.vacancy_id !== vacancyId) return v;
      const sources = publicada ? v.sources.filter((s) => s !== key) : [...v.sources, key];
      return { ...v, sources };
    }));
    try {
      const r = publicada
        ? await fetch(`/api/vacancies/${vacancyId}/postings?source=${encodeURIComponent(key)}`, { method: "DELETE" })
        : await fetch(`/api/vacancies/${vacancyId}/postings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: key }),
          });
      if (!r.ok) {
        const fuentesPrevias = previas.find((v) => v.vacancy_id === vacancyId)?.sources;
        setVacantes((curr) => curr.map((v) => (
          v.vacancy_id === vacancyId && fuentesPrevias
            ? { ...v, sources: fuentesPrevias }
            : v
        )));
        setAvisoChip("No se pudo actualizar la fuente");
        return;
      }
      try {
        await recargar();
      } catch {
        // El POST ya quedó. No se muestra error por un reload que falló.
      }
    } catch {
      const fuentesPrevias = previas.find((v) => v.vacancy_id === vacancyId)?.sources;
      setVacantes((curr) => curr.map((v) => (
        v.vacancy_id === vacancyId && fuentesPrevias
          ? { ...v, sources: fuentesPrevias }
          : v
      )));
      setAvisoChip("No se pudo actualizar la fuente");
    } finally {
      enVuelo.current = false;
      setChipOcupado(false);
    }
  }

  async function guardarFuente(accion: "alta" | "cambio", cuerpo: Record<string, unknown>): Promise<string | null> {
    const r = await fetch("/api/recruitment-sources", {
      method: accion === "alta" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return j.error || "No se pudo guardar la fuente";
    await recargar();
    return null;
  }

  return {
    fuentes,
    conteos: contarTarjetas(reqs),
    filtro,
    setFiltro,
    fuenteFiltro,
    setFuenteFiltro,
    admin,
    setAdmin,
    porWeb,
    pasa,
    filasSinVacante,
    avisoChip,
    chipOcupado,
    llegadaTruncada,
    alternar,
    guardarFuente,
  };
}
