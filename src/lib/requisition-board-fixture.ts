/**
 * Datos de ejemplo para la pantalla de Requisiciones/Vacantes.
 * No son filas del ATS. Sirven para ver las tarjetas, los chips y el cruce.
 */

import type { FuenteLista } from "@/lib/recruitment-sources";
import { fuentesFallback } from "@/lib/recruitment-sources";
import type { RequisitionStatus } from "@/lib/requisitions";

export type RequisicionVista = {
  id: string;
  lead_email: string;
  lead_name: string | null;
  area: string | null;
  title: string;
  requisition_type: "reemplazo" | "incremental";
  reason: string | null;
  needed_by: string | null;
  lead_responsibilities: string | null;
  lead_must_haves: string | null;
  lead_profile: null;
  responsibilities: string | null;
  nice_to_have: string | null;
  location: string | null;
  work_mode: string | null;
  salary_public: string | null;
  hook_en: string | null;
  title_en: string | null;
  description_en: string | null;
  requirements_en: string | null;
  responsibilities_en: string | null;
  nice_to_have_en: string | null;
  web_vacancy_id: number | null;
  job_description: string | null;
  requirements: string | null;
  salary_cap_cop: number | null;
  form_template_key: string | null;
  english_required: boolean | null;
  status: RequisitionStatus;
  decision_note: string | null;
  approved_at: string | null;
  vacancy_id: string | null;
  vacancy_status: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  hidden_by: string | null;
  created_at: string;
  updated_at: string;
  dias_en_estado: number | null;
};

function base(partial: Partial<RequisicionVista> & Pick<RequisicionVista, "id" | "title" | "status">): RequisicionVista {
  return {
    lead_email: "persona@example.com",
    lead_name: "Persona de ejemplo",
    area: "Operaciones",
    requisition_type: "incremental",
    reason: "Ejemplo para la pantalla.",
    needed_by: null,
    lead_responsibilities: null,
    lead_must_haves: null,
    lead_profile: null,
    responsibilities: null,
    nice_to_have: null,
    location: "Bogotá",
    work_mode: "Híbrido",
    salary_public: null,
    hook_en: null,
    title_en: null,
    description_en: null,
    requirements_en: null,
    responsibilities_en: null,
    nice_to_have_en: null,
    web_vacancy_id: null,
    job_description: null,
    requirements: null,
    salary_cap_cop: null,
    form_template_key: null,
    english_required: false,
    decision_note: null,
    approved_at: null,
    vacancy_id: null,
    vacancy_status: null,
    hidden_at: null,
    hidden_reason: null,
    hidden_by: null,
    created_at: "2026-10-01T15:00:00.000Z",
    updated_at: "2026-10-20T15:00:00.000Z",
    dias_en_estado: 4,
    ...partial,
  };
}

export const FIXTURE_FUENTES: FuenteLista[] = fuentesFallback();

export const FIXTURE_REQUISICIONES: RequisicionVista[] = [
  base({
    id: "ej-abierta",
    title: "Cargo de muestra abierto",
    status: "publicada",
    vacancy_id: "vac-ops",
    vacancy_status: "open",
    web_vacancy_id: 20,
    approved_at: "2026-10-27T20:00:00.000Z",
  }),
  base({
    id: "ej-archivada",
    title: "Cargo de muestra archivado",
    status: "publicada",
    vacancy_id: "vac-docs",
    vacancy_status: "closed",
    web_vacancy_id: 14,
    area: "Customer Experience",
  }),
  base({
    id: "ej-cerrada",
    title: "Cargo de muestra rechazado",
    status: "rechazada",
    decision_note: "El cupo de este trimestre ya está usado.",
    hidden_at: null,
  }),
  base({
    id: "ej-oculta-duplicada",
    title: "Cargo de muestra duplicado",
    status: "rechazada",
    hidden_at: "2026-10-30T17:00:00.000Z",
    hidden_reason: "duplicada",
    hidden_by: "persona@example.com",
    decision_note: "Fila de ejemplo, marcada como duplicada.",
  }),
  base({
    id: "ej-oculta-fuera",
    title: "Cargo de muestra fuera del circuito",
    status: "pedida",
    hidden_at: "2026-10-30T17:00:00.000Z",
    hidden_reason: "fuera_del_ats",
    hidden_by: "persona@example.com",
    reason: "Fila de ejemplo, armada fuera del circuito.",
  }),
  base({
    id: "ej-pedida",
    title: "Cargo de muestra pedido",
    status: "pedida",
    dias_en_estado: 1,
  }),
];

export const FIXTURE_TABLERO = {
  fuentes: FIXTURE_FUENTES,
  desde: "fallback" as const,
  vacantes: [
    {
      vacancy_id: "vac-ops",
      title: "Cargo de muestra abierto",
      status: "open",
      web_vacancy_id: 20,
      requisition_id: "ej-abierta",
      sources: ["careers", "linkedin"],
      llegada: [
        { arrival_source: "linkedin", n: 4 },
        { arrival_source: null, n: 12 },
      ],
    },
    {
      vacancy_id: "vac-docs",
      title: "Cargo de muestra archivado",
      status: "closed",
      web_vacancy_id: 14,
      requisition_id: "ej-archivada",
      sources: ["careers"],
      llegada: [] as { arrival_source: string | null; n: number }[],
    },
  ],
};
