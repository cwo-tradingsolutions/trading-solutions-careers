"use client";

/**
 * RejectionModal — wizard para rechazar un candidato con clasificación obligatoria.
 *
 * Flujo:
 *   1. Selecciona categoría (7 opciones · radio cards)
 *   2. Selecciona sub-detalle de esa categoría (radio list)
 *   3. Edita la nota PÚBLICA (lo que va al candidato · pre-llenado con template)
 *      + nota PRIVADA (interna, solo equipo TS)
 *   4. Toggle save_for_future (default ON · respeta la política CV Bank)
 *   5. Toggle create_rejection_draft (default ON · crea el draft de Gmail)
 *
 * Llama a POST /api/admin/candidates/:id/reject-with-reason cuando confirma.
 *
 * Con `bulk` rechaza a varios con el mismo motivo: el mensaje se escribe una
 * vez con {firstName} y {vacancy} y se personaliza por candidato al enviar.
 * El rechazo masivo pasaba directo por el cambio de etapa, sin motivo ni
 * clasificación; por eso ahora usa este mismo modal.
 */
import { useEffect, useState } from "react";
import { X, AlertTriangle, BookmarkCheck, Mail } from "lucide-react";
import { REJECTION_BODY, type RejectionLang } from "@/lib/rejection-email";

type SubDetail = { key: string; label: string };
type Category = {
  category_key: string;
  category_label: string;
  description: string;
  sub_details: SubDetail[];
  public_message_template: string;
  display_order: number;
};

type Props = {
  candidateId: string;
  candidateName: string;
  vacancyTitle: string;
  onClose: () => void;
  onRejected?: () => void;
  bulk?: Array<{ id: string; name: string; vacancyTitle: string }>;
  lang?: RejectionLang;
};

