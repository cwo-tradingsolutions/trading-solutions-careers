/**
 * Helper para renderizar templates de recordatorios.
 *
 * Carga las reglas/templates desde ts_reminder_rules (no hardcodeados)
 * para que Kelly pueda editarlos desde Settings UI sin redeploy.
 */
import { supabaseAdmin } from "./supabase";

export type ReminderChannel = "email" | "whatsapp" | "in_app";
export type Language = "es" | "en";

export type RenderedTemplate = {
  email_subject?: string;
  email_body?: string;
  whatsapp?: string;
};

export type ReminderRule = {
  id: string;
  scenario_key: string;
  scenario_label: string;
  stage_codes: string[];
  active: boolean;
  reminder_days: number[];
  max_iterations: number;
  templates: Record<string, Record<Language, RenderedTemplate>>;
  on_exhausted_action: "mark_paused" | "mark_rejected" | "noop";
};

/** Pull todas las reglas activas */
export async function getActiveReminderRules(): Promise<ReminderRule[]> {
  const { data, error } = await supabaseAdmin
    .from("ts_reminder_rules")
    .select("*")
    .eq("active", true);
  if (error) throw new Error(`reminder rules fetch failed: ${error.message}`);
  return (data || []) as ReminderRule[];
}

const TEAM_VOICE: [string, string][] = [
  ["Kelly Castañeda · Trading Solutions", "Talent Acquisition Team · Trading Solutions"],
  ["Soy Kelly de Trading Solutions", "Te escribimos del Talent Acquisition Team de Trading Solutions"],
  ["soy Kelly de Trading Solutions", "te escribimos del Talent Acquisition Team de Trading Solutions"],
  ["This is Kelly from Trading Solutions", "This is the Talent Acquisition Team at Trading Solutions"],
  ["this is Kelly from Trading Solutions", "this is the Talent Acquisition Team at Trading Solutions"],
  ["soy Kelly.", "te escribimos del Talent Acquisition Team."],
  ["this is Kelly.", "this is the Talent Acquisition Team."],
];

/** Firma y saludo del equipo, aunque la fila en la base todavía diga Kelly. */
export function teamReminderVoice(text: string): string {
  return TEAM_VOICE.reduce((out, [from, to]) => out.split(from).join(to), text);
}

/** Renderiza un template con variables del candidato/vacante */
export function renderTemplate(
  template: RenderedTemplate,
  vars: Record<string, string | undefined>
): RenderedTemplate {
  const replace = (s: string | undefined): string | undefined => {
    if (!s) return s;
    const filled = s.replace(/\{(\w+)\}/g, (_, key) => {
      const v = vars[key];
      return v !== undefined && v !== null ? String(v) : `{${key}}`;
    });
    return teamReminderVoice(filled);
  };
  return {
    email_subject: replace(template.email_subject),
    email_body: replace(template.email_body),
    whatsapp: replace(template.whatsapp),
  };
}

/** Determina iteración (1, 2, 3) según días en stage */
export function getIterationForDays(daysInStage: number, reminderDays: number[]): number | null {
  // reminder_days = [3, 5, 7] · si daysInStage >= 7 → iteration 3
  // si >= 5 y < 7 → 2; si >= 3 y < 5 → 1; si < 3 → null (no reminder aún)
  let iteration: number | null = null;
  for (let i = 0; i < reminderDays.length; i++) {
    if (daysInStage >= reminderDays[i]) iteration = i + 1;
  }
  return iteration;
}

/** Devuelve el idioma del candidato (default 'es') */
export function getLanguage(candidate: { preferred_language?: string | null }): Language {
  return (candidate.preferred_language === "en" ? "en" : "es") as Language;
}

/** Construye link wa.me con el mensaje pre-cargado · listo para click */
export function buildWhatsAppLink(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null;
  // Limpiar el número: quitar espacios, +, paréntesis, guiones
  const clean = phone.replace(/[\s+()\-]/g, "");
  // Si empieza con 57 o tiene >10 dígitos, asumir formato OK; si tiene 10 dígitos, prepend 57 (Colombia)
  const final = clean.length === 10 ? `57${clean}` : clean;
  if (!/^\d{10,15}$/.test(final)) return null;
  return `https://wa.me/${final}?text=${encodeURIComponent(message)}`;
}
