"use client";

/**
 * EQUIPO DE TALENT · quién es quién y qué vacante lleva cada uno
 *
 * Dos cosas en una pantalla:
 *   1. Las personas: nombre, correo corporativo, rol, cargo para la firma y
 *      enlace de agendamiento.
 *   2. El reparto: qué vacante lleva cada quien, con su apoyo.
 *
 * El enlace de agenda es lo que cambia el día a día: en las vacantes con dueño,
 * los correos de citación salen con SU calendario en vez del de Talent. Si una
 * persona todavía no tiene agenda propia, no pasa nada: se sigue usando la de
 * siempre hasta que la cargue.
 *
 * Esto no reparte permisos: por ahora todos entran al ATS con la misma llave.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ROLES, etiquetaRol, type Rol } from "@/lib/reclutadores";

type Persona = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  cargo: string | null;
  calendly_url: string | null;
  activo: boolean;
  vacantes: number;
  apoyo_en: number;
};

type Vacante = {
  id: string;
  title: string;
  status: string | null;
  owner_recruiter_id: string | null;
  support_recruiter_id: string | null;
};

const VACIO = { nombre: "", email: "", rol: "reclutador" as Rol, cargo: "", calendly_url: "" };

export default function EquipoDeTalent() {
  const [gente, setGente] = useState<Persona[]>([]);
  const [vacantes, setVacantes] = useState<Vacante[]>([]);
  const [verInactivos, setVerInactivos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [nuevo, setNuevo] = useState(VACIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);

  const leer = useCallback(async () => {
    setError("");
    const r = await fetch(`/api/admin/reclutadores${verInactivos ? "?todos=1" : ""}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "No se pudo cargar el equipo");
    setGente(j.reclutadores || []);
    setVacantes(j.vacantes || []);
  }, [verInactivos]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      try {
        await leer();
      } catch (e: any) {
        if (vivo) setError(e.message);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [leer]);

  const abiertas = useMemo(
    () => vacantes.filter((v) => v.status == null || v.status === "open"),
    [vacantes],
  );
  const nombrePorId = useMemo(() => new Map(gente.map((p) => [p.id, p.nombre])), [gente]);

  async function agregar() {
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const r = await fetch("/api/admin/reclutadores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nuevo),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo guardar");
      setNuevo(VACIO);
      setAviso(`${j.reclutador.nombre} quedó en el equipo`);
      await leer();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function guardarEdicion(id: string) {
    setGuardando(true);
    setError("");
    try {
      const r = await fetch("/api/admin/reclutadores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...borrador }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo guardar");
      setEditando(null);
      await leer();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActivo(p: Persona) {
    setError("");
    try {
      const r = await fetch("/api/admin/reclutadores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, activo: !p.activo }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "No se pudo cambiar");
      await leer();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function asignar(vacancyId: string, campo: "owner_recruiter_id" | "support_recruiter_id", valor: string) {
    setError("");
    setAviso("");
    try {
      const r = await fetch(`/api/admin/vacancies/${vacancyId}/dueno`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo asignar");
      setAviso(
        campo === "owner_recruiter_id"
          ? `${j.vacante.title}: ahora la lleva ${valor ? nombrePorId.get(valor) : "nadie"}`
          : `${j.vacante.title}: apoyo actualizado`,
      );
      await leer();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const campo = (
    valor: string,
    onChange: (v: string) => void,
    ph: string,
    ancho = "",
  ) => (
    <input
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      placeholder={ph}
      className={`border border-gray-300 px-2.5 py-1.5 text-[13px] focus:border-black outline-none ${ancho}`}
    />
  );

  return (
    <div className="max-w-ts mx-auto px-5 py-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-sm font-medium text-ts-muted">Talent · Trading Solutions</div>
          <h1 className="text-[32px] font-light tracking-tight leading-none mt-1">Equipo y dueños de vacante</h1>
          <p className="text-sm text-gray-500 mt-2 max-w-[70ch]">
            El dueño responde por el proceso: sus métricas, sus correos y su agenda. El apoyo puede operar la vacante
            igual, sin aparecer frente al candidato.
          </p>
        </div>
        <a href="/hr-admin#funnel" className="ml-auto text-sm underline text-gray-600">
          ← Volver al funnel
        </a>
      </div>

      {error && <p className="mt-4 text-sm bg-red-50 border border-red-200 text-red-800 px-3 py-2">{error}</p>}
      {aviso && <p className="mt-4 text-sm bg-green-50 border border-green-200 text-green-900 px-3 py-2">{aviso}</p>}

      {/* ── Personas ── */}
      <section className="mt-7">
        <div className="flex items-center gap-3">
          <h2 className="text-[17px] font-bold tracking-tight">El equipo</h2>
          <label className="ml-auto text-[11.5px] text-gray-500 flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
            ver inactivos
          </label>
        </div>

        <div className="mt-3 border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[1.5px] text-gray-500">
                <th className="text-left font-semibold px-3 py-2.5 border-b border-gray-200">Persona</th>
                <th className="text-left font-semibold px-3 py-2.5 border-b border-gray-200">Rol</th>
                <th className="text-left font-semibold px-3 py-2.5 border-b border-gray-200">Firma</th>
                <th className="text-left font-semibold px-3 py-2.5 border-b border-gray-200">Agenda</th>
                <th className="text-left font-semibold px-3 py-2.5 border-b border-gray-200">Carga</th>
                <th className="border-b border-gray-200"></th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-gray-500 italic">
                    Cargando…
                  </td>
                </tr>
              )}
              {!cargando && gente.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-gray-500 italic">
                    Todavía no hay nadie. Agrega la primera persona abajo.
                  </td>
                </tr>
              )}
              {gente.map((p) =>
                editando === p.id ? (
                  <tr key={p.id} className="border-b border-gray-100 bg-gray-50">
                    <td className="px-3 py-2">
                      {campo(borrador.nombre, (v) => setBorrador({ ...borrador, nombre: v }), "Nombre", "w-full")}
                      <div className="text-[11px] text-gray-400 mt-1">{p.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={borrador.rol}
                        onChange={(e) => setBorrador({ ...borrador, rol: e.target.value as Rol })}
                        className="border border-gray-300 px-2 py-1.5 text-[13px]"
                      >
                        {ROLES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {campo(borrador.cargo, (v) => setBorrador({ ...borrador, cargo: v }), "Cargo para la firma", "w-full")}
                    </td>
                    <td className="px-3 py-2">
                      {campo(
                        borrador.calendly_url,
                        (v) => setBorrador({ ...borrador, calendly_url: v }),
                        "https://calendly.com/…",
                        "w-full",
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500">—</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <button
                        onClick={() => guardarEdicion(p.id)}
                        disabled={guardando}
                        className="text-[12px] font-semibold px-3 py-1.5 bg-black text-white disabled:opacity-40"
                      >
                        Guardar
                      </button>
                      <button onClick={() => setEditando(null)} className="text-[12px] px-2 py-1.5 text-gray-500 underline">
                        Cancelar
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className={`border-b border-gray-100 ${p.activo ? "" : "opacity-50"}`}>
                    <td className="px-3 py-2.5">
                      <div className="font-bold">{p.nombre}</div>
                      <div className="text-[11.5px] text-gray-500">{p.email}</div>
                    </td>
                    <td className="px-3 py-2.5">{etiquetaRol(p.rol)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{p.cargo || <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-2.5">
                      {p.calendly_url ? (
                        <a href={p.calendly_url} target="_blank" rel="noreferrer" className="underline break-all">
                          {p.calendly_url.replace(/^https?:\/\//, "")}
                        </a>
                      ) : (
                        <span className="text-amber-700">sin agenda propia</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {p.vacantes} {p.vacantes === 1 ? "vacante" : "vacantes"}
                      {p.apoyo_en > 0 && <span className="text-gray-500"> · apoyo en {p.apoyo_en}</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <button
                        onClick={() => {
                          setEditando(p.id);
                          setBorrador({
                            nombre: p.nombre,
                            email: p.email,
                            rol: p.rol,
                            cargo: p.cargo || "",
                            calendly_url: p.calendly_url || "",
                          });
                        }}
                        className="text-[12px] px-2.5 py-1.5 border border-gray-300 hover:border-black"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => cambiarActivo(p)}
                        title={p.activo ? "Deja de aparecer para asignar vacantes" : "Vuelve a estar disponible"}
                        className="text-[12px] px-2.5 py-1.5 ml-1 text-gray-500 underline"
                      >
                        {p.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        {/* Alta */}
        <div className="mt-3 border border-gray-200 bg-white p-3.5">
          <div className="text-[10px] uppercase tracking-[1.5px] text-gray-500 mb-2.5">Agregar a alguien</div>
          <div className="flex flex-wrap gap-2 items-center">
            {campo(nuevo.nombre, (v) => setNuevo({ ...nuevo, nombre: v }), "Nombre y apellido", "w-[190px]")}
            {campo(nuevo.email, (v) => setNuevo({ ...nuevo, email: v }), "correo@tradingsolutions.com", "w-[240px]")}
            <select
              value={nuevo.rol}
              onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value as Rol })}
              className="border border-gray-300 px-2 py-1.5 text-[13px]"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            {campo(nuevo.cargo, (v) => setNuevo({ ...nuevo, cargo: v }), "Cargo para la firma", "w-[250px]")}
            {campo(nuevo.calendly_url, (v) => setNuevo({ ...nuevo, calendly_url: v }), "https://calendly.com/…", "w-[250px]")}
            <button
              onClick={agregar}
              disabled={guardando || !nuevo.nombre || !nuevo.email}
              className="text-[13px] font-semibold px-3.5 py-2 bg-black text-white disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Agregar"}
            </button>
          </div>
          <p className="text-[11.5px] text-gray-400 mt-2">
            El correo debe ser el corporativo: cuando exista el ingreso por persona, esa va a ser la cuenta con la que
            entre. La agenda se puede dejar en blanco y cargarla después.
          </p>
        </div>
      </section>

      {/* ── Reparto ── */}
      <section className="mt-9">
        <h2 className="text-[17px] font-bold tracking-tight">Quién lleva cada vacante</h2>
        <p className="text-[13px] text-gray-500 mt-1">Solo las vacantes abiertas. Al cambiar el dueño cambian la agenda y la firma de sus correos.</p>
        <div className="mt-3 border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[1.5px] text-gray-500">
                <th className="text-left font-semibold px-3 py-2.5 border-b border-gray-200">Vacante</th>
                <th className="text-left font-semibold px-3 py-2.5 border-b border-gray-200">Dueño</th>
                <th className="text-left font-semibold px-3 py-2.5 border-b border-gray-200">Apoyo</th>
                <th className="text-left font-semibold px-3 py-2.5 border-b border-gray-200">Agenda que se usa</th>
              </tr>
            </thead>
            <tbody>
              {abiertas.map((v) => {
                const dueno = gente.find((p) => p.id === v.owner_recruiter_id);
                return (
                  <tr key={v.id} className="border-b border-gray-100">
                    <td className="px-3 py-2.5 font-semibold">{v.title}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={v.owner_recruiter_id || ""}
                        onChange={(e) => asignar(v.id, "owner_recruiter_id", e.target.value)}
                        className="border border-gray-300 px-2 py-1.5 text-[13px] min-w-[170px]"
                      >
                        <option value="">Sin dueño</option>
                        {gente
                          .filter((p) => p.activo && p.rol !== "hiring_manager")
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={v.support_recruiter_id || ""}
                        onChange={(e) => asignar(v.id, "support_recruiter_id", e.target.value)}
                        className="border border-gray-300 px-2 py-1.5 text-[13px] min-w-[170px]"
                      >
                        <option value="">Sin apoyo</option>
                        {gente
                          .filter((p) => p.activo && p.rol !== "hiring_manager" && p.id !== v.owner_recruiter_id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {dueno?.calendly_url ? (
                        <span className="break-all">{dueno.calendly_url.replace(/^https?:\/\//, "")}</span>
                      ) : (
                        <span className="text-amber-700">la de siempre · el dueño no tiene agenda propia</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!cargando && abiertas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-gray-500 italic">
                    No hay vacantes abiertas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11.5px] text-gray-400 mt-6 leading-relaxed">
        Esto todavía no reparte permisos: cualquiera que entre al ATS sigue viendo y pudiendo todo. El ingreso por
        persona y la regla de «cada quien edita lo suyo» son el paso siguiente.
      </p>
    </div>
  );
}
