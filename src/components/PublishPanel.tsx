"use client";

/**
 * PANEL DE PUBLICACIÓN · dónde está montada una vacante
 *
 * Arma el texto listo para pegar en cada portal y registra dónde se publicó.
 *
 * POR QUÉ NO PUBLICA SOLO
 * LinkedIn tiene API pero exige el producto Job Posting de Talent Solutions,
 * que se aprueba comercialmente. Turpial y Magneto no tienen integración. Un
 * botón que dijera "Publicar" sin publicar sería peor que no tenerlo: alguien
 * confiaría y la vacante no quedaría en ningún lado. Así que esto hace lo que
 * sí puede hacer bien — quitar el trabajo de redactar y dejar registro — y
 * dice con todas las letras qué falta hacer a mano.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { construirAviso, type DatosDelAviso } from "@/lib/job-post";
import { enlaceConSrc } from "@/lib/recruitment-sources";

type Fuente = {
  key: string;
  label: string;
  automatico: boolean;
  publicada: boolean;
};

type Publicacion = {
  source: string;
  posted_at: string;
  external_url: string | null;
};

export default function PublishPanel({
  vacancyId,
  requisicionId,
  datos,
  urlAplicacion,
  onCerrar,
}: {
  vacancyId: string;
  /** Para publicar en careers hace falta la requisición, no la vacante. */
  requisicionId?: string | null;
  datos: DatosDelAviso;
  urlAplicacion?: string | null;
  onCerrar: () => void;
}) {
  const titulo = datos.title;
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [publicaciones, setPublicaciones] = useState<Publicacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(`/api/vacancies/${vacancyId}/postings`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo cargar");
      setFuentes(j.fuentes || []);
      setPublicaciones(j.publicaciones || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setCargando(false);
    }
  }, [vacancyId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const enlace = urlAplicacion || "";

  // El aviso sale con el formato estándar de la compañía. Antes se armaba a
  // mano y cada vacante quedaba distinta según quién la escribiera.
  const generado = construirAviso(datos, enlace || null);

  // POR QUÉ SE PUEDE EDITAR ACÁ
  // El cuadro era de solo lectura y la nota decía «editalo después de pegarlo».
  // En la práctica eso obliga a pegar en cinco portales y corregir lo mismo
  // cinco veces, y cuando el texto sale con un error —una palabra de más, un
  // signo mal puesto— no hay dónde arreglarlo antes de copiarlo. Se edita acá y
  // se copia ya corregido.
  //
  // El texto editado vive mientras el panel esté abierto: sirve para ajustar la
  // copia que se va a pegar, no para reemplazar el perfil. Lo que se guarda
  // sigue siendo la requisición, y por eso «Volver al texto generado» siempre
  // puede recuperarla.
  const [editado, setEditado] = useState<string | null>(null);
  const texto = editado ?? generado;
  const tocado = editado !== null && editado !== generado;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("El navegador no dejó copiar. Seleccioná el texto y copialo a mano.");
    }
  }

  const [publicandoWeb, setPublicandoWeb] = useState(false);
  const [marcando, setMarcando] = useState<string | null>(null);

  // El aviso de error vive arriba del todo y la lista de fuentes queda abajo:
  // apretando «Magneto» el mensaje aparecía fuera de la pantalla y el botón
  // parecía no hacer nada. Si hay error, se trae a la vista.
  const avisoError = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (error) avisoError.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  /** La página de empleo sí se puede publicar desde acá: escribe en Neon. */
  async function publicarEnCareers() {
    if (!requisicionId) {
      setError("Esta vacante no viene de una requisición, así que se publica desde la pestaña Vacantes.");
      return;
    }
    setPublicandoWeb(true);
    setError(null);
    try {
      const r = await fetch(`/api/requisitions/${requisicionId}/publish-web`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        setError([j.error, j.detail].filter(Boolean).join(" · "));
        return;
      }
      window.alert(`Publicada en la página de empleo.\n\n${j.url}`);
      cargar();
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setPublicandoWeb(false);
    }
  }

  /**
   * Marca o desmarca una fuente.
   *
   * ANTES SE PERDÍA EL ERROR
   * Estas dos llamadas no miraban `r.ok`: se hacía el fetch, se llamaba a
   * `cargar()` y listo. Si el servidor respondía 400, 401 o 500 —la sesión
   * vencida es el caso más común— la fuente se quedaba sin marcar y en
   * pantalla no aparecía absolutamente nada. El botón parecía no hacer nada y
   * no había forma de saber por qué. Un `await fetch` sin revisar la respuesta
   * no es «guardar»: es mandar y no preguntar.
   */
  async function marcar(source: string, ya: boolean) {
    // La página de empleo no se "marca": se publica.
    if (source === "careers" && !ya) return publicarEnCareers();
    setError(null);
    setMarcando(source);
    try {
      const r = ya
        ? await fetch(`/api/vacancies/${vacancyId}/postings?source=${source}`, { method: "DELETE" })
        : await (async () => {
            const url = window.prompt(
              `Enlace de la publicación en ${source} (opcional, podés dejarlo vacío):`,
              "",
            );
            // Cancelar el prompt no debe marcarla: es la forma de arrepentirse.
            if (url === null) return null;
            return fetch(`/api/vacancies/${vacancyId}/postings`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source, external_url: url || null }),
            });
          })();

      if (!r) return; // se canceló el prompt

      if (!r.ok) {
        const j = await r.json().catch(() => ({}) as any);
        const detalle = [j.error, j.detail].filter(Boolean).join(" · ");
        setError(
          detalle ||
            (r.status === 401
              ? "La sesión del panel venció. Volvé a entrar y probá de nuevo."
              : `El servidor respondió ${r.status} y no se pudo ${ya ? "desmarcar" : "marcar"} ${source}.`),
        );
        return;
      }
      cargar();
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar");
    } finally {
      setMarcando(null);
    }
  }

  const faltan = fuentes.filter((f) => !f.publicada);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full my-8">
        <div className="flex items-start gap-4 px-7 pt-6 pb-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-bold">Publicar la vacante</h3>
            <p className="text-sm text-gray-500 mt-0.5">{titulo}</p>
          </div>
          <button
            onClick={onCerrar}
            className="ml-auto w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="px-7 py-6 space-y-6">
          {error && (
            <div
              ref={avisoError}
              className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          {!enlace && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
              Todavía no está en la página de empleo, así que el aviso no tiene enlace
              donde aplicar. Publicala primero acá arriba, en <strong>Página de empleo</strong>:
              sin enlace, quien la vea en LinkedIn tiene que mandar la hoja de vida por
              correo y no entra al funnel.
            </div>
          )}

          {/* ── Dónde está publicada ── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Dónde está publicada
            </p>
            {cargando ? (
              <p className="text-sm text-gray-400">Cargando…</p>
            ) : (
              <div className="space-y-2">
                {fuentes.map((f) => {
                  const pub = publicaciones.find((p) => p.source === f.key);
                  return (
                    <div
                      key={f.key}
                      className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{f.label}</p>
                        <p className="text-xs text-gray-500">
                          {f.publicada && pub ? (
                            <>
                              Publicada el {new Date(pub.posted_at).toLocaleDateString("es-CO")}
                              {pub.external_url && (
                                <>
                                  {" · "}
                                  <a
                                    href={pub.external_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                  >
                                    ver
                                  </a>
                                </>
                              )}
                            </>
                          ) : f.automatico ? (
                            "Se publica desde acá, con lo que armaste en la requisición"
                          ) : (
                            "Hay que montarla a mano en el portal"
                          )}
                          {enlace && f.key !== "careers" && (
                            <>
                              {" · "}
                              <span className="break-all">{enlaceConSrc(enlace, f.key)}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => marcar(f.key, f.publicada)}
                        disabled={marcando === f.key || (f.key === "careers" && publicandoWeb)}
                        className={
                          "ml-auto text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap disabled:opacity-50 " +
                          (f.publicada
                            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                            : "border border-gray-300 text-gray-700 hover:bg-gray-50")
                        }
                      >
                        {marcando === f.key
                          ? "Guardando…"
                          : f.publicada
                            ? "Publicada ✓"
                            : f.key === "careers"
                              ? publicandoWeb ? "Publicando…" : "Publicar ahora"
                              : "Marcar publicada"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {faltan.length > 0 && !cargando && (
              <p className="text-xs text-gray-400 mt-3">
                Faltan {faltan.length}: {faltan.map((f) => f.label).join(", ")}.
              </p>
            )}
          </div>

          {/* ── El texto listo ── */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Texto para el portal
              </p>
              {tocado && (
                <button
                  onClick={() => setEditado(null)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Volver al texto generado
                </button>
              )}
              <button
                onClick={copiar}
                className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full bg-black text-white hover:bg-gray-800"
              >
                {copiado ? "Copiado ✓" : "Copiar"}
              </button>
            </div>
            <textarea
              value={texto}
              onChange={(e) => setEditado(e.target.value)}
              rows={12}
              spellCheck={false}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 font-mono bg-white focus:border-black focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-2">
              {tocado
                ? "Estás editando la copia que vas a pegar. El perfil de la requisición no cambia; «Copiar» se lleva lo que ves acá."
                : "Sale del perfil que armaste en la requisición. Podés ajustarlo acá antes de copiarlo — el cambio aplica a esta copia, no al perfil."}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 leading-relaxed">
            <strong className="text-gray-900">Por qué esto no publica solo.</strong>{" "}
            LinkedIn permite publicar por API, pero exige el producto Job Posting de
            Talent Solutions, que se aprueba comercialmente — hay que pedírselo al
            account manager. Turpial y Magneto no tienen integración construida. Un
            botón que dijera «Publicar» sin publicar sería peor que no tenerlo.
          </div>
        </div>
      </div>
    </div>
  );
}
