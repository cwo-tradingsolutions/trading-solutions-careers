/**
 * POST /api/agents/interview-synthesize
 *
 * Toma las respuestas de la entrevista IA + el perfil psicométrico y produce
 * un DOSSIER COMPLEMENTARIO triangulado: psicometría + entrevista → recomendación.
 *
 * Body:
 *   { application_id: number, answers: Array<{ n: number, dimension: string, question: string, answer: string }> }
 *
 * Returns:
 *   { dossier: { triangulation, confirmations, contradictions, final_recommendation }, model }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neon } from "@/lib/sql";
import { getAnthropic } from "@/lib/anthropic";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const application_id = parseInt(body.application_id, 10);
    const answers = body.answers as Array<{ n: number; dimension: string; question: string; answer: string }>;

    if (!application_id || !Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const appRows = await sql`SELECT * FROM applications WHERE id = ${application_id} LIMIT 1`;
    if (appRows.length === 0) {
      return NextResponse.json({ error: "application_not_found" }, { status: 404 });
    }
    const app = appRows[0] as { id: number; full_name: string; email: string; job_title: string; score: number | null; prefilter_data: Record<string, unknown> | null };

    const assessRows = await sql`
      SELECT * FROM assessment_tokens
      WHERE LOWER(candidate_email) = LOWER(${app.email})
      ORDER BY sent_at DESC
      LIMIT 1
    `;
    const assess = (assessRows[0] ?? null) as { score: number | null; scores_json?: Record<string, number> | null } | null;

    const prompt = `Eres un evaluador senior de talento. Acabas de tener una entrevista con ${app.full_name} para ${app.job_title} en Trading Solutions. Tu tarea es triangular la entrevista con la prueba psicométrica y producir un DOSSIER COMPLEMENTARIO.

PERFIL PSICOMÉTRICO:
- Score 16 Mandamientos (CV): ${app.score ?? 'n/d'}
- Categoría prefilter: ${(app.prefilter_data as Record<string, unknown> | null)?.category ?? 'n/d'}
- Prueba Elevare global: ${assess?.score ?? 'no completada'}
${assess?.scores_json ? `- Scores por dimensión: ${JSON.stringify(assess.scores_json)}` : ''}

ENTREVISTA (preguntas y respuestas):
${answers.map((a) => `[Pregunta ${a.n} · ${a.dimension}]\nP: ${a.question}\nR: ${a.answer}`).join('\n\n')}

INSTRUCCIONES:
1. Por cada respuesta, identifica si CONFIRMA, CONTRADICE o COMPLEMENTA lo que dice la prueba psicométrica.
2. Reúne los hallazgos en 3 secciones:
   - confirmations: dimensiones donde entrevista y prueba coinciden
   - contradictions: dimensiones donde entrevista y prueba dan señales opuestas (importante señalar a Kelly y Yohanna para que decidan)
   - new_signals: cosas que la entrevista revela y la prueba no podía capturar (proyectos específicos, motivación particular, contexto vital)
3. Da una recomendación final: AVANZA (a oferta) / SEGUNDA RONDA / DESCARTA, con la confianza (alta/media/baja) y el por qué.

FORMATO DE SALIDA (JSON estricto):
{
  "triangulation_summary": "1 párrafo con la lectura general",
  "confirmations": [{ "dimension": "...", "evidence_test": "...", "evidence_interview": "...", "verdict": "consistent" }],
  "contradictions": [{ "dimension": "...", "test_says": "...", "interview_says": "...", "interpretation": "...", "next_step": "..." }],
  "new_signals": [{ "topic": "...", "what_we_learned": "..." }],
  "final_recommendation": {
    "decision": "advance_to_offer" | "second_round" | "discard",
    "confidence": "high" | "medium" | "low",
    "rationale": "...",
    "if_advance_concerns_to_address": "..."
  }
}

Responde SOLO con el JSON.`;

    const anthropic = getAnthropic();
    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 3000,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    });

    const text = result.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();

    let parsed: unknown = null;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = { raw: text };
    }

    return NextResponse.json({
      candidate: { id: app.id, name: app.full_name, email: app.email },
      dossier: parsed,
      model: result.model,
      usage: result.usage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    console.error("interview-synthesize error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
