/**
 * POST /api/agents/interview-prep
 *
 * Genera una GUÍA DE ENTREVISTA IA que es complemento del perfil psicométrico.
 * No es una entrevista genérica — es targeted a las dimensiones que necesitan
 * validación según los resultados de la prueba Elevare y el prefilter.
 *
 * Lógica:
 *   1) Toma el application_id, jala datos del candidato (apps + talent_pool)
 *   2) Si tiene assessment completado → usa los scores reales por dimensión
 *      Si no, usa el prefilter_data + 16 Mandamientos como proxy
 *   3) Cruza contra el ideal_profile de la vacante
 *   4) Identifica:
 *      - Dimensiones FLAG (score bajo en una dimensión crítica del rol)
 *      - Dimensiones BORDERLINE (score medio que requiere validación humana)
 *      - Dimensiones FORTALEZA (score alto que vale la pena confirmar con STAR)
 *      - Dimensiones POCO MEDIDAS (la prueba tiene pocos escenarios para esa dim)
 *   5) Anthropic genera 6-8 preguntas STAR tagged con la dimensión que exploran
 *   6) Devuelve guía estructurada lista para que Yohanna entreviste
 *
 * Body:
 *   { application_id: number }
 *
 * Returns:
 *   { candidate, vacancy, profile_snapshot, questions, validation_notes, model }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neon } from "@neondatabase/serverless";
import { getAnthropic } from "@/lib/anthropic";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

const TS_BENCHMARK = {
  IQ: { mean: 117.6, ideal: 'high', note: 'Nadie por debajo de 106 — habilidad cognitiva no negociable' },
  Conscientiousness: { mean: 77.9, ideal: 'high', note: 'Disciplina, responsabilidad, follow-through' },
  Neuroticism: { mean: 29.9, ideal: 'low', note: 'Estabilidad emocional bajo presión' },
  Agreeableness: { mean: 33.8, ideal: 'low', note: 'Criterio propio, capacidad de push back — no son pushovers' },
  'Fi Score': { mean: 91.7, ideal: 'high', note: 'Cerebro analítico/lógico domina en TS' },
  Poder_media: { mean: 4.5, ideal: 'high', note: 'Quieren influenciar, liderar, ganar' },
  Logros_media: { mean: 4.3, ideal: 'high', note: 'Orientación a logro, ambición' },
};

// Dimensiones que la prueba mide con poca robustez (cobertura insuficiente)
const LOW_COVERAGE_DIMENSIONS = [
  'Extraversion',           // 2 escenarios — caso Vanessa
  'S',                       // 2 escenarios DISC
  'Bd Score', 'Fd Score',    // 1 escenario cada una
  'Poder_media',             // 1 escenario
  'Attention and Memory',    // 3 escenarios
  'Perceptual Speed',        // 3 escenarios
  'Afiliación_media',        // 3 escenarios
];

type Application = {
  id: number;
  job_id: number;
  job_title: string;
  full_name: string;
  email: string;
  phone: string | null;
  linkedin: string | null;
  why_ts: string | null;
  status: string;
  score: number | null;
  prefilter_data: Record<string, unknown> | null;
};

type AssessmentToken = {
  candidate_email: string;
  status: string;
  score: number | null;
  scores_json?: Record<string, number> | null;
  completed_at: string | null;
};

type Vacancy = {
  id: number;
  title: string;
  title_es?: string | null;
  department: string;
  level?: string | null;
  ideal_profile?: Record<string, { min: number; max: number; weight?: number }> | null;
};

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const application_id = parseInt(body.application_id, 10);
    if (!application_id) {
      return NextResponse.json({ error: "missing_application_id" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // 1) Pull application + vacancy + assessment
    const appRows = await sql`SELECT * FROM applications WHERE id = ${application_id} LIMIT 1`;
    if (appRows.length === 0) {
      return NextResponse.json({ error: "application_not_found" }, { status: 404 });
    }
    const app = appRows[0] as Application;

    const vacRows = await sql`SELECT * FROM vacancies WHERE id = ${app.job_id} LIMIT 1`;
    const vac = (vacRows[0] ?? null) as Vacancy | null;

    const assessRows = await sql`
      SELECT * FROM assessment_tokens
      WHERE LOWER(candidate_email) = LOWER(${app.email})
      ORDER BY sent_at DESC
      LIMIT 1
    `;
    const assess = (assessRows[0] ?? null) as AssessmentToken | null;

    // 2) Construir snapshot del perfil
    const prefilter = (app.prefilter_data as Record<string, unknown> | null) ?? {};
    const breakdown = (prefilter.breakdown as Record<string, number>) ?? {};
    const reasons = (prefilter.reasons as string[]) ?? [];
    const category = (prefilter.category as string) ?? '—';

    const profileSnapshot = {
      score_16_mandamientos: app.score,
      categoria: category,
      breakdown,
      filtros_duros: reasons,
      assessment_status: assess?.status ?? 'no_enviada',
      assessment_score: assess?.score ?? null,
      assessment_dimensions: assess?.scores_json ?? null,
    };

    // 3) Identificar focos de la entrevista
    const focusPoints: string[] = [];
    const lowSignals: string[] = [];
    const strengths: string[] = [];

    // Si tiene scores reales de la prueba
    if (assess?.scores_json) {
      const scores = assess.scores_json;
      for (const [dim, val] of Object.entries(scores)) {
        const bench = TS_BENCHMARK[dim as keyof typeof TS_BENCHMARK];
        if (bench) {
          if (bench.ideal === 'high' && val < bench.mean - 10) {
            lowSignals.push(`${dim}: ${val} (benchmark TS ${bench.mean}). ${bench.note}.`);
          } else if (bench.ideal === 'low' && val > bench.mean + 10) {
            lowSignals.push(`${dim}: ${val} (benchmark TS ${bench.mean}). Debería ser BAJO.`);
          } else if (Math.abs(val - bench.mean) <= 10) {
            // dentro del rango — confirmar
            strengths.push(`${dim}: ${val} (en rango benchmark TS ${bench.mean})`);
          }
        }
        if (LOW_COVERAGE_DIMENSIONS.includes(dim)) {
          focusPoints.push(`${dim}: la prueba mide esta dimensión con cobertura limitada — VALIDAR a profundidad en entrevista.`);
        }
      }
    } else {
      // Sin assessment, usar prefilter como proxy
      const matchedKeys = Object.keys(breakdown);
      const importantKeys = ['Sales', 'Eng', 'Tech', 'Multi', 'Log', 'Comp'];
      const missingKeys = importantKeys.filter((k) => !matchedKeys.includes(k));
      for (const k of missingKeys) {
        focusPoints.push(`Dimensión ${k} no detectada en CV — preguntar directo.`);
      }
      for (const [k, v] of Object.entries(breakdown)) {
        strengths.push(`${k}: +${v}pts en CV — validar con caso concreto.`);
      }
    }

    // 4) Llamar a Anthropic para generar la guía
    const role = vac?.title_es ?? vac?.title ?? 'el rol';
    const tsDNAContext = `
TS DNA (15 top performers reales):
- IQ alto (avg 117.6, nadie <106) — capacidad cognitiva no negociable
- Conscientiousness alta (77.9) — disciplinados, follow-through
- Neuroticism BAJO (29.9) — estables emocionalmente
- Agreeableness BAJO (33.8) — no son complacientes, tienen criterio propio
- Fi Score alto (91.7) — analítico/lógico
- Poder y Logros altos — quieren ganar, influenciar
`.trim();

    const prompt = `Eres un experto entrevistador estilo Bock (ex-Google) y Buckingham. Tu tarea es generar una GUÍA DE ENTREVISTA que sea COMPLEMENTO del perfil psicométrico, no un cuestionario genérico.

CANDIDATO: ${app.full_name}
VACANTE: ${role} (Trading Solutions, ${vac?.department ?? '—'})

PERFIL PSICOMÉTRICO ACTUAL:
- Score 16 Mandamientos: ${app.score ?? 'sin calcular'} (categoría ${category})
- Breakdown CV (puntos detectados): ${Object.entries(breakdown).map(([k, v]) => `${k}+${v}`).join(', ') || 'sin breakdown'}
${assess?.score ? `- Prueba Elevare completada — score global: ${assess.score}/100` : '- Prueba Elevare NO completada todavía'}
${assess?.scores_json ? `- Scores por dimensión psicométrica: ${JSON.stringify(assess.scores_json)}` : ''}

PUNTOS A VALIDAR EN ENTREVISTA:
${focusPoints.length > 0 ? focusPoints.map((f) => `  - ${f}`).join('\n') : '  - (ninguno crítico, validar fortalezas)'}

SEÑALES BAJAS (red flags posibles):
${lowSignals.length > 0 ? lowSignals.map((f) => `  - ${f}`).join('\n') : '  - ninguna detectada'}

FORTALEZAS A CONFIRMAR:
${strengths.length > 0 ? strengths.slice(0, 5).map((f) => `  - ${f}`).join('\n') : '  - usar las del CV'}

CONTEXTO:
${tsDNAContext}

NOTAS DEL CV / CONTEXTO ADICIONAL:
${(app.why_ts ?? '').slice(0, 1500)}

REGLAS para la guía:
1. Genera 6-8 preguntas STAR (Situation-Task-Action-Result), cada una targeted a UNA dimensión específica.
2. Las primeras 2-3 preguntas deben profundizar en los PUNTOS A VALIDAR (focus points y red flags). Es lo más importante.
3. 2-3 preguntas deben confirmar fortalezas con casos concretos del último año.
4. 1-2 preguntas situacionales role-play que repliquen el día-a-día del rol.
5. Cada pregunta debe llevar:
   - La pregunta exacta para hacer al candidato (en español neutro, profesional pero conversacional)
   - Qué dimensión psicométrica explora
   - Qué señales BUSCAR en la respuesta (1 línea)
   - Qué señales serían RED FLAG (1 línea)
6. NO uses preguntas genéricas tipo "cuéntame de ti", "fortalezas/debilidades", "dónde te ves en 5 años".
7. Sé específico al rol y al perfil del candidato.

FORMATO DE SALIDA (JSON estricto):
{
  "summary": "Una frase con la lectura de Yohanna sobre qué probar en esta entrevista",
  "questions": [
    {
      "n": 1,
      "dimension": "Extraversion (TS critical)",
      "type": "validate_flag" | "confirm_strength" | "situational",
      "question": "...",
      "look_for": "...",
      "red_flag": "..."
    }
  ],
  "interpretation_guide": "2-3 líneas sobre cómo triangular las respuestas con el perfil psicométrico. Qué patrón confirmaría TOP / qué patrón haría descartar."
}

Responde SOLO con el JSON, sin texto adicional.`;

    const anthropic = getAnthropic();
    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 3000,
      temperature: 0.5,
      messages: [{ role: "user", content: prompt }],
    });

    const text = result.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();

    // Parse JSON output
    let parsed: unknown = null;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      // si falla, devolver raw
      parsed = { raw: text };
    }

    return NextResponse.json({
      candidate: {
        id: app.id,
        name: app.full_name,
        email: app.email,
        status: app.status,
        score_16_mandamientos: app.score,
      },
      vacancy: {
        id: vac?.id,
        title: role,
        department: vac?.department,
      },
      profile_snapshot: profileSnapshot,
      focus_points: focusPoints,
      low_signals: lowSignals,
      strengths,
      guide: parsed,
      model: result.model,
      usage: result.usage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    console.error("interview-prep error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
