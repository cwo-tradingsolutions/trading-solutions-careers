"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Crear una vacante directa desde el ATS (sin pasar por requisición).
// Postea a /api/vacancies (requireAdmin la valida con la cookie de sesión).
// Al crearla queda en la pestaña Vacantes, lista para "Publicar en la web".
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { FechasVacanteFields, errorFechas } from "@/components/CamposObligatorios";

export default function NuevaVacanteModal({
  onCerrar,
  onCreada,
}: {
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const [f, setF] = useState({
    title: "",
    department: "",
    location: "",
    work_mode: "Presencial",
    employment_type: "Tiempo completo",
    description: "",
    responsibilities: "",
    requirements: "",
    preferred_qualifications: "",
    salary_range: "",
    linkedin_url: "",
    fecha_apertura: "",
    fecha_objetivo: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function enviar() {
    if (!f.title.trim() || !f.department.trim()) {
      setProblema("El título y el área (departamento) son obligatorios.");
      return;
    }
    const fechas = errorFechas(f.fecha_apertura, f.fecha_objetivo, true);
    if (fechas) {
      setProblema(fechas);
      return;
    }
    setEnviando(true);
    setProblema(null);
    try {
      const r = await fetch("/api/vacancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.title.trim(),
          department: f.department.trim(),
          location: f.location.trim() || null,
          work_mode: f.work_mode || null,
          employment_type: f.employment_type || null,
          description: f.description.trim() || null,
          responsibilities: f.responsibilities.trim() || null,
          requirements: f.requirements.trim() || null,
          preferred_qualifications: f.preferred_qualifications.trim() || null,
          salary_range: f.salary_range.trim() || null,
          linkedin_url: f.linkedin_url.trim() || null,
          fecha_apertura: f.fecha_apertura,
          fecha_objetivo: f.fecha_objetivo,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setProblema(j?.error || "No se pudo crear la vacante.");
        return;
      }
      if (j?.aviso_fechas) window.alert(j.aviso_fechas);
      onCreada();
    } catch (e: any) {
      setProblema(e?.message || "Error de red.");
    } finally {
      setEnviando(false);
    }
  }

  const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2";
  const lab = "block text-xs font-semibold mb-1.5 text-gray-700";

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
      className="fixed inset-0 z-50 bg-black/35 flex items-start justify-center px-4 py-10 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl p-6">
        <h2 className="text-lg font-bold">Nueva vacante</h2>
        <p className="text-sm text-gray-500 mt-0.5 mb-5">
          Créala directo, sin requisición. Al guardarla queda en Vacantes, lista para publicar en careers.
        </p>

        <label className="block mb-4">
          <span className={lab}>Título del cargo *</span>
          <input value={f.title} onChange={(e) => set("title", e.target.value)} className={inp} placeholder="Ej: Operations Executive" />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <label className="block">
            <span className={lab}>Área / departamento *</span>
            <input value={f.department} onChange={(e) => set("department", e.target.value)} className={inp} list="nv-deptos" placeholder="Ej: Operations" />
            <datalist id="nv-deptos">
              <option value="Operations" /><option value="Finance" /><option value="Sales" />
              <option value="Tecnología" /><option value="Wellness" /><option value="Compliance" />
            </datalist>
          </label>
          <label className="block">
            <span className={lab}>Ubicación</span>
            <input value={f.location} onChange={(e) => set("location", e.target.value)} className={inp} placeholder="Ej: Barranquilla, Colombia" />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <label className="block">
            <span className={lab}>Modalidad</span>
            <select value={f.work_mode} onChange={(e) => set("work_mode", e.target.value)} className={`${inp} bg-white`}>
              <option>Presencial</option><option>Híbrido</option><option>Remoto</option>
            </select>
          </label>
          <label className="block">
            <span className={lab}>Tipo de contratación</span>
            <select value={f.employment_type} onChange={(e) => set("employment_type", e.target.value)} className={`${inp} bg-white`}>
              <option>Tiempo completo</option><option>Medio tiempo</option>
              <option>Prácticas</option><option>Contrato / temporal</option>
            </select>
          </label>
        </div>

        <label className="block mb-4">
          <span className={lab}>Descripción del cargo</span>
          <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} className={inp}
            placeholder="Qué es la posición y para qué existe." />
        </label>

        <label className="block mb-4">
          <span className={lab}>Responsabilidades · una por línea</span>
          <textarea value={f.responsibilities} onChange={(e) => set("responsibilities", e.target.value)} rows={3} className={inp}
            placeholder="Las tareas del día a día." />
        </label>

        <label className="block mb-4">
          <span className={lab}>Requisitos · una por línea</span>
          <textarea value={f.requirements} onChange={(e) => set("requirements", e.target.value)} rows={3} className={inp}
            placeholder="Lo indispensable primero." />
        </label>

        <label className="block mb-4">
          <span className={lab}>Deseables (opcional)</span>
          <textarea value={f.preferred_qualifications} onChange={(e) => set("preferred_qualifications", e.target.value)} rows={2} className={inp}
            placeholder="Lo que suma pero no descarta." />
        </label>

        <div className="mb-4">
          <FechasVacanteFields
            apertura={f.fecha_apertura}
            objetivo={f.fecha_objetivo}
            onApertura={(v) => set("fecha_apertura", v)}
            onObjetivo={(v) => set("fecha_objetivo", v)}
          />
          <p className="text-[11px] text-gray-500 mt-1">
            La apertura se guarda en posted_at. El cierre objetivo solo se exige si la columna target_close_date ya existe.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-1">
          <label className="block">
            <span className={lab}>Rango salarial (opcional)</span>
            <input value={f.salary_range} onChange={(e) => set("salary_range", e.target.value)} className={inp} placeholder="Ej: 3.000.000 – 4.000.000 COP" />
          </label>
          <label className="block">
            <span className={lab}>URL de LinkedIn (opcional)</span>
            <input value={f.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} className={inp} placeholder="https://…" />
          </label>
        </div>

        {problema && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 mt-4">
            {problema}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onCerrar} className="text-sm px-4 py-2 rounded-full border border-gray-300 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={enviar} disabled={enviando}
            className="text-sm px-5 py-2 rounded-full bg-black text-white hover:bg-gray-800 font-medium disabled:opacity-50">
            {enviando ? "Creando…" : "Crear vacante"}
          </button>
        </div>
      </div>
    </div>
  );
}
