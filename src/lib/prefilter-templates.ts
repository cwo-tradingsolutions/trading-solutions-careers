/**
 * Prefilter form templates por tipo de vacante.
 *
 * Cada template define qué secciones mostrar y qué preguntas adicionales
 * pedir. Las secciones comunes (info personal, disponibilidad, inglés,
 * sobre ti) van en todos. Las específicas (comex/sales · HR · finance)
 * varían.
 *
 * El backend (`/api/headhunting/prefilter/[token]/route.ts`) usa el mismo
 * archivo para validar qué campos son obligatorios según template.
 */

export type TemplateKey = "comex" | "hr_lead" | "finance" | "tech" | "china" | "panama_ops" | "sig_sst" | "customer_doc";

export type SectionKey =
  | "personal"           // todos
  | "availability"       // todos
  | "english"            // todos
  | "education"          // varía por template
  | "comex_experience"   // solo comex
  | "sales_pricing"      // solo comex
  | "hr_experience"      // solo hr_lead
  | "finance_experience" // solo finance
  | "china_core"         // solo china · form en inglés, innegociables
  | "panama_core"        // solo panama_ops · form EN, knock-outs y alertas
  | "sig_experience"     // solo sig_sst · licencia, cursos, auditorías
  | "doc_experience"     // solo customer_doc · documentos, conciliación, plataformas
  | "doc_case"           // solo customer_doc · el caso de la diferencia de peso
  | "about_you";         // todos

export type PrefilterTemplate = {
  key: TemplateKey;
  label: string;
  description: string;
  sections: SectionKey[];
};

export const PREFILTER_TEMPLATES: Record<TemplateKey, PrefilterTemplate> = {
  comex: {
    key: "comex",
    label: "Comercio exterior · ventas · pricing",
    description: "Para Pricing Junior, Pricing Senior e Inside Sales. Customer Documentation tiene el suyo.",
    sections: ["personal", "availability", "english", "education", "comex_experience", "sales_pricing", "about_you"],
  },
  hr_lead: {
    key: "hr_lead",
    label: "Liderazgo HR · talent acquisition · learning",
    description: "Para Talent Acquisition Specialist, Talent Acquisition Lead, T&D Lead, HR Manager",
    sections: ["personal", "availability", "english", "education", "hr_experience", "about_you"],
  },
  finance: {
    key: "finance",
    label: "Finanzas · contabilidad · accounting",
    description: "Para Lead Accounting Finance Officer, Controller, FP&A",
    sections: ["personal", "availability", "english", "education", "finance_experience", "about_you"],
  },
  tech: {
    key: "tech",
    label: "Tecnología · ingeniería · data",
    description: "Para roles técnicos · default si no hay otro template",
    sections: ["personal", "availability", "english", "education", "about_you"],
  },
  sig_sst: {
    key: "sig_sst",
    label: "SIG · SST · HSEQ (credenciales verificables)",
    description: "Para Especialista SIG-SST y cargos de sistemas de gestión. Pide licencia vigente, cursos de ley, certificaciones de auditor y años liderando el sistema. Incluye una pregunta abierta de criterio que es el mejor discriminante del perfil.",
    sections: ["personal", "availability", "english", "education", "sig_experience", "about_you"],
  },
  customer_doc: {
    key: "customer_doc",
    label: "Customer Documentation · comex documental",
    description:
      "Para Customer Documentation y cargos de gestión documental de comercio exterior. Pregunta por los documentos que la persona ha trabajado de verdad, por la conciliación de facturas contra órdenes —que es lo que hace el cargo todos los días— y cierra con un caso de una diferencia de peso con el embarque encima.",
    sections: ["personal", "availability", "english", "education", "doc_experience", "doc_case", "about_you"],
  },
  china: {
    key: "china",
    label: "China Builder Team (EN · knock-outs only)",
    description: "Para vacantes de China · formulario en inglés, corto, solo innegociables. Salario en USD es dato, no descarta. Consentimiento PIPL en vez de habeas data colombiano.",
    sections: ["china_core", "about_you"],
  },
  panama_ops: {
    key: "panama_ops",
    label: "Panama Operations (EN)",
    description:
      "Operations Specialist en Panamá. Formulario y correos al candidato en inglés. Knock-outs: autorización de trabajo, presencial en Ciudad de Panamá, inglés B1. No pregunta salario. Menos de 4 años de freight, sin ocean/air/BL/FTZ, o inicio en más de 30 días quedan en revisión.",
    sections: ["panama_core", "about_you"],
  },
};

export function getTemplate(key: string | null | undefined): PrefilterTemplate {
  if (!key) return PREFILTER_TEMPLATES.comex;
  return PREFILTER_TEMPLATES[key as TemplateKey] || PREFILTER_TEMPLATES.comex;
}

/**
 * Campos obligatorios por template · usado en el backend para validar
 * que el payload tiene lo mínimo según el tipo de rol.
 */
