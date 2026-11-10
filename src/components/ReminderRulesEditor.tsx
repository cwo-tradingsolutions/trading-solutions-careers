"use client";

/**
 * ReminderRulesEditor — pantalla admin para editar las reglas de recordatorios
 * sin tocar SQL. Permite editar:
 *   - Templates (subject, email_body, whatsapp) por iteración (1/2/3) × idioma (es/en)
 *   - reminder_days (array de números, ej [3,5,7])
 *   - max_iterations
 *   - on_exhausted_action (mark_paused | mark_rejected | noop)
 *   - active (toggle on/off de toda la regla)
 *
 * Variables disponibles en templates: {firstName} {vacancy} {prefilter_url} {assessment_url}
 */
import { useEffect, useState } from "react";
import { Save, AlertCircle, Languages, Calendar, RefreshCcw } from "lucide-react";

type Template = { email_subject?: string; email_body?: string; whatsapp?: string };
type Rule = {
  id: string;
  scenario_key: string;
  scenario_label: string;
  stage_codes: string[];
  active: boolean;
  reminder_days: number[];
  max_iterations: number;
  templates: Record<string, Record<"es" | "en", Template>>;
  on_exhausted_action: "mark_paused" | "mark_rejected" | "noop";
};

/** Auto-rechazo OFF hasta GO de Kelly. La UI muestra pausa y pide Guardar. */
function sinAutoRechazo(rule: Rule): { rule: Rule; coerced: boolean } {
  if (rule.on_exhausted_action !== "mark_rejected") return { rule, coerced: false };
  return { rule: { ...rule, on_exhausted_action: "mark_paused" }, coerced: true };
}

const AVISO_AUTO_RECHAZO =
  "Esta regla tenía «marcar como rechazado». Quedó en pausar: Guardar para persistirlo. El auto-rechazo está apagado hasta GO de Kelly.";

