/**
 * GET /api/portal/[token]
 *
 * Endpoint público (no requiere auth) que devuelve el estatus actual de
 * una aplicación dado un portal_token HMAC. El candidato no ve scores ni
 * datos internos — solo su progreso en el funnel y próximo paso esperado.
 */
import { neon } from "@/lib/sql";
import { NextRequest, NextResponse } from "next/server";
import { publicStepBody } from "@/lib/candidate-public-error";
import { verifyPortalToken, isValidSignatureFor } from "@/lib/portal-token";
import { resolveCandidateLang, type CandidateLang } from "@/lib/candidate-lang";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Mapeo de status interno → step visible al candidato.
// Las vacantes de China corren en inglés · el portal también.
const STAGE_FLOW_ES = [
  { key: "received", label: "Aplicación recibida", icon: "📨" },
  { key: "review", label: "En revisión por nuestro equipo", icon: "🔍" },
  { key: "assessment", label: "Evaluación psicométrica", icon: "📝" },
  { key: "interview", label: "Entrevista", icon: "💬" },
  { key: "offer", label: "Oferta", icon: "🎉" },
  { key: "hired", label: "Bienvenido al equipo", icon: "✨" },
];

const STAGE_FLOW_EN = [
  { key: "received", label: "Application received", icon: "📨" },
  { key: "review", label: "Under review by our team", icon: "🔍" },
  { key: "assessment", label: "Assessment", icon: "📝" },
  { key: "interview", label: "Interview", icon: "💬" },
  { key: "offer", label: "Offer", icon: "🎉" },
  { key: "hired", label: "Welcome to the team", icon: "✨" },
];

function statusToStage(status: string, lang: CandidateLang): { current: number; descriptor: string } {
  const en = lang === "en";
  switch (status) {
    case "new":
      return { current: 1, descriptor: en ? "Your application is being reviewed by our team." : "Tu aplicación está en revisión por nuestro equipo." };
    case "reviewing":
      return { current: 1, descriptor: en ? "You are under active review. We'll contact you with the next step in the coming days." : "Estás en revisión activa. En los próximos días te contactaremos con el siguiente paso." };
    case "interview":
      return { current: 3, descriptor: en ? "You have moved forward to the interview stage. Please check your email to schedule it." : "Has avanzado a entrevista. Revisa tu correo para agendar." };
    case "offer":
      return { current: 4, descriptor: en ? "We are finalizing the details of your offer." : "Estamos cerrando los detalles de tu oferta." };
    case "hired":
      return { current: 5, descriptor: en ? "Welcome to the Trading Solutions team!" : "¡Bienvenido al equipo Trading Solutions!" };
    case "rejected":
      return { current: -1, descriptor: en ? "This application was closed. We invite you to explore our other openings." : "Esta aplicación fue cerrada. Te invitamos a explorar otras vacantes." };
    default:
      return { current: 0, descriptor: en ? "Your application was received." : "Tu aplicación fue recibida." };
  }
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const parsed = verifyPortalToken(params.token);
    if (!parsed) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401, headers: corsHeaders });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT id, job_id, job_title, full_name, email, status, created_at, updated_at
      FROM applications
      WHERE id = ${parsed.application_id}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: corsHeaders });
    }
    const app = rows[0] as { id: number; job_id: number; job_title: string; full_name: string; email: string; status: string; created_at: string; updated_at: string };

    if (!isValidSignatureFor(app.id, app.email, parsed.signature)) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401, headers: corsHeaders });
    }

    // Si tiene assessment → traer status para mostrar al candidato
    type AssessmentInfo = { status: string; sent_at: string | null; completed_at: string | null };
    let assessment: AssessmentInfo | null = null;
    try {
      const tokenRows = await sql`
        SELECT status, sent_at, completed_at
        FROM assessment_tokens
        WHERE LOWER(candidate_email) = LOWER(${app.email})
        ORDER BY sent_at DESC
        LIMIT 1
      `;
      if (tokenRows.length > 0) {
        const t = tokenRows[0];
        assessment = {
          status: (t.status as string) ?? '',
          sent_at: (t.sent_at as string) ?? null,
          completed_at: (t.completed_at as string) ?? null,
        };
      }
    } catch { /* tabla puede no existir aún */ }

    // Lookup vacancy info
    let vacancyTitle = app.job_title;
    let vacancyLocation: string | null = null;
    try {
      const vRows = await sql`SELECT title_es, title, location FROM vacancies WHERE id = ${app.job_id} LIMIT 1`;
      if (vRows.length > 0) {
        // En inglés se prefiere el título en inglés de la vacante.
        vacancyTitle = resolveCandidateLang({ jobId: app.job_id, jobTitle: app.job_title, country: (vRows[0].location as string) ?? null }) === "en"
          ? ((vRows[0].title as string) ?? (vRows[0].title_es as string) ?? app.job_title)
          : ((vRows[0].title_es as string) ?? (vRows[0].title as string) ?? app.job_title);
        vacancyLocation = (vRows[0].location as string) ?? null;
      }
    } catch { /* ignore */ }

    const lang = resolveCandidateLang({ jobId: app.job_id, jobTitle: app.job_title, country: vacancyLocation });
    const STAGE_FLOW = lang === "en" ? STAGE_FLOW_EN : STAGE_FLOW_ES;
    const stageInfo = statusToStage(app.status, lang);
    // Si tiene assessment_completed pero status sigue en reviewing/new, ajustar visualización
    const showAssessment = assessment !== null;

    const stageOrder = STAGE_FLOW.map((s, idx) => {
      let state: "done" | "current" | "pending" | "skipped" = "pending";
      if (stageInfo.current === -1) {
        // rechazado: solo "received" como done, el resto skipped
        state = idx === 0 ? "done" : "skipped";
      } else if (idx < stageInfo.current) {
        state = "done";
      } else if (idx === stageInfo.current) {
        state = "current";
      }
      // Override: si tiene assessment, marcar el step assessment como done si está completado
      if (s.key === "assessment" && showAssessment) {
        if (assessment?.status === "completed") state = "done";
        else if (assessment?.status === "in_progress" || assessment?.status === "sent") state = "current";
      }
      return { ...s, state };
    });

    return NextResponse.json(
      {
        candidate: {
          name: app.full_name,
          email: app.email,
        },
        vacancy: {
          title: vacancyTitle,
          location: vacancyLocation,
        },
        application: {
          id: app.id,
          status: app.status,
          rejected: app.status === "rejected",
          applied_at: app.created_at,
          last_update: app.updated_at,
        },
        lang,
        stages: stageOrder,
        descriptor: stageInfo.descriptor,
        assessment: showAssessment ? assessment : null,
        sla_promise_days: 7,
      },
      { headers: corsHeaders }
    );
  } catch (e) {
    console.error("portal GET error:", e);
    return NextResponse.json(publicStepBody(), { status: 500, headers: corsHeaders });
  }
}
