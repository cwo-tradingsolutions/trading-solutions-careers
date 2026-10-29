"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TIPOS_ADJUNTO, etiquetaTipo, pesoLegible } from "@/lib/adjuntos";

type Archivo = {
  id: string;
  kind: string;
  title: string | null;
  mime: string | null;
  bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
  url: string | null;
};

/**
 * Adjuntos de la ficha del candidato.
 *
 * La evidencia del proceso —la hoja del caso escaneada, el registro del
 * evaluador, la verificación de referencias— vivía en el computador de quien la
 * produjo. Aquí queda pegada al expediente, que es donde alguien la va a buscar
 * si el proceso se cuestiona seis meses después.
 */
export default function CandidateFilesBlock({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName?: string;
}) {
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [kind, setKind] = useState<string>("assessment");
  const [error, setError] = useState("");
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/candidates/${candidateId}/files`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo cargar");
      setArchivos(j.archivos ?? []);
      setError("");
    } catch (e: any) {
      setError(e.message || "No se pudo cargar");
    } finally {
      setCargando(false);
    }
  }, [candidateId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function subir(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setSubiendo(true);
    setError("");
    try {
      for (const archivo of Array.from(lista)) {
        const fd = new FormData();
        fd.append("file", archivo);
        fd.append("kind", kind);
        fd.append("title", archivo.name);
        const r = await fetch(`/api/candidates/${candidateId}/files`, { method: "POST", body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `No se pudo subir ${archivo.name}`);
      }
      await cargar();
    } catch (e: any) {
      setError(e.message || "No se pudo subir");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function eliminar(f: Archivo) {
    if (!confirm(`¿Ocultar "${f.title || "este documento"}" del expediente? El archivo queda guardado.`)) return;
    try {
      const r = await fetch(`/api/candidates/${candidateId}/files?fileId=${f.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo eliminar");
      setArchivos((prev) => prev.filter((x) => x.id !== f.id));
    } catch (e: any) {
      setError(e.message || "No se pudo eliminar");
    }
  }

  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-2">
        📎 Documentos del expediente
      </h3>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          subir(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed p-3 transition-colors ${
          arrastrando ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white"
          >
            {TIPOS_ADJUNTO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={subiendo}
            onClick={() => inputRef.current?.click()}
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-gray-900 text-white disabled:opacity-50"
          >
            {subiendo ? "Subiendo…" : "Elegir archivo"}
          </button>

          <span className="text-[11px] text-gray-500">o arrástralo aquí · PDF, imagen, Word o Excel · máx. 20 MB</span>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
          onChange={(e) => subir(e.target.files)}
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-2 space-y-1.5">
        {cargando && <p className="text-xs text-gray-400 italic">Cargando documentos…</p>}

        {!cargando && archivos.length === 0 && (
          <p className="text-xs text-gray-500 italic">
            Todavía no hay evidencia cargada{candidateName ? ` para ${candidateName.split(" ")[0]}` : ""}.
          </p>
        )}

        {archivos.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-900 truncate">{f.title || "Documento"}</p>
              <p className="text-[11px] text-gray-500">
                {etiquetaTipo(f.kind)}
                {f.bytes ? ` · ${pesoLegible(f.bytes)}` : ""}
                {` · ${new Date(f.created_at).toLocaleDateString("es-CO", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}`}
              </p>
            </div>

            {f.url && (
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-blue-600 hover:underline shrink-0"
              >
                Abrir ↗
              </a>
            )}

            <button
              type="button"
              onClick={() => eliminar(f)}
              title="Eliminar del expediente"
              className="text-xs text-gray-400 hover:text-red-600 shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
