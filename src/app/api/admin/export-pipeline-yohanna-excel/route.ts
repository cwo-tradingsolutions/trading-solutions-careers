/**
 * POST /api/admin/export-pipeline-yohanna-excel
 *
 * Genera un archivo .xlsx con TODOS los candidatos de las vacantes especificadas
 * (o todas las activas), incluyendo las revisiones de Kelly y los rechazados.
 *
 * Yohanna puede filtrar, ordenar y marcar decisiones en Excel · es más práctico
 * que el HTML del correo para procesar volumen.
 *
 * Body opcional: { vacancy_ids?: string[], stages?: string[], include_rejected?: boolean }
 *
 * Respuesta: archivo binario .xlsx para descargar
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { sql } from "@/lib/db";
import * as XLSX from "xlsx";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";

const DEFAULT_STAGES_ACTIVE = [
  "prefiltro_pasado",
  "prefiltro_revision",
  "recruiter_interview",
  "hiring_lead_interview",
  "cwo_interview",
  "bateria_psicometrica",
  "solicitud_enviada_mary",
];
const STAGE_HUMAN_LABELS: Record<string, string> = {
  prefiltro_pasado: "Prefiltro · Pass",
  prefiltro_revision: "Prefiltro · Review",
  recruiter_interview: "Entrevista Recruiter",
  hiring_lead_interview: "Entrevista Hiring Lead",
  cwo_interview: "CWO + Hiring Manager",
  bateria_psicometrica: "Pruebas Psicométricas",
  solicitud_enviada_mary: "Solicitud a HR Specialist",
  touring: "Máquina de Turing",
  terna: "Terna · Finalistas",
  oferta: "Oferta",
  contratado: "Contratado",
  rechazado: "Rechazado",
};
const VERDICT_LABEL: Record<string, string> = {
  strong_yes: "STRONG YES",
  maybe: "MAYBE",
  no: "NO",
};

type Cand = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  cv_url?: string | null;
  cv_filename?: string | null;
  vacancy_id?: string | null;
  ht_vacancies?: { title?: string } | null;
  stage?: string | null;
  created_at?: string | null;
  current_job_role?: string | null;
  prefilter_score?: number | null;
  prefilter_notes?: string | null;
  rejection_reason?: string | null;
  metadata?: Record<string, unknown> | null;
  prefilter_data?: Record<string, unknown> | null;
  prefilter_form_data?: Record<string, unknown> | null;
};

type Assessment = {
  candidate_id: string;
  verdict?: string | null;
  verdict_summary?: string | null;
  summary_for_cwo?: string | null;
  english_verdict?: string | null;
  english_real?: string | null;
  pass_reasons?: unknown;
  fail_reasons?: unknown;
  additional_notes?: string | null;
  interview_date?: string | null;
};

function pickFromAny(c: Cand, keys: string[]): string {
  const sources: Record<string, unknown>[] = [
    (c.metadata || {}) as Record<string, unknown>,
    (c.prefilter_data || {}) as Record<string, unknown>,
    (c.prefilter_form_data || {}) as Record<string, unknown>,
  ];
  for (const src of sources) {
    for (const k of keys) {
      if (src[k]) return String(src[k]);
    }
  }
  return "";
}

function joinList(x: unknown, sep = " · "): string {
  if (Array.isArray(x)) return x.filter(Boolean).map(String).join(sep);
  if (typeof x === "string") return x;
  return "";
}

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const vacancyIdsParam: string[] | null = Array.isArray(body.vacancy_ids) && body.vacancy_ids.length > 0
      ? body.vacancy_ids
      : (body.vacancy_id ? [body.vacancy_id] : null);
    const stagesParam: string[] = Array.isArray(body.stages) && body.stages.length > 0
      ? body.stages
      : DEFAULT_STAGES_ACTIVE;
    const includeRejected: boolean = body.include_rejected !== false;
    const allStages = includeRejected ? [...new Set([...stagesParam, "rechazado"])] : stagesParam;

    // 1. Si no pasaron vacancy_ids, traer activas
    let activeVacancyIds: string[] = [];
    if (!vacancyIdsParam) {
      try {
        const { data: vacs } = await supabaseAdmin
          .from("ht_vacancies")
          .select("id, active")
          .eq("active", true);
        activeVacancyIds = (vacs || []).map((v: { id: string }) => v.id);
      } catch (e) {
        console.warn("No se pudo cargar vacantes activas:", e);
      }
    }
    const finalVacancyIds = vacancyIdsParam || activeVacancyIds;

    // 2. Cargar candidatos
    let q = supabaseAdmin
      .from("ht_candidates")
      .select("*, ht_vacancies(title)")
      .in("stage", allStages)
      .order("created_at", { ascending: false });

    if (finalVacancyIds.length > 0) {
      q = q.in("vacancy_id", finalVacancyIds);
    }

    const { data, error } = await q;
    if (error) {
      console.error("Error cargando candidatos:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const cands = ((data || []) as unknown as Cand[]);
    if (cands.length === 0) {
      return NextResponse.json({
        error: "No hay candidatos para exportar con los filtros aplicados",
      }, { status: 400 });
    }

    // 3. Cargar assessments
    const assessmentMap = new Map<string, Assessment>();
    try {
      const candidateIds = cands.map(c => c.id);
      const { data: assessments } = await supabaseAdmin
        .from("ts_recruiter_assessments")
        .select("*")
        .in("candidate_id", candidateIds)
        .eq("assessment_stage", "recruiter_interview")
        .order("interview_date", { ascending: false });
      for (const a of (assessments || []) as Assessment[]) {
        if (!assessmentMap.has(a.candidate_id)) {
          assessmentMap.set(a.candidate_id, a);
        }
      }
    } catch (e) {
      console.warn("No se pudieron cargar recruiter assessments:", e);
    }

    // 3b. Cargar applications (Neon) por email · trae CV + LinkedIn del flujo público
    type AppRow = {
      id: number;
      email: string;
      linkedin: string | null;
      cv_filename: string | null;
      why_ts: string | null;
      prefilter_data: Record<string, unknown> | null;
      score: number | null;
    };
    const appByEmail = new Map<string, AppRow>();
    try {
      const emails = Array.from(new Set(cands.map(c => (c.email || "").toLowerCase().trim()).filter(Boolean)));
      if (emails.length > 0) {
        const appRows = await sql`
          SELECT id, email, linkedin, cv_filename, why_ts, prefilter_data, score
          FROM applications
          WHERE LOWER(email) = ANY(${emails})
          ORDER BY created_at DESC
        ` as unknown as AppRow[];
        // Mantener la aplicación más reciente por email
        for (const a of appRows) {
          const k = (a.email || "").toLowerCase().trim();
          if (!appByEmail.has(k)) appByEmail.set(k, a);
        }
      }
    } catch (e) {
      console.warn("No se pudieron cargar applications de Neon:", e);
    }

    // 4. Armar las filas
    const rows = cands.map((c, idx) => {
      const a = assessmentMap.get(c.id);
      const app = c.email ? appByEmail.get(c.email.toLowerCase().trim()) : undefined;
      // PrefData del flujo público (Neon) · puede tener más data que el snapshot en Supabase
      const appPref = (app?.prefilter_data || {}) as Record<string, unknown>;

      const cedula = pickFromAny(c, ["cedula", "identification", "document_number", "document"])
        || (appPref["cedula"] as string)
        || (appPref["identification"] as string)
        || "";

      // LinkedIn · primero ht_candidates, después applications.linkedin
      const linkedin =
        c.linkedin_url ||
        pickFromAny(c, ["linkedin_url", "linkedin"]) ||
        app?.linkedin ||
        (appPref["linkedin"] as string) ||
        "";

      // CV · si applications tiene cv_filename, construye URL al endpoint admin
      let cv = "";
      let cvFilename = "";
      if (app?.cv_filename && app?.id) {
        cv = `${APP_URL}/api/admin/cv/${app.id}`;
        cvFilename = app.cv_filename;
      } else if (c.cv_url) {
        cv = c.cv_url;
      } else if (c.cv_filename) {
        cv = `${APP_URL}/api/cv/${c.id}`;
        cvFilename = c.cv_filename;
      } else {
        cv = pickFromAny(c, ["cv_url", "cv_link"]);
      }

      const currentRole = c.current_job_role
        || pickFromAny(c, ["current_job_role", "current_role", "current_position"])
        || (appPref["current_job_role"] as string)
        || (appPref["current_role"] as string)
        || "";
      const city = pickFromAny(c, ["city", "ciudad"]) || (appPref["city"] as string) || "";
      const prefScore = c.prefilter_score != null
        ? c.prefilter_score
        : (pickFromAny(c, ["prefilter_score", "score"]) || (app?.score ?? "") || "");
      const prefNotes = c.prefilter_notes
        || pickFromAny(c, ["prefilter_notes", "notes", "why_ts"])
        || (app?.why_ts || "");
      const rejectionReason = c.rejection_reason
        || pickFromAny(c, ["rejection_reason", "rejection_notes", "reject_reason"]);
      const verdict = a?.verdict ? (VERDICT_LABEL[a.verdict] || a.verdict) : "";
      const englishCombined = a?.english_real
        ? `${a.english_real}${a.english_verdict ? ` (${a.english_verdict})` : ""}`
        : "";

      return {
        "#": idx + 1,
        "Vacante": c.ht_vacancies?.title || "(sin vacante)",
        "Etapa actual": STAGE_HUMAN_LABELS[c.stage || ""] || c.stage || "",
        "Nombre completo": c.name || "",
        "Cédula": cedula,
        "Email": c.email || "",
        "Teléfono": c.phone || "",
        "LinkedIn": linkedin || "",
        "Archivo CV": cvFilename || "",
        "Ver CV (URL)": cv || "",
        "Cargo actual": currentRole,
        "Ciudad": city,
        "Aplicó": c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : "",
        "Score prefilter": prefScore !== "" ? prefScore : "",
        "Notas prefilter": prefNotes || "",
        "Verdict Kelly": verdict,
        "Resumen Kelly": a?.verdict_summary || a?.summary_for_cwo || a?.additional_notes || "",
        "Fortalezas (Kelly)": joinList(a?.pass_reasons),
        "Reservas (Kelly)": joinList(a?.fail_reasons),
        "Inglés evaluado": englishCombined,
        "Fecha entrevista Kelly": a?.interview_date ? new Date(a.interview_date).toISOString().slice(0, 10) : "",
        "Razón rechazo": rejectionReason,
        "Próximo paso recomendado": "",  // columna vacía para que Yohanna llene
        "Decisión Yohanna": "",          // columna vacía para que Yohanna llene
        "Notas Yohanna": "",             // columna vacía para que Yohanna llene
      };
    });

    // 5. Crear workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Ajustar anchos de columnas
    const cols = Object.keys(rows[0] || {});
    ws["!cols"] = cols.map(k => {
      const maxLen = Math.max(
        k.length,
        ...rows.map(r => String((r as Record<string, unknown>)[k] || "").length)
      );
      return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
    });

    // Freeze header row
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, ws, "Pipeline");

    // 6. Generar buffer
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Nombre del archivo
    const today = new Date().toISOString().slice(0, 10);
    const filename = `handoff-pipeline-yohanna-${today}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("export-pipeline-yohanna-excel error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
