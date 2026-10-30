"use client";

import { useState } from "react";
import type { FuenteLista } from "@/lib/recruitment-sources";

/**
 * Alta, cambio de nombre y desactivar. No hay borrar: la clave puede estar
 * en postings y en ?src=, y una FK no deja huérfanos.
 */
export default function FuentesAdmin({
  fuentes,
  onCerrar,
  onGuardar,
}: {
  fuentes: FuenteLista[];
  onCerrar: () => void;
  onGuardar: (accion: "alta" | "cambio", cuerpo: Record<string, unknown>) => Promise<string | null>;
}) {
  const [clave, setClave] = useState("");
  const [nombre, setNombre] = useState("");
  const [nombres, setNombres] = useState<Record<string, string>>(
    Object.fromEntries(fuentes.map((f) => [f.key, f.label])),
  );
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function correr(accion: "alta" | "cambio", cuerpo: Record<string, unknown>) {
    setOcupado(true);
    setError(null);
    const fallo = await onGuardar(accion, cuerpo);
    setOcupado(false);
    if (fallo) setError(fallo);
    else if (accion === "alta") {
      setClave("");
      setNombre("");
    }
  }

  return (
    <div className="mb-4 bg-white rounded-2xl border border-[color:var(--ts-line)] p-4">
      <div className="flex items-baseline gap-3 mb-3">
        <h3 className="text-[15px] font-medium text-[var(--ts-ink)]">Fuentes</h3>
        <button type="button" onClick={onCerrar} className="ml-auto min-h-11 inline-flex items-center text-[12px] text-[var(--ts-muted)] underline">
          Cerrar
        </button>
      </div>
      <p className="text-[12px] text-[var(--ts-muted)] mb-3">
        La clave es la que viaja en ?src=. Se puede renombrar lo que se lee y desactivar. No se borra.
      </p>
      {error && (
        <p className="mb-3 text-[13px] text-[var(--ts-ink)] border border-[color:var(--ts-line)] rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      <ul className="space-y-2 mb-4">
        {fuentes.map((f) => (
          <li key={f.key} className="flex flex-wrap items-center gap-2">
            <code className="text-[12px] text-[var(--ts-muted)] w-24">{f.key}</code>
            <input
              value={nombres[f.key] ?? f.label}
              onChange={(e) => setNombres((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="rounded-full border border-[color:var(--ts-line)] px-3 py-1 text-[13px] min-w-0 flex-1"
              aria-label={`Nombre de ${f.key}`}
            />
            <button
              type="button"
              disabled={ocupado}
              onClick={() => correr("cambio", { key: f.key, label: nombres[f.key] ?? f.label })}
              className="min-h-11 rounded-full border border-[color:var(--ts-line)] px-3 text-[12px]"
            >
              Renombrar
            </button>
            {f.key !== "careers" && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => correr("cambio", { key: f.key, active: !f.active })}
                className="min-h-11 rounded-full border border-[color:var(--ts-line)] bg-white px-3 text-[12px] text-[var(--ts-ink)]"
              >
                {f.active ? "Desactivar" : "Activar"}
              </button>
            )}
            {!f.active && <span className="text-[11px] text-[var(--ts-muted)]">inactiva</span>}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2 items-center"
        onSubmit={(e) => {
          e.preventDefault();
          correr("alta", { key: clave, label: nombre });
        }}
      >
        <input
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          placeholder="clave"
          className="rounded-full border border-[color:var(--ts-line)] px-3 py-1 text-[13px] w-32"
          aria-label="Clave de la fuente nueva"
        />
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre"
          className="rounded-full border border-[color:var(--ts-line)] px-3 py-1 text-[13px] flex-1 min-w-[8rem]"
          aria-label="Nombre de la fuente nueva"
        />
        <button type="submit" disabled={ocupado} className="min-h-11 rounded-full bg-[var(--ts-ink)] text-white px-4 text-[13px]">
          Agregar
        </button>
      </form>
    </div>
  );
}
