"use client";

import { RECRUITER_SOURCE_OPTIONS, validarCanalReclutador } from "@/lib/candidate-source";
import { validarFechasVacante } from "@/lib/vacancy-dates";

export function CanalSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold mb-1 text-gray-700">Canal de origen *</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
      >
        <option value="">Elegí el canal</option>
        {RECRUITER_SOURCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function errorCanal(value: string): string | null {
  const r = validarCanalReclutador(value);
  return r.ok ? null : r.error;
}

export function FechasVacanteFields({
  apertura,
  objetivo,
  onApertura,
  onObjetivo,
}: {
  apertura: string;
  objetivo: string;
  onApertura: (v: string) => void;
  onObjetivo: (v: string) => void;
}) {
  const campo = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white";
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label className="block">
        <span className="block text-xs font-semibold mb-1 text-gray-700">Fecha de apertura *</span>
        <input type="date" value={apertura} onChange={(e) => onApertura(e.target.value)} className={campo} />
      </label>
      <label className="block">
        <span className="block text-xs font-semibold mb-1 text-gray-700">Fecha de cierre objetivo *</span>
        <input type="date" value={objetivo} onChange={(e) => onObjetivo(e.target.value)} className={campo} />
      </label>
    </div>
  );
}

/** El cierre solo es obligatorio en el cliente si la pantalla ya sabe que la columna existe. */
export function errorFechas(apertura: string, objetivo: string, exigirObjetivo: boolean): string | null {
  const r = validarFechasVacante(apertura, objetivo, exigirObjetivo);
  return r.ok ? null : r.error;
}