export const TEMPLATE_REQUIRED_FIELDS: Record<TemplateKey, string[]> = {
  comex: [
    "doc_type", "doc_number", "phone", "city",
    "salary", "availability", "relocate",
    "english_level", "edu_type",
    "years_logistics", "intl_clients", "excel_level",
    "years_sales", "pricing_exp", "leadership",
    "why_ts",
  ],
  hr_lead: [
    "doc_type", "doc_number", "phone", "city",
    "salary", "availability", "relocate",
    "english_level", "edu_type",
    "years_hr", "ats_tools_used", "team_size_led",
    // Requisitos duros del perfil de Talent Acquisition Specialist que el
    // formulario no preguntaba: sin esto el prefiltro dejaba pasar a quien
    // nunca aplicó una prueba psicométrica ni entrevistó por competencias.
    "psychometrics_years", "bei_certified",
    "why_ts",
  ],
  finance: [
    "doc_type", "doc_number", "phone", "city",
    "salary", "availability", "relocate",
    "english_level", "edu_type",
    "years_finance", "accounting_systems", "ifrs_familiar",
    "why_ts",
  ],
  tech: [
    "doc_type", "doc_number", "phone", "city",
    "salary", "availability", "relocate",
    "english_level", "edu_type",
    "why_ts",
  ],
  // SIG-SST · las credenciales son el filtro. Sin licencia vigente el cargo no
  // se puede ejercer, así que license_status es knock-out duro. course_50h
  // tambien es de ley. El resto son datos que ordenan la terna.
  sig_sst: [
    "doc_type", "doc_number", "phone", "city",
    "salary", "availability", "relocate",
    "english_level", "edu_type",
    "license_status", "course_50h", "course_20h", "postgrad_sig",
    "auditor_certs", "systems_managed",
    "years_sig", "years_leading_sig", "cert_audit_cycles",
    "excel_level", "case_answer",
    "why_ts",
  ],
  // China · form en inglés. NO pide doc_type/doc_number/nacionalidad. Salario
  // (salary_usd) es dato, no descarta. Knock-outs: work_authorized, english_level
  // (>=B2), onsite_available. Consentimiento PIPL obligatorio.
  // Customer Documentation · lo innegociable es la experiencia documental en
  // comercio exterior y haber conciliado facturas contra órdenes. El resto
  // (plataformas, cursos, tipo de empresa) ordena la terna y no bloquea.
  customer_doc: [
    "doc_type", "doc_number", "phone", "city",
    "salary", "availability", "relocate",
    "english_level", "edu_type",
    "years_doc_comex", "docs_handled", "invoice_reconciliation",
    "difference_story", "case_choice", "case_why",
    "why_ts",
  ],
  china: [
    "full_name", "email", "phone_wechat", "current_city",
    "work_authorized", "english_level", "english_cert",
    "years_experience", "onsite_available", "salary_usd",
    "tariff_choice", "pipl_consent",
  ],
  // No salary_usd. New answers leave that key null; old JSON values stay.
  panama_ops: [
    "full_name", "email", "phone", "current_city",
    "work_authorized_panama", "onsite_panama_city",
    "years_freight_panama", "ocean_fcl_lcl", "air_freight",
    "bl_awb_docs", "warehouse_ftz", "english_level",
    "start_within_30_days", "why_ts", "privacy_consent",
  ],
};

/**
 * Inglés mínimo y tope salarial por TEMPLATE.
 *
 * POR QUÉ POR TEMPLATE Y NO POR VACANTE
 * La configuración vivía pegada al id de la vacante. Cuando un cargo existe
 * dos veces en la base —y ya pasó con SIG-SST y con FullStack— la excepción
 * queda escrita en el registro gemelo y nunca se aplica a nadie: entre el 7 y
 * el 24 de septiembre seis personas se rechazaron por un inglés que ya se
 * había decidido que no descalificaba. Atado al template, un cargo nuevo nace
 * bien configurado y un duplicado hereda la misma regla.
 *
 * El override por vacante sigue existiendo y manda sobre esto, para los casos
 * en que una vacante concreta sí pide algo distinto.
 */
export const TEMPLATE_ENGLISH_MIN_RANK: Partial<Record<TemplateKey, number>> = {
  // Customer Documentation lee documentos en inglés; no negocia en inglés.
  // A2 alcanza (rank 2). Y como nada descarta solo, esto apenas marca.
  customer_doc: 2,
  // Panama Ops · B1. Below that is a hard knock-out (ingles_a1_a2).
  panama_ops: 3,
};

/** Tope de la banda en COP. Sobre esto se marca, nunca se rechaza. */
export const TEMPLATE_SALARY_CAP: Partial<Record<TemplateKey, number>> = {
  customer_doc: 3_500_000,
};

/**
 * Tope mensual USD (bruto) por template EN. Sobre esto se marca review;
 * nunca auto-rechaza. El path china/panama_ops usa estas constantes en la
 * ruta de prefiltro (no TEMPLATE_SALARY_CAP, que es COP).
 */
export const TEMPLATE_SALARY_CAP_USD: Partial<Record<TemplateKey, number>> = {
  panama_ops: 1500,
};
