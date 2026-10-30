"use client";

import { Archive, Ban, EyeOff, Megaphone } from "lucide-react";
import {
  TARJETAS_CONTEO,
  type ConteoClave,
} from "@/lib/requisition-board";

const ICONO: Record<ConteoClave, typeof Megaphone> = {
  publicadas: Megaphone,
  archivadas: Archive,
  cerradas: Ban,
  ocultas: EyeOff,
};

/**
 * Cuatro conteos, mismo lenguaje que el dashboard B: superficie blanca,
 * borde Void al 10 %, ícono + rótulo, número en peso liviano. Sin semáforo.
 */
export default function RequisitionCountCards({
  counts,
  activo,
  onElegir,
}: {
  counts: Record<ConteoClave, number | null>;
  activo: ConteoClave | null;
  onElegir: (clave: ConteoClave | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {TARJETAS_CONTEO.map((tarjeta) => {
        const n = counts[tarjeta.key];
        const texto = n == null ? "—" : String(n);
        const seleccionado = activo === tarjeta.key;
        const Icono = ICONO[tarjeta.key];
        return (
          <button
            key={tarjeta.key}
            type="button"
            aria-pressed={seleccionado}
            onClick={() => onElegir(seleccionado ? null : tarjeta.key)}
            className={
              "text-left bg-white rounded-2xl border p-3 min-h-[128px] transition-colors " +
              (seleccionado
                ? "border-[color:var(--ts-ink)]"
                : "border-[color:var(--ts-line)] hover:border-[color:var(--ts-ink)]")
            }
          >
            <span className="flex items-center gap-2 text-[12px] text-[var(--ts-muted)]">
              <Icono className="w-3.5 h-3.5 text-[var(--ts-ink)]" aria-hidden />
              {tarjeta.label}
            </span>
            <span
              className="mt-1 block text-[22px] font-light text-[var(--ts-ink)] tracking-tight leading-tight"
            >
              {texto}
            </span>
            <span className="mt-2 block text-[11px] text-[var(--ts-muted)] leading-snug">
              {tarjeta.definicion}
            </span>
          </button>
        );
      })}
    </div>
  );
}
