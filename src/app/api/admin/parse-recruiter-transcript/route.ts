/**
 * POST /api/admin/parse-recruiter-transcript
 *
 * Recibe un transcript de entrevista con recruiter y devuelve la evaluación
 * estructurada contra los 16 mandatos del CEO. Kelly revisa y aprueba antes
 * de que se guarde como assessment final.
 *
 * Body: { transcript: string, candidate_id?: string }
 * Response: { mandate_scores, mandate_evidence, mandate_quotes, english_*, verdict, ... }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAnthropic } from "@/lib/anthropic";
import { CEO_MANDATES } from "@/lib/ceo-mandates";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min · transcripts largos + claude sonnet pueden tomar 60-90s

const SYSTEM_PROMPT = `Eres un analista experto en talento que evalúa transcripts de entrevistas de recruiter contra los 16 mandatos del CEO de Trading Solutions. Tu trabajo es objetivo, preciso, y SIEMPRE basado en evidencia textual del transcript · NO inventas, NO asumes.

# Los 16 mandatos del CEO

${CEO_MANDATES.map(m => `${m.num}. **${m.label}** · ${m.description}${m.dataOnly ? " · NO ES CRITERIO DE SELECCIÓN, solo registrar data si surge orgánico." : ""}`).join("\n")}

# Cómo evaluar cada mandato

Para cada uno de los 16, asigna un score:
- **"pass"** · evidencia clara y reciente del transcript de que cumple.
- **"partial"** · señal pero falta profundidad o consistencia. Respuesta de manual sin ejemplo concreto cuenta como parcial.
- **"fail"** · evidencia explícita de que NO cumple, o respuesta que CONTRADICE el mandato (ej: "siempre pido permiso" cuando se pregunta por Agency).
- **"data"** · solo aplica al mandato 12 (Religiosa) si surge orgánico · es solo data, no criterio.
- **"not_probed"** · el tema no se tocó en el transcript · no se puede evaluar.

**REGLA CRÍTICA · diferencia entre "fail" y "not_probed":**
- "fail" = el candidato DIJO algo que contradice el mandato O respondió a la pregunta sin alcanzar el estándar.
- "not_probed" = el recruiter NO preguntó por este mandato O el candidato no tuvo oportunidad de responder.

**Si tu evidencia es "no hay evidencia de X" o "no se exploró Y" o no podés citar nada literal del transcript · es "not_probed", NUNCA "fail".** Ausencia de evidencia NO es contra-evidencia.

Ejemplos:
- Si el recruiter NO preguntó si vendió cosas de joven → "not_probed", NO "fail"
- Si el candidato dijo "no me gustan las ventas, nunca vendí nada" → "fail" (contradice explícitamente)
- Si el candidato pivoteó la respuesta sin contestar → "partial" (intentó pero superficial)

# Reglas críticas

1. NUNCA inventes evidencia. Si el mandato no se probó, di "not_probed".
2. Para cada mandato (excepto not_probed), incluye:
   - **evidence**: 1-2 frases con qué dijo o demostró el candidato (en tus palabras).
   - **quote**: cita literal del transcript que respalda la evaluación, máximo 200 caracteres.

3. **REGLAS ESPECIALES MANDATO 3 (English)** · sé CONSERVADOR · el recruiter ESCUCHÓ al candidato en vivo, tú solo lees texto.

   **NO penalizar:**
   - Tag questions ("right?", "you know", "well") · son nativo/conversacional, NO errores
   - Brevedad cuando es apropiada para la pregunta
   - Casual speech y contracciones ("gonna", "wanna", "kinda") · son nativo
   - Errores menores de preposición (in/on/at) si el significado es claro
   - Acentos regionales · NO puedes inferir acento desde texto

   **NUNCA INVENTES:**
   - Pausas largas, hesitaciones, "buscando palabras" · NO puedes medir esto desde solo texto sin timestamps
   - Pronunciación · no la escuchas
   - Confianza/nervios · solo se ven en lo no-verbal

   **Default a "pass" si:**
   - Sostuvo conversación en inglés sin pedir constantemente cambio a español
   - Las frases son comprensibles (aunque sean cortas o casuales)
   - Respondió a varias preguntas en inglés con sentido coherente

   **Marca "partial" SOLO si:**
   - Tuvo que volver a español varias veces porque no entendió
   - Frases fragmentarias que NO transmiten significado completo
   - Vocabulario técnico ausente cuando la pregunta era explícitamente técnica

   **Marca "fail" SOLO si:**
   - No pudo sostener ni 2-3 frases coherentes en inglés
   - Respondió en español a preguntas hechas en inglés (sin intentar EN)
   - Frases incomprensibles tipo "I'm responsibility, I'm strong, I'm easy communication" (palabras sueltas sin gramática)

   **Si el verdict es ambiguo · siempre defer a "pass" o "partial" antes que "fail"** · porque el recruiter es quien tiene el ground truth oral.

4. Para el mandato 12 (Religiosa) · si surge orgánico, score = "data"; si no, "not_probed". NUNCA es pass/partial/fail.

5. **Verdict global** debe ser uno de:
   - "strong_yes" · 9+ pass, 0-1 fail crítico, mandatos clave (English, No víctima, Comunicador, Agency) en pass
   - "maybe" · mezcla de pass/partial, 1-2 fails NO bloqueadores, requiere validación adicional
   - "no" · 3+ fails o un fail bloqueador (ej: English fail para rol con clientes internacionales, victimismo, comunicación deficiente)

6. **pass_reasons** y **fail_reasons** deben ser frases concretas con nombre de mandato y evidencia, no genéricas.

7. **next_filter_probes** · qué validar en la siguiente etapa (CWO interview), 2-4 puntos accionables.

8. **Recordá que el recruiter es la fuente de verdad** · tu output es un primer draft que el recruiter va a revisar y ajustar. Si tienes duda entre dos scores adyacentes, elige el más generoso · es mejor que el recruiter baje un score a que lo suba (porque si lo bajas mal, queda sesgo guardado).

9. Tu output debe ser SOLO un JSON válido, sin markdown, sin explicación adicional.

# Formato de output (JSON estricto)

{
  "mandate_scores": { "1": "pass" | "partial" | "fail" | "data" | "not_probed", ... },
  "mandate_evidence": { "1": "string corta con la evidencia", ... },
  "mandate_quotes": { "1": "cita literal", ... },
  "english_declared": "string · nivel que el candidato declaró en el cuestionario, si aparece en transcript",
  "english_real": "string · nivel real evidenciado por el test en vivo (A1/A2/B1/B2/C1/C2)",
  "english_evidence": "string · 1-2 frases describiendo el desempeño en inglés",
  "english_verdict": "pass" | "gap" | "fail",
  "verdict": "strong_yes" | "maybe" | "no",
  "verdict_summary": "frase corta de cierre · 1 línea",
  "pass_reasons": ["razón 1 con mandato", "razón 2", ...],
  "fail_reasons": ["razón 1 con mandato", "razón 2", ...],
  "next_filter_probes": ["qué validar en CWO 1", "qué validar 2", ...],
  "duration_minutes": number | null
}`;

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { transcript, candidate_id } = await req.json();

    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 100) {
      return NextResponse.json(
        { error: "Transcript demasiado corto · pega el transcript completo (al menos 100 chars)" },
        { status: 400 }
      );
    }

    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analiza este transcript de entrevista con recruiter y devuélveme el JSON estructurado con la evaluación de los 16 mandatos:\n\n---TRANSCRIPT---\n${transcript}\n---END TRANSCRIPT---`,
        },
      ],
    });

    // Extraer texto de la respuesta
    const rawText = response.content
      .filter(b => b.type === "text")
      .map(b => (b as any).text)
      .join("\n")
      .trim();

    // Limpiar wraps de markdown json si los hay
    let jsonText = rawText;
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error("LLM output no parseable:", rawText.slice(0, 500));
      return NextResponse.json(
        { error: "El LLM devolvió output mal formateado · reintenta", raw: rawText.slice(0, 500) },
        { status: 500 }
      );
    }

    // Validar estructura mínima
    if (!parsed.mandate_scores || !parsed.verdict) {
      return NextResponse.json(
        { error: "Output del LLM incompleto", parsed },
        { status: 500 }
      );
    }

    // Asegurar que todos los 16 mandatos tienen score (default not_probed)
    for (const m of CEO_MANDATES) {
      const k = String(m.num);
      if (!parsed.mandate_scores[k]) parsed.mandate_scores[k] = "not_probed";
      if (!parsed.mandate_evidence) parsed.mandate_evidence = {};
      if (!parsed.mandate_evidence[k]) parsed.mandate_evidence[k] = "";
      if (!parsed.mandate_quotes) parsed.mandate_quotes = {};
      if (!parsed.mandate_quotes[k]) parsed.mandate_quotes[k] = "";
    }

    return NextResponse.json({
      success: true,
      candidate_id: candidate_id || null,
      ai_model_version: "claude-sonnet-4-5",
      ...parsed,
    });
  } catch (err: any) {
    console.error("parse-recruiter-transcript error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
