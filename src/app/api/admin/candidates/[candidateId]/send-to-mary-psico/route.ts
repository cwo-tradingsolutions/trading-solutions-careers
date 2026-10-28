/**
 * POST /api/admin/candidates/[candidateId]/send-to-mary-psico
 *
 * Crea un draft de Gmail para Mary Banquez (mbanquez@tradingsolutions.com)
 * pidiéndole aplicar la batería de pruebas psicométricas al candidato.
 *
 * El draft incluye:
 *   - Datos del candidato (nombre, cédula, email, teléfono, vacante)
 *   - Resumen de la entrevista recruiter · lenguaje narrativo (no rubric)
 *
 * Mary decide la batería específica (varía por cargo · técnicas + Big5 + DISC + MBTI etc).
 * Cuando Mary termine sus pruebas, ella misma mueve el candidato en el ATS
 * a "Entrevista Final" (o lo rechaza). No capturamos resultados en el ATS.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import { ATS_FROM_NAME } from "@/lib/ats-from";

export const runtime = "nodejs";

const MARY_EMAIL = process.env.MARY_PSICO_EMAIL || "mbanquez@tradingsolutions.com";

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildEmailHtml(opts: {
  candidateName: string;
  candidateCedula: string;
  candidateEmail: string;
  candidatePhone: string;
  vacancyTitle: string;
  verdict: string;
  strengths: string[];
  areasToExplore: string[];
  notes: string;
}): string {
  const strengthsHtml = opts.strengths.length
    ? opts.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join("")
    : "<li><em>—</em></li>";
  const areasHtml = opts.areasToExplore.length
    ? opts.areasToExplore.map(s => `<li>${escapeHtml(s)}</li>`).join("")
    : "<li><em>—</em></li>";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; padding: 24px; background: #fafafa; }
  .container { max-width: 640px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  h3 { font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; color: #525252; margin: 22px 0 8px; border-bottom: 1px solid #e8e8e8; padding-bottom: 6px; }
  p { font-size: 14px; margin: 0 0 12px; }
  ul { font-size: 14px; margin: 0 0 12px; padding-left: 20px; }
  li { margin-bottom: 4px; }
  .data-row { font-size: 14px; margin-bottom: 4px; }
  .data-label { font-weight: 600; display: inline-block; min-width: 90px; }
  .verdict { display: inline-block; padding: 3px 10px; background: #0a0a0a; color: white; font-size: 12px; font-weight: 600; }
  .footer { color: #737373; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e8e8e8; }
</style></head><body>
  <div class="container">
    <p>Hola <strong>Mary</strong>,</p>
    <p>Te paso un candidato que pasó la entrevista recruiter y va a pruebas psicométricas para la vacante de <strong>${escapeHtml(opts.vacancyTitle)}</strong>.</p>

    <h3>Datos del candidato</h3>
    <div class="data-row"><span class="data-label">Nombre:</span> ${escapeHtml(opts.candidateName)}</div>
    <div class="data-row"><span class="data-label">Cédula:</span> ${escapeHtml(opts.candidateCedula) || "<em>(pendiente · pedírsela al candidato)</em>"}</div>
    <div class="data-row"><span class="data-label">Email:</span> ${escapeHtml(opts.candidateEmail)}</div>
    <div class="data-row"><span class="data-label">Teléfono:</span> ${escapeHtml(opts.candidatePhone) || "—"}</div>
    <div class="data-row"><span class="data-label">Vacante:</span> ${escapeHtml(opts.vacancyTitle)}</div>

    <h3>Resumen de la entrevista recruiter</h3>
    <p><span class="data-label">Verdict:</span> <span class="verdict">${escapeHtml(opts.verdict)}</span></p>

    <p><strong>Fortalezas observadas:</strong></p>
    <ul>${strengthsHtml}</ul>

    <p><strong>Áreas para explorar en pruebas:</strong></p>
    <ul>${areasHtml}</ul>

    ${opts.notes ? `<p><strong>Notas adicionales:</strong></p><p>${escapeHtml(opts.notes)}</p>` : ""}

    <p>Cuando tengas todo, nos avisas para coordinar entrevista final con Hiring Manager + CWO.</p>

    <p>Gracias!<br><strong>Talent Acquisition Team</strong><br>Trading Solutions</p>
    <div class="footer">Generado desde el ATS al mover al candidato a "Pruebas Psicométricas".</div>
  </div>
</body></html>`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidateId } = params;

    // 1. Datos del candidato
    const { data: candidate, error: candErr } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, phone, vacancy_id, ht_vacancies(title)")
      .eq("id", candidateId)
      .single();

    if (candErr || !candidate) {
      return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
    }

    // 2. Cédula · puede vivir en varios JSONB según la fuente de import.
    //    Usamos wildcard para no romper si alguna columna no existe en el schema.
    let cedula = "";
    try {
      const { data: prefData } = await supabaseAdmin
        .from("ht_candidates")
        .select("*")
        .eq("id", candidateId)
        .single();
      const meta = (prefData?.metadata || {}) as Record<string, unknown>;
      const form = (prefData?.prefilter_form_data || {}) as Record<string, unknown>;
      const pf = (prefData?.prefilter_data || {}) as Record<string, unknown>;
      const keys = ["cedula", "identification", "document", "document_number"];
      for (const src of [meta, form, pf]) {
        for (const k of keys) {
          if (src[k]) { cedula = String(src[k]); break; }
        }
        if (cedula) break;
      }
    } catch {
      // ignorar · cédula queda vacía y el draft pide pedirla
    }

    // 3. Última evaluación recruiter
    let verdict = "Pasa a pruebas psicométricas";
    let strengths: string[] = [];
    let areasToExplore: string[] = [];
    let notes = "";
    try {
      const { data: assessment } = await supabaseAdmin
        .from("ts_recruiter_assessments")
        .select("verdict, summary_for_cwo, strengths, areas_for_growth, additional_notes")
        .eq("candidate_id", candidateId)
        .eq("assessment_stage", "recruiter_interview")
        .order("interview_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (assessment) {
        if (assessment.verdict) verdict = String(assessment.verdict);
        // strengths/areas_for_growth pueden venir como array JSON o como string
        const parseList = (raw: unknown): string[] => {
          if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
          if (typeof raw === "string" && raw.trim()) {
            return raw.split(/\n|•|·|-/).map(s => s.trim()).filter(Boolean);
          }
          return [];
        };
        strengths = parseList(assessment.strengths);
        areasToExplore = parseList(assessment.areas_for_growth);
        notes = String(assessment.additional_notes || assessment.summary_for_cwo || "");
      }
    } catch (e) {
      console.warn("No recruiter assessment found · draft sale sin resumen:", e);
    }

    // @ts-expect-error supabase relation
    const vacancyTitle: string = candidate.ht_vacancies?.title || "la posición";

    // 4. Crear draft Gmail
    let draftId: string | null = null;
    try {
      const gmail = await isGmailConnected();
      if (gmail.connected) {
        const html = buildEmailHtml({
          candidateName: String(candidate.name || "—"),
          candidateCedula: cedula,
          candidateEmail: String(candidate.email || "—"),
          candidatePhone: String(candidate.phone || ""),
          vacancyTitle,
          verdict,
          strengths,
          areasToExplore,
          notes,
        });
        const draftRes = await createDraftViaGmail({
          to: MARY_EMAIL,
          subject: `Pruebas psicométricas · ${candidate.name} · ${vacancyTitle}`,
          html,
          fromName: ATS_FROM_NAME,
          replyTo: "jointheteam@tradingsolutions.com",
        });
        if (draftRes.ok) draftId = draftRes.draft_id;
      } else {
        return NextResponse.json({ error: "Gmail no conectado" }, { status: 503 });
      }
    } catch (e: any) {
      console.error("Mary psico draft creation failed:", e);
      return NextResponse.json({ error: e?.message || "Error generando draft" }, { status: 500 });
    }

    // 5. Tracking · si la columna existe, registra el envío
    try {
      await supabaseAdmin
        .from("ht_candidates")
        .update({
          mary_psico_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidateId);
    } catch {
      // columna probablemente no existe — no bloquear
    }

    return NextResponse.json({
      success: true,
      candidate_id: candidateId,
      candidate_name: candidate.name,
      draft_id: draftId,
      mary_email: MARY_EMAIL,
    });
  } catch (err: any) {
    console.error("send-to-mary-psico error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