export default function RejectionModal({ candidateId, candidateName, vacancyTitle, onClose, onRejected, bulk, lang = "es" }: Props) {
  const esLote = !!bulk && bulk.length > 1;
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubDetail, setSelectedSubDetail] = useState<string>("");
  const [notePrivate, setNotePrivate] = useState("");
  const [notePublic, setNotePublic] = useState("");
  const [saveForFuture, setSaveForFuture] = useState(true);
  const [createDraft, setCreateDraft] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);

  const firstName = (candidateName || "").split(" ")[0] || "candidato";

  useEffect(() => {
    fetch("/api/admin/rejection-categories")
      .then(r => r.json())
      .then(j => {
        setCategories(j.categories || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function pickCategory(cat: Category) {
    setSelectedCategory(cat);
    setSelectedSubDetail("");
    // Pre-rellenar nota pública con el mensaje genérico · mismo para todas las
    // categorías. Kelly nunca explica el motivo al candidato (a menos que él
    // llame y pida feedback en vivo).
    const template = REJECTION_BODY[lang];
    const rendered = esLote
      ? template
      : template
          .replace(/\{firstName\}/g, firstName)
          .replace(/\{vacancy\}/g, vacancyTitle);
    setNotePublic(rendered);
    setStep(2);
  }

  function pickSubDetail(key: string) {
    setSelectedSubDetail(key);
    setStep(3);
  }

  async function submit() {
    if (!selectedCategory || !selectedSubDetail) return;
    setSubmitting(true);
    setError(null);

    const objetivos = bulk && bulk.length ? bulk : [{ id: candidateId, name: candidateName, vacancyTitle }];
    const fallos: string[] = [];
    for (let i = 0; i < objetivos.length; i++) {
      const c = objetivos[i];
      setProgreso(objetivos.length > 1 ? `${i + 1} de ${objetivos.length}` : null);
      const nota = notePublic.trim()
        .replace(/\{firstName\}/g, (c.name || "").split(" ")[0] || "candidato")
        .replace(/\{vacancy\}/g, c.vacancyTitle);
      try {
        const res = await fetch(`/api/admin/candidates/${c.id}/reject-with-reason`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category_key: selectedCategory.category_key,
            sub_detail_key: selectedSubDetail,
            note_private: notePrivate.trim() || null,
            note_public: nota || null,
            save_for_future: saveForFuture,
            create_rejection_draft: createDraft,
          }),
        });
        const j = await res.json();
        if (!j.success) fallos.push(`${c.name}: ${j.error || "Error al rechazar"}`);
      } catch (e: any) {
        fallos.push(`${c.name}: ${e?.message || "Error de red"}`);
      }
    }
    setProgreso(null);
    if (fallos.length) {
      setError(fallos.join(" · "));
      setSubmitting(false);
      return;
    }
    onRejected?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="bg-white w-[640px] max-h-[90vh] overflow-hidden flex flex-col border border-[var(--ts-gray-10)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--ts-gray-10)] flex items-start justify-between">
          <div>
            <div className="ts-eyebrow text-[var(--ts-red)]">{esLote ? "Rechazar candidatos" : "Rechazar candidato"}</div>
            <h2 className="text-[22px] font-extrabold mt-1" style={{ letterSpacing: "-0.02em" }}>
              {esLote ? `${bulk!.length} candidatos` : candidateName}
            </h2>
            <p className="text-[12px] text-[var(--ts-gray-60)] mt-0.5">
              {esLote ? bulk!.map((c) => c.name).join(", ") : vacancyTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--ts-gray-40)] hover:text-[var(--ts-black)] w-8 h-8 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b border-[var(--ts-gray-10)] flex items-center gap-2 text-[10px] font-bold tracking-[1.5px] uppercase text-[var(--ts-gray-60)]">
          <span className={step >= 1 ? "text-[var(--ts-black)]" : ""}>1 · Motivo</span>
          <span>›</span>
          <span className={step >= 2 ? "text-[var(--ts-black)]" : ""}>2 · Detalle</span>
          <span>›</span>
          <span className={step >= 3 ? "text-[var(--ts-black)]" : ""}>3 · Mensaje + flags</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && <div className="text-[12px] text-[var(--ts-gray-60)]">Cargando catálogo…</div>}

          {/* STEP 1 · Categorías */}
          {!loading && step === 1 && (
            <div className="space-y-2">
              <p className="text-[12px] text-[var(--ts-gray-60)] mb-3">
                Elegí la categoría que mejor describe por qué cerramos este proceso. La clasificación nos
                permite reportar tendencias y reactivar perfiles cuando se abra una posición que les calce.
              </p>
              {categories.map(cat => (
                <button
                  key={cat.category_key}
                  onClick={() => pickCategory(cat)}
                  className="w-full text-left bg-white border border-[var(--ts-gray-10)] hover:border-[var(--ts-black)] p-4 transition-all"
                >
                  <div className="text-[14px] font-bold text-[var(--ts-black)]">{cat.category_label}</div>
                  <div className="text-[12px] text-[var(--ts-gray-60)] mt-1">{cat.description}</div>
                </button>
              ))}
            </div>
          )}

          {/* STEP 2 · Sub-detalle */}
          {!loading && step === 2 && selectedCategory && (
            <div className="space-y-3">
              <button
                onClick={() => setStep(1)}
                className="text-[11px] font-semibold text-[var(--ts-gray-60)] hover:text-[var(--ts-black)]"
              >
                ← Cambiar categoría
              </button>
              <div className="bg-[var(--ts-gray-04,#f7f7f7)] border border-[var(--ts-gray-10)] p-3">
                <div className="ts-eyebrow text-[var(--ts-gray-60)]">Categoría</div>
                <div className="text-[14px] font-bold mt-0.5">{selectedCategory.category_label}</div>
              </div>
              <p className="text-[12px] text-[var(--ts-gray-60)]">¿Qué afina mejor el motivo?</p>
              <div className="space-y-1.5">
                {selectedCategory.sub_details.map(sd => (
                  <button
                    key={sd.key}
                    onClick={() => pickSubDetail(sd.key)}
                    className="w-full text-left bg-white border border-[var(--ts-gray-10)] hover:border-[var(--ts-black)] px-4 py-2.5 text-[13px] transition-all"
                  >
                    {sd.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3 · Mensajes + flags */}
          {!loading && step === 3 && selectedCategory && (
            <div className="space-y-5">
              <button
                onClick={() => setStep(2)}
                className="text-[11px] font-semibold text-[var(--ts-gray-60)] hover:text-[var(--ts-black)]"
              >
                ← Cambiar detalle
              </button>

              <div className="bg-[var(--ts-gray-04,#f7f7f7)] border border-[var(--ts-gray-10)] p-3 grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <div className="ts-eyebrow text-[var(--ts-gray-60)]">Categoría</div>
                  <div className="font-semibold mt-0.5">{selectedCategory.category_label}</div>
                </div>
                <div>
                  <div className="ts-eyebrow text-[var(--ts-gray-60)]">Detalle</div>
                  <div className="font-semibold mt-0.5">
                    {selectedCategory.sub_details.find(sd => sd.key === selectedSubDetail)?.label || selectedSubDetail}
                  </div>
                </div>
              </div>

              <div>
                <label className="ts-eyebrow text-[var(--ts-black)] flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3" />
                  Nota privada · solo equipo TS
                </label>
                <textarea
                  value={notePrivate}
                  onChange={e => setNotePrivate(e.target.value)}
                  placeholder="Contexto interno · ej: 'gap muy grande en años de pricing, podríamos rescatarlo para Sales en 2027'"
                  rows={3}
                  className="mt-2 w-full border border-[var(--ts-gray-10)] focus:border-[var(--ts-black)] px-3 py-2 text-[13px] outline-none"
                />
              </div>

              <div>
                <label className="ts-eyebrow text-[var(--ts-black)] flex items-center gap-2">
                  <Mail className="w-3 h-3" />
                  Mensaje al candidato · editá lo que sea necesario
                </label>
                <textarea
                  value={notePublic}
                  onChange={e => setNotePublic(e.target.value)}
                  rows={6}
                  className="mt-2 w-full border border-[var(--ts-gray-10)] focus:border-[var(--ts-black)] px-3 py-2 text-[13px] leading-relaxed outline-none"
                />
                <p className="text-[10px] text-[var(--ts-gray-60)] mt-1">
                  Mensaje genérico estándar · igual para todas las categorías. El detalle del motivo queda interno
                  (no se le explica al candidato a menos que llame).
                  {esLote && " {firstName} y {vacancy} se reemplazan por los de cada candidato."}
                </p>
              </div>

              <div className="space-y-2 border-t border-[var(--ts-gray-10)] pt-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveForFuture}
                    onChange={e => setSaveForFuture(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[var(--ts-black)]"
                  />
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold flex items-center gap-1.5">
                      <BookmarkCheck className="w-3.5 h-3.5" />
                      Guardar para futuro · CV Bank
                    </div>
                    <div className="text-[11px] text-[var(--ts-gray-60)] mt-0.5">
                      El AI rediscovery cruza este perfil con vacantes nuevas. Desactivá solo si no querés que vuelva
                      a aparecer (ej: red flag serio).
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createDraft}
                    onChange={e => setCreateDraft(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[var(--ts-black)]"
                  />
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" />
                      Crear draft de Gmail con el mensaje editado
                    </div>
                    <div className="text-[11px] text-[var(--ts-gray-60)] mt-0.5">
                      El draft queda en tu bandeja para revisar y enviar uno por uno. Desactivá si ya le contestaste por otro canal.
                    </div>
                  </div>
                </label>
              </div>

              {error && (
                <div className="border border-[var(--ts-red)] bg-[var(--ts-red-bg,#fff5f5)] text-[var(--ts-red)] text-[12px] px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 3 && (
          <div className="px-6 py-4 border-t border-[var(--ts-gray-10)] flex items-center justify-between bg-[var(--ts-gray-04,#fafafa)]">
            <button
              onClick={onClose}
              disabled={submitting}
              className="text-[12px] font-semibold text-[var(--ts-gray-60)] hover:text-[var(--ts-black)]"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="text-[12px] font-bold tracking-[0.5px] uppercase px-6 py-3 bg-[var(--ts-red)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? (progreso ? `Procesando ${progreso}…` : "Procesando…") : esLote ? `Rechazar ${bulk!.length}` : "Confirmar rechazo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
