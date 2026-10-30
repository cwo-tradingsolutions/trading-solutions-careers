"use client";

import { etiquetaLlegada, type FuenteLista, type LlegadaFila } from "@/lib/recruitment-sources";

export function SourceChips({
  fuentes,
  activas,
  onAlternar,
  ocupado = false,
}: {
  fuentes: FuenteLista[];
  activas: string[];
  onAlternar?: (key: string, publicada: boolean) => void;
  ocupado?: boolean;
}) {
  const visibles = fuentes.filter((f) => f.active || activas.includes(f.key));
  if (visibles.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visibles.map((f) => {
        const on = activas.includes(f.key);
        const clase =
          "inline-flex items-center min-h-11 rounded-full border px-3 text-[12px] " +
          (on
            ? "bg-[var(--ts-ink)] text-white border-[color:var(--ts-ink)] disabled:opacity-50"
            : "bg-white text-[var(--ts-ink)] border-[color:var(--ts-line)] disabled:opacity-50");
        if (!onAlternar || !f.active) {
          if (!on) return null;
          return (
            <span key={f.key} className={clase}>
              {f.label}
            </span>
          );
        }
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={on}
            disabled={ocupado}
            onClick={(e) => {
              e.stopPropagation();
              if (ocupado) return;
              onAlternar(f.key, on);
            }}
            className={clase}
            title={on ? `Quitar ${f.label}` : `Marcar ${f.label}`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

/** Cruce: dónde se publicó la vacante, al lado de por dónde llegaron. */
export function ArrivalCross({
  sources,
  llegada,
  fuentes,
}: {
  sources: string[];
  llegada: LlegadaFila[];
  fuentes: FuenteLista[];
}) {
  const publicadas = sources
    .map((key) => fuentes.find((f) => f.key === key)?.label || key)
    .filter(Boolean);
  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
      {publicadas.length > 0 && (
        <div>
          <p className="text-[var(--ts-muted)] mb-1">Publicada en</p>
          <p className="text-[var(--ts-ink)]">{publicadas.join(" · ")}</p>
        </div>
      )}
      <div>
        <p className="text-[var(--ts-muted)] mb-1">Llegaron por</p>
        {llegada.length === 0 ? (
          <p className="text-[var(--ts-ink)]">Aún sin postulaciones</p>
        ) : (
          <ul className="text-[var(--ts-ink)] space-y-0.5">
            {llegada.map((fila) => (
              <li key={fila.arrival_source ?? "sin-dato"} className="tabular-nums">
                {etiquetaLlegada(fila.arrival_source, fuentes)} · {fila.n}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
