/**
 * POST /api/headhunting/ai-interview/[token]/finalize
 *
 * Llamado por el frontend cuando la entrevista termina (o invocado manualmente
 * con un conversation_id). Corre 3 agentes Claude en paralelo:
 *   1. SCORING agent → score general + recomendación + summary
 *   2. COMPETENCIES agent → 8-10 competencias del rol con score 1-10 + evidencia
 *   3. ENGLISH agent → CEFR level + breakdown (fluidez, pronunciación, gramática, vocab, comprensión)
 *
 * Body: { conversation_id?: string, transcript?: any, audio_url?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import { crearAnthropic } from "@/lib/anthropic";
import { isPreviewTestMode, previewTestJson } from "@/lib/preview-mode";

// Permitir hasta 90s — los 3 agentes Claude en paralelo con transcripts de
// 14K chars pueden tardar 40-60s. Vercel Pro permite hasta 90s.
export const maxDuration = 90;
export const runtime = "nodejs";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  _anthropic = crearAnthropic();
  return _anthropic;
}

const MODEL = "claude-sonnet-4-5";

// ─── PROMPT 1: Scoring general ────────────────────────────────
const SCORING_PROMPT = `Eres un analista experto en entrevistas de selección. Acabas de revisar una entrevista por voz que un candidato tuvo con una recruiter virtual de Trading Solutions (logística internacional, Barranquilla Colombia).

CANDIDATO: {candidate_name}
POSICIÓN: {vacancy_title} · ÁREA: {vacancy_area}

TRANSCRIPCIÓN:
{transcript}

Genera un análisis ejecutivo de la entrevista. Devuelve SOLO un JSON válido (sin texto extra):

{
  "score": <number 0-100>,
  "recommendation": "AVANZA" | "EN ESPERA" | "NO AVANZA",
  "summary": "<3-4 oraciones — quién es el candidato y cómo se desempeñó en general>",
  "strengths": [
    { "area": "<área>", "evidence": "<cita textual o paráfrasis exacta del candidato>" }
  ],
  "gaps": [
    { "area": "<área débil>", "evidence": "<cita o paráfrasis>", "severity": "low|medium|high" }
  ],
  "red_flags": [ "<señal concreta — solo si aplica>" ],
  "interview_questions_for_human_recruiter": [
    "<pregunta sugerida para que Kelly profundice en entrevista CWO>"
  ]
}

CRITERIOS:
- Score 80+: AVANZA (ejemplos específicos, situaciones reales, resultados medibles)
- Score 60-79: EN ESPERA (algunos sólidos pero con gaps notables)
- Score <60: NO AVANZA (vagos, sin evidencia, no-match con rol)

Sé EVIDENCIAL — cada strength/gap con cita textual. Si la entrevista quedó incompleta (cortada), evalúa solo lo que escuchaste y nota la limitación en summary.`;

// ─── PROMPT 2: Competencias específicas del rol ──────────────
const COMPETENCY_PROMPT = `Eres un experto en evaluación por competencias. Tienes que calificar al candidato según las competencias críticas del rol.

CANDIDATO: {candidate_name}
POSICIÓN: {vacancy_title} · ÁREA: {vacancy_area}

TRANSCRIPCIÓN:
{transcript}

Califica las siguientes competencias (1-10) con evidencia de la entrevista. Devuelve SOLO un JSON estricto:

{
  "competencies": [
    {
      "name": "Comunicación verbal",
      "score": <1-10>,
      "evidence": "<cita o paráfrasis>",
      "reasoning": "<por qué ese score>"
    },
    {
      "name": "Pensamiento estructurado (STAR)",
      "score": <1-10>,
      "evidence": "<...>",
      "reasoning": "<...>"
    },
    {
      "name": "Orientación a resultados",
      "score": <1-10>,
      "evidence": "<...>",
      "reasoning": "<...>"
    },
    {
      "name": "Resolución de problemas",
      "score": <1-10>,
      "evidence": "<...>",
      "reasoning": "<...>"
    },
    {
      "name": "Manejo de presión",
      "score": <1-10>,
      "evidence": "<...>",
      "reasoning": "<...>"
    },
    {
      "name": "Trabajo en equipo / Colaboración",
      "score": <1-10>,
      "evidence": "<...>",
      "reasoning": "<...>"
    },
    {
      "name": "Aprendizaje y autocrítica",
      "score": <1-10>,
      "evidence": "<...>",
      "reasoning": "<...>"
    },
    {
      "name": "{role_specific_competency_1}",
      "score": <1-10>,
      "evidence": "<...>",
      "reasoning": "<...>"
    },
    {
      "name": "{role_specific_competency_2}",
      "score": <1-10>,
      "evidence": "<...>",
      "reasoning": "<...>"
    }
  ],
  "average_score": <number, promedio de las anteriores en escala 0-100>,
  "top_3_strengths": ["<competencia>", "<competencia>", "<competencia>"],
  "top_3_gaps": ["<competencia>", "<competencia>", "<competencia>"]
}

REGLAS:
- {role_specific_competency_1} y {role_specific_competency_2}: reemplaza por competencias específicas al rol (ej. para Sales: "Cierre comercial" y "Manejo de objeciones"; para Pricing: "Precisión analítica" y "Atención al detalle"; para Customer Doc: "Documentación rigurosa" y "Comunicación con cliente externo").
- Si no hay evidencia para una competencia, score = 5 y evidence = "Sin evidencia clara en la entrevista".
- Sé estricto: 8-10 = excelente con prueba clara; 5-7 = aceptable; 1-4 = débil con evidencia.`;

// ─── PROMPT 3: Inglés ──────────────────────────────────────
const ENGLISH_PROMPT = `Eres un evaluador certificado de inglés profesional. El candidato tuvo una sección en inglés al final de la entrevista (role-play de cliente extranjero llamando por servicios de logística).

CANDIDATO: {candidate_name}

TRANSCRIPCIÓN COMPLETA:
{transcript}

Evalúa el nivel de inglés del candidato según el Marco Común Europeo (CEFR) y devuelve SOLO un JSON estricto:

{
  "cefr_level": "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "no_evaluated",
  "overall_score": <number 0-100>,
  "fluency": <1-10>,
  "pronunciation": <1-10>,
  "grammar": <1-10>,
  "vocabulary": <1-10>,
  "comprehension": <1-10>,
  "english_section_quotes": [
    "<cita textual del candidato hablando en inglés>"
  ],
  "professional_readiness": "ready_for_clients" | "needs_practice" | "not_ready" | "no_evaluated",
  "summary": "<2-3 oraciones evaluando el nivel y si puede manejar conversaciones con clientes en inglés>"
}

GUÍA CEFR:
- A1/A2: básico, no puede sostener conversación profesional
- B1: intermedio, conversaciones simples, errores frecuentes pero comprensible
- B2: intermedio-alto, conversaciones profesionales con esfuerzo, errores ocasionales
- C1: avanzado, fluido para negocios, errores raros
- C2: nativo o casi nativo

REGLAS:
- Si NO hay sección en inglés en el transcript, pon "no_evaluated" en cefr_level y professional_readiness, y todos los scores numéricos en 0.
- Para "ready_for_clients" se requiere mínimo B2.
- Cita textual exacta del candidato en inglés (no de la recruiter).`;

const COMP_BY_AREA: Record<string, [string, string]> = {
  Sales: ["Cierre comercial", "Manejo de objeciones"],
  "Inside Sales": ["Cierre comercial", "Manejo de objeciones"],
  Pricing: ["Precisión analítica", "Atención al detalle"],
  Operations: ["Eficiencia operacional", "Atención al detalle"],
  Finance: ["Rigor numérico", "Control y compliance"],
  "Customer Documentation": ["Documentación rigurosa", "Comunicación con cliente externo"],
};

function buildTranscriptText(transcript: any): string {
  if (!transcript) return "";
  if (Array.isArray(transcript)) {
    return transcript
      .map((t: any) => `${t.role || t.speaker || "?"}: ${t.content || t.text || t.message || ""}`)
      .join("\n");
  }
  if (transcript?.transcript) {
    const segs = Array.isArray(transcript.transcript) ? transcript.transcript : [];
    return segs
      .map((s: any) => `${s.role || "?"}: ${s.message || s.text || ""}`)
      .join("\n");
  }
  if (typeof transcript === "string") return transcript;
  return JSON.stringify(transcript).slice(0, 14000);
}

async function runPrompt(promptText: string): Promise<any> {
  const res = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 3500,
    temperature: 0.2,
    messages: [{ role: "user", content: promptText }],
  });
  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI did not return JSON");
  return JSON.parse(m[0]);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  try {
    const body = await req.json().catch(() => ({}));
    const conversationId = body.conversation_id || null;
    let transcript = body.transcript || null;
    const audioUrl = body.audio_url || null;

    const { data: interview, error } = await supabaseAdmin
      .from("ht_ai_interviews")
      .select("*, ht_candidates(id, name, vacancy_id, ht_vacancies(title, area))")
      .eq("token", token)
      .single();

    if (error || !interview) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    if (isPreviewTestMode()) {
      return previewTestJson("POST /api/headhunting/ai-interview/[token]/finalize");
    }

    // ─── Optimización: si la BD ya tiene transcript cacheado, usarlo ───
    // Evita refetch a ElevenLabs cuando se invoca /finalize otra vez para
    // correr scoring que falló antes (caso típico: rescore-ai-interviews).
    if (!transcript && interview.transcript) {
      transcript = interview.transcript;
      console.log(`[finalize] using cached transcript from BD (${JSON.stringify(transcript).length} chars)`);
    }

    // ─── Fallback: si no llega conversation_id, buscarlo en ElevenLabs ───
    // Si el frontend no logró capturarlo del widget, buscamos la conversación más
    // reciente del agente que esté después del started_at de esta entrevista.
    let convoId = conversationId || interview.conversation_id;
    if (!convoId && interview.agent_id && process.env.ELEVENLABS_API_KEY) {
      try {
        const startedAt = interview.started_at ? new Date(interview.started_at).getTime() : (Date.now() - 60 * 60 * 1000);
        const startedAtUnix = Math.floor(startedAt / 1000);
        const r = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${interview.agent_id}&page_size=20`,
          { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } }
        );
        if (r.ok) {
          const j = await r.json();
          const list = j.conversations || j.history || [];
          // Buscar la conversación que comenzó cerca del started_at de la entrevista
          // y está completada. Tolerancia: ±10 min.
          const TOLERANCE = 10 * 60; // segundos
          const match = list.find((c: any) => {
            const cStart = c.start_time_unix_secs || 0;
            return Math.abs(cStart - startedAtUnix) < TOLERANCE && (c.status === 'done' || c.status === 'completed' || c.status === 'success');
          });
          if (match?.conversation_id) {
            convoId = match.conversation_id;
            console.log(`[finalize] recovered conversation_id from ElevenLabs: ${convoId}`);
          }
        }
      } catch (e) {
        console.error("ElevenLabs fallback lookup failed:", e);
      }
    }

    // If we have conversation_id but no transcript, fetch transcript from ElevenLabs
    if (!transcript && convoId && process.env.ELEVENLABS_API_KEY) {
      try {
        const r = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${convoId}`,
          { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } }
        );
        if (r.ok) {
          transcript = await r.json();
        } else {
          console.error("ElevenLabs fetch transcript failed:", r.status);
        }
      } catch (e) {
        console.error("ElevenLabs transcript fetch error:", e);
      }
    }

    if (!transcript) {
      await supabaseAdmin
        .from("ht_ai_interviews")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          conversation_id: convoId,
          audio_url: audioUrl,
          ai_recommendation: "PENDIENTE",
          ai_summary: "Transcripción no disponible. Revisar manualmente.",
        })
        .eq("id", interview.id);
      return NextResponse.json({ success: true, scored: false, note: "No transcript available" });
    }

    const transcriptText = buildTranscriptText(transcript);
    const candidate = (interview as any).ht_candidates;
    const vacancy = candidate?.ht_vacancies;
    const area = vacancy?.area || "—";
    const roleComps = COMP_BY_AREA[area] ||
      COMP_BY_AREA[vacancy?.title || ""] ||
      ["Conocimiento del rol", "Adaptabilidad"];

    const fillCommon = (p: string) =>
      p
        .replace("{candidate_name}", candidate?.name || "—")
        .replace("{vacancy_title}", vacancy?.title || "—")
        .replace("{vacancy_area}", area)
        .replace("{transcript}", transcriptText.slice(0, 14000));

    const competencyPrompt = fillCommon(COMPETENCY_PROMPT)
      .replace(/\{role_specific_competency_1\}/g, roleComps[0])
      .replace(/\{role_specific_competency_2\}/g, roleComps[1]);

    // Run 3 agents in parallel
    const [generalAnalysis, competencyAnalysis, englishAnalysis] = await Promise.all([
      runPrompt(fillCommon(SCORING_PROMPT)).catch((e) => ({ error: String(e) })),
      runPrompt(competencyPrompt).catch((e) => ({ error: String(e) })),
      runPrompt(fillCommon(ENGLISH_PROMPT)).catch((e) => ({ error: String(e) })),
    ]);

    // Build audio_url proxy if conversation_id available
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";
    const finalAudioUrl = audioUrl ||
      (convoId ? `${baseUrl}/api/headhunting/ai-interview/${token}/audio?cid=${convoId}` : null);

    await supabaseAdmin
      .from("ht_ai_interviews")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        conversation_id: convoId,
        transcript: transcript,
        audio_url: finalAudioUrl,
        // General analysis
        ai_score: generalAnalysis.score ?? null,
        overall_score: generalAnalysis.score ?? null,
        ai_recommendation: generalAnalysis.recommendation ?? "PENDIENTE",
        ai_summary: generalAnalysis.summary ?? null,
        ai_strengths: generalAnalysis.strengths ?? [],
        ai_gaps: generalAnalysis.gaps ?? [],
        ai_red_flags: generalAnalysis.red_flags ?? [],
        // Competencies
        competencies_scores: competencyAnalysis.competencies ?? null,
        competency_score: competencyAnalysis.average_score ?? null,
        // English
        english_level: englishAnalysis.cefr_level ?? "no_evaluated",
        english_score: englishAnalysis.overall_score ?? null,
        english_detail: englishAnalysis,
      })
      .eq("id", interview.id);

    return NextResponse.json({
      success: true,
      scored: true,
      score: generalAnalysis.score,
      competency_score: competencyAnalysis.average_score,
      english_score: englishAnalysis.overall_score,
      english_level: englishAnalysis.cefr_level,
      recommendation: generalAnalysis.recommendation,
      summary: generalAnalysis.summary,
    });
  } catch (err) {
    console.error("ai-interview finalize error:", err);
    return NextResponse.json(
      { error: "Error interno", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
