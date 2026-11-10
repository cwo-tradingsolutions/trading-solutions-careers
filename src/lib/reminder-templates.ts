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

// WhatsApp speaks as the team writing. PT templates are not in the seed;
// the equivalent line is "A Talent Acquisition Team da Trading Solutions escreve para você."
const TEAM_VOICE: [string, string][] = [
  ["Kelly Castañeda · Trading Solutions", "Talent Acquisition Team · Trading Solutions"],
  ["Soy Kelly de Trading Solutions", "Te escribe el Talent Acquisition Team de Trading Solutions"],
  ["soy Kelly de Trading Solutions", "te escribe el Talent Acquisition Team de Trading Solutions"],
  // Reminder 1 WhatsApp: the greeting is third person, the rest stays "nosotros".
  ["Te escribo para recordarte", "Te escribimos para recordarte"],
  ["Cualquier duda me cuentas", "Cualquier duda nos cuentas"],
  ["This is Kelly from Trading Solutions", "The Talent Acquisition Team at Trading Solutions is writing to you"],
  ["this is Kelly from Trading Solutions", "the Talent Acquisition Team at Trading Solutions is writing to you"],
  ["soy Kelly.", "te escribe el Talent Acquisition Team de Trading Solutions."],
  ["this is Kelly.", "the Talent Acquisition Team at Trading Solutions is writing to you."],
];

/**
 * The candidate is always tú. The team speaks as "nosotros", not as one
 * person ("te escribo", "escríbeme", "quedo atenta") and not as usted,
 * ustedes, or vos.
 */
const TEAM_TU: [string, string][] = [
  ["Vuelvo a escribirte porque sigues en mi radar", "Volvemos a escribirte porque sigues en nuestro radar"],
  ["vuelvo a escribirte de Trading Solutions", "volvemos a escribirte de Trading Solutions"],
  ["en lo que pueda ayudarte para avanzar, escríbeme. Estoy aquí.", "en lo que podamos ayudarte para avanzar, escríbenos. Estamos aquí."],
  ["Si hay algo en el contenido o en tu agenda que está dificultando, cuéntame y vemos cómo destrabamos.", "Si hay algo en el contenido o en tu agenda que está dificultando, cuéntanos y vemos cómo destrabamos."],
  ["Si necesitas más tiempo o tienes alguna pregunta antes de continuar, respóndeme y resolvemos juntos.", "Si necesitas más tiempo o tienes alguna pregunta antes de continuar, respóndenos y resolvemos juntos."],
  ["Si decidiste no seguir, solo confírmame por aquí.", "Si decidiste no seguir, solo confírmanos por aquí."],
  ["Solo quería asegurarme", "Solo queríamos asegurarnos"],
  ["estoy disponible cuando quieras", "estamos disponibles cuando quieras"],
  ["Quedo atenta,", "Quedamos atentos,"],
  ["Quería confirmar", "Queríamos confirmar"],
  ["quería confirmar", "queríamos confirmar"],
  ["Quería saber", "Queríamos saber"],
  ["quería saber", "queríamos saber"],
  ["Te escribo desde", "Te escribimos desde"],
  ["Te escribo para recordarte", "Te escribimos para recordarte"],
  ["Te escribo para avanzar", "Te escribimos para avanzar"],
  ["Cualquier duda me cuentas", "Cualquier duda nos cuentas"],
  ["escríbeme y vemos", "escríbenos y vemos"],
  ["solo escríbeme", "solo escríbenos"],
  ["escríbeme respondiendo", "escríbenos respondiendo"],
  ["escríbeme.", "escríbenos."],
  ["¿Hay algo en lo que pueda ayudarte?", "¿Hay algo en lo que podamos ayudarte?"],
  ["Te recuerdo", "Te recordamos"],
  ["anything I can help with to move forward, just write. I'm here.", "anything we can help with to move forward, just write. We're here."],
  ["you're still on my radar", "you're still on our radar"],
  ["I'm available whenever you'd like to talk.", "We're available whenever you'd like to talk."],
  ["Let me know if you have any questions.", "Let us know if you have any questions."],
  ["let me know and we'll figure it out.", "let us know and we'll figure it out."],
  ["just message me back", "just message us back"],
  ["Anything I can help with?", "Anything we can help with?"],
  ["Just wanted to make sure you received", "We just wanted to make sure you received"],
  ["Wanted to confirm you received", "We wanted to confirm you received"],
  ["Happy to address any question", "We're happy to address any question"],
  ["Wanted to check if you ran into", "We wanted to check if you ran into"],
  [", wanted to check if you had a chance", ", we wanted to check if you had a chance"],
];

/** Firma y saludo del equipo, aunque la fila en la base todavía diga Kelly. */
export function teamReminderVoice(text: string): string {
  const signed = TEAM_VOICE.reduce((out, [from, to]) => out.split(from).join(to), text);
  return TEAM_TU.reduce((out, [from, to]) => out.split(from).join(to), signed);
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