export default function ReminderRulesEditor() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeIter, setActiveIter] = useState<"1" | "2" | "3">("1");
  const [activeLang, setActiveLang] = useState<"es" | "en">("es");
  const [draft, setDraft] = useState<Rule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/reminder-rules");
      const j = await r.json();
      const raw = (j.rules || []) as Rule[];
      setRules(raw);
      if (raw.length > 0 && !activeId) {
        const { rule, coerced } = sinAutoRechazo(JSON.parse(JSON.stringify(raw[0])));
        setActiveId(rule.id);
        setDraft(rule);
        if (coerced) setError(AVISO_AUTO_RECHAZO);
      }
    } catch (e: any) {
      setError(e?.message || "Error cargando reglas");
    } finally {
      setLoading(false);
    }
  }

  function pickRule(id: string) {
    const r = rules.find(x => x.id === id);
    if (!r) return;
    const { rule, coerced } = sinAutoRechazo(JSON.parse(JSON.stringify(r)));
    setActiveId(id);
    setDraft(rule);
    setFeedback(null);
    setError(coerced ? AVISO_AUTO_RECHAZO : null);
  }

  function updateTemplate(field: keyof Template, value: string) {
    if (!draft) return;
    const copy = JSON.parse(JSON.stringify(draft)) as Rule;
    if (!copy.templates[activeIter]) copy.templates[activeIter] = { es: {}, en: {} } as any;
    if (!copy.templates[activeIter][activeLang]) copy.templates[activeIter][activeLang] = {};
    copy.templates[activeIter][activeLang][field] = value;
    setDraft(copy);
  }

  function updateField<K extends keyof Rule>(field: K, value: Rule[K]) {
    if (!draft) return;
    setDraft({ ...draft, [field]: value });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/reminder-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          templates: draft.templates,
          reminder_days: draft.reminder_days,
          max_iterations: draft.max_iterations,
          active: draft.active,
          on_exhausted_action: draft.on_exhausted_action,
          scenario_label: draft.scenario_label,
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error || "Error al guardar");
      } else {
        setFeedback(j.warning ? `Guardado · ${j.warning}` : "Guardado · cambios aplicados");
        const saved = (j.rule || draft) as Rule;
        setDraft(saved);
        setRules(rules.map(x => (x.id === draft.id ? saved : x)));
        setTimeout(() => setFeedback(null), 4000);
      }
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setSaving(false);
    }
  }

  const currentTemplate = draft?.templates?.[activeIter]?.[activeLang] || {};

  return (
    <div className="bg-white border border-[var(--ts-gray-10)] p-6">
      <div className="mb-5 pb-4 border-b border-[var(--ts-gray-10)]">
        <div className="ts-eyebrow text-[var(--ts-black)]">Recordatorios automáticos</div>
        <h2 className="text-[24px] font-extrabold mt-1" style={{ letterSpacing: "-0.02em" }}>
          Editar templates y cadencia
        </h2>
        <p className="text-[12px] text-[var(--ts-gray-60)] mt-1">
          Variables disponibles: <code className="bg-[var(--ts-gray-04,#f7f7f7)] px-1.5 py-0.5 text-[11px]">{"{firstName}"}</code> · <code className="bg-[var(--ts-gray-04,#f7f7f7)] px-1.5 py-0.5 text-[11px]">{"{vacancy}"}</code> · <code className="bg-[var(--ts-gray-04,#f7f7f7)] px-1.5 py-0.5 text-[11px]">{"{prefilter_url}"}</code> · <code className="bg-[var(--ts-gray-04,#f7f7f7)] px-1.5 py-0.5 text-[11px]">{"{assessment_url}"}</code>
        </p>
      </div>

      {loading && <div className="text-[13px] text-[var(--ts-gray-60)]">Cargando…</div>}

      {!loading && rules.length === 0 && (
        <div className="text-[13px] text-[var(--ts-gray-60)]">Sin reglas. Verificá que la migración 20260507_reminders.sql esté corrida.</div>
      )}

      {!loading && draft && (
        <div className="grid grid-cols-[260px_1fr] gap-6">
          {/* Sidebar · escenarios */}
          <div className="space-y-1.5">
            <div className="ts-eyebrow text-[var(--ts-gray-60)] mb-2">Escenarios</div>
            {rules.map(r => (
              <button
                key={r.id}
                onClick={() => pickRule(r.id)}
                className={`w-full text-left p-3 border transition-all ${activeId === r.id ? "border-[var(--ts-black)] bg-[var(--ts-black)] text-white" : "border-[var(--ts-gray-10)] hover:border-[var(--ts-gray-40)] text-[var(--ts-black)]"}`}
              >
                <div className="text-[13px] font-bold">{r.scenario_label}</div>
                <div className={`text-[10px] uppercase tracking-[1px] mt-0.5 ${activeId === r.id ? "text-white/70" : "text-[var(--ts-gray-60)]"}`}>
                  {r.stage_codes.slice(0, 2).join(" · ")}{r.stage_codes.length > 2 ? "…" : ""}
                </div>
                <div className={`text-[10px] mt-1 ${activeId === r.id ? "text-white/70" : (r.active ? "text-[var(--ts-green)]" : "text-[var(--ts-gray-40)]")}`}>
                  {r.active ? "● activa" : "○ pausada"}
                </div>
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="space-y-5">
            {/* Cadencia */}
            <div className="bg-[var(--ts-gray-04,#fafafa)] border border-[var(--ts-gray-10)] p-4 grid grid-cols-3 gap-4">
              <div>
                <label className="ts-eyebrow text-[var(--ts-gray-60)] flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Días de cada iteración
                </label>
                <input
                  type="text"
                  value={draft.reminder_days.join(", ")}
                  onChange={e => {
                    const arr = e.target.value
                      .split(",")
                      .map(s => parseInt(s.trim(), 10))
                      .filter(n => !isNaN(n) && n >= 0);
                    updateField("reminder_days", arr);
                  }}
                  className="mt-1.5 w-full border border-[var(--ts-gray-10)] focus:border-[var(--ts-black)] px-3 py-2 text-[13px] outline-none ts-tabular"
                  placeholder="3, 5, 7"
                />
                <div className="text-[10px] text-[var(--ts-gray-60)] mt-1">
                  Ej: 3, 5, 7 · 1ra a los 3d, 2da a los 5d, 3ra a los 7d
                </div>
              </div>
              <div>
                <label className="ts-eyebrow text-[var(--ts-gray-60)] flex items-center gap-1.5">
                  <RefreshCcw className="w-3 h-3" />
                  Si no responde tras max iteraciones
                </label>
                <select
                  value={draft.on_exhausted_action}
                  onChange={e => updateField("on_exhausted_action", e.target.value as any)}
                  className="mt-1.5 w-full border border-[var(--ts-gray-10)] focus:border-[var(--ts-black)] px-3 py-2 text-[13px] outline-none cursor-pointer"
                >
                  <option value="mark_paused">Pausar · re-engage manual</option>
                  <option value="noop">No hacer nada</option>
                </select>
              </div>
              <div>
                <label className="ts-eyebrow text-[var(--ts-gray-60)]">Estado</label>
                <button
                  onClick={() => updateField("active", !draft.active)}
                  className={`mt-1.5 w-full px-3 py-2 text-[13px] font-bold tracking-[0.5px] uppercase border ${draft.active ? "bg-[var(--ts-green)] text-white border-[var(--ts-green)]" : "bg-white text-[var(--ts-gray-60)] border-[var(--ts-gray-10)]"}`}
                >
                  {draft.active ? "Activa" : "Pausada"}
                </button>
              </div>
            </div>

            {/* Tabs iteración + idioma */}
            <div className="flex items-center justify-between border-b border-[var(--ts-gray-10)]">
              <div className="flex">
                {(["1", "2", "3"] as const).map(it => (
                  <button
                    key={it}
                    onClick={() => setActiveIter(it)}
                    className={`px-4 py-2.5 text-[12px] font-bold uppercase tracking-[1.5px] border-b-2 ${activeIter === it ? "border-[var(--ts-black)] text-[var(--ts-black)]" : "border-transparent text-[var(--ts-gray-60)] hover:text-[var(--ts-black)]"}`}
                  >
                    Iteración {it}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 pb-2">
                <Languages className="w-3.5 h-3.5 text-[var(--ts-gray-60)] mr-1" />
                {(["es", "en"] as const).map(lang => (
                  <button
                    key={lang}
                    onClick={() => setActiveLang(lang)}
                    className={`text-[10px] uppercase tracking-[1.5px] px-2 py-1 ${activeLang === lang ? "bg-[var(--ts-black)] text-white" : "text-[var(--ts-gray-60)] hover:text-[var(--ts-black)]"}`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            {/* Editor de template */}
            <div className="space-y-4">
              <div>
                <label className="ts-eyebrow text-[var(--ts-black)]">Subject (email)</label>
                <input
                  type="text"
                  value={currentTemplate.email_subject || ""}
                  onChange={e => updateTemplate("email_subject", e.target.value)}
                  className="mt-1.5 w-full border border-[var(--ts-gray-10)] focus:border-[var(--ts-black)] px-3 py-2 text-[13px] outline-none"
                  placeholder="Trading Solutions · Recordatorio para {firstName}"
                />
              </div>

              <div>
                <label className="ts-eyebrow text-[var(--ts-black)]">Cuerpo (email)</label>
                <textarea
                  value={currentTemplate.email_body || ""}
                  onChange={e => updateTemplate("email_body", e.target.value)}
                  rows={10}
                  className="mt-1.5 w-full border border-[var(--ts-gray-10)] focus:border-[var(--ts-black)] px-3 py-2 text-[13px] leading-relaxed outline-none font-mono"
                  placeholder="Hola {firstName}, vi que aún no has..."
                />
              </div>

              <div>
                <label className="ts-eyebrow text-[var(--ts-black)]">WhatsApp (opcional · short)</label>
                <textarea
                  value={currentTemplate.whatsapp || ""}
                  onChange={e => updateTemplate("whatsapp", e.target.value)}
                  rows={4}
                  className="mt-1.5 w-full border border-[var(--ts-gray-10)] focus:border-[var(--ts-black)] px-3 py-2 text-[13px] leading-relaxed outline-none"
                  placeholder="Hola {firstName}! Recordá que tenés tu prefiltro..."
                />
              </div>
            </div>

            {/* Save bar */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--ts-gray-10)]">
              <div className="text-[12px]">
                {feedback && <span className="text-[var(--ts-green)] font-semibold">✓ {feedback}</span>}
                {error && (
                  <span className="text-[var(--ts-red)] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> {error}
                  </span>
                )}
              </div>
              <button
                onClick={save}
                disabled={saving}
                className="text-[12px] font-bold uppercase tracking-[0.5px] px-6 py-3 bg-[var(--ts-black)] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
