/**
 * CV Parser Agent — Claude AI
 *
 * Lee el texto de un CV (o perfil de candidato) y devuelve JSON estructurado
 * con skills INFERIDAS (no solo literales), años de experiencia, educación,
 * idiomas, industrias, títulos, fortalezas.
 *
 * Diferencial vs Magneto/bolsas: extrae skills implícitas.
 * "Manejé base de 500K clientes en Tigo" → ["SQL", "CRM", "retail telco", "análisis de datos"]
 *
 * Costo estimado: ~$0.03 USD por CV con claude-haiku-4-5 · ~$0.15 con sonnet-4-6
 */
import Anthropic from "@anthropic-ai/sdk";
import { crearAnthropic } from "@/lib/anthropic";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  _client = crearAnthropic();
  return _client;
}

// Usar Haiku para este parser: es 5x más barato que Sonnet y suficiente
// para extracción estructurada. Si la precisión falla en casos borde,
// se puede subir a sonnet-4-6 para CVs senior.
const PARSER_MODEL = "claude-haiku-4-5-20251001";

export type ParsedCV = {
  // Identificación del profesional
  current_title: string | null;        // "Senior Pricing Analyst"
  seniority: "entry" | "mid" | "senior" | "lead" | "unknown";
  years_experience: number | null;      // total de años profesionales

  // Skills — el diferencial: inferidas, no solo literales
  skills_hard: string[];                // técnicas: Excel, SQL, Python, SAP
  skills_soft: string[];                // comportamentales: liderazgo, negociación
  skills_inferred: string[];            // las que el CV NO dice pero se deducen del contexto

  // Educación
  education_level: "bachiller" | "tecnico" | "tecnologo" | "pregrado" | "posgrado" | "maestria" | "doctorado" | "unknown";
  education_field: string | null;        // "Ingeniería Industrial", "Comercio Internacional"
  institutions: string[];                // ["Uninorte", "EAFIT"]

  // Idiomas
  languages: Array<{ language: string; level: "basico" | "intermedio" | "avanzado" | "nativo" }>;

  // Contexto profesional
  industries: string[];                  // ["logística", "retail telco", "energía"]
  titles_held: string[];                 // histórico de cargos
  years_in_current_role: number | null;
  companies_worked: string[];            // marcas importantes

  // Valor narrativo
  strengths: string[];                   // 3-5 fortalezas destacables
  red_flags: string[];                   // gaps, job hopping, sin experiencia relevante

  // Resumen ejecutivo para el recruiter
  summary: string;                       // 1-2 líneas, accionable

  // Meta
  parse_confidence: "alta" | "media" | "baja";
  parse_notes: string | null;            // nota libre del parser (p.e. "CV muy corto, pocos datos")
};

const SYSTEM_PROMPT = `Eres un analista senior de talento humano especializado en extracción estructurada de información profesional.

Tu trabajo: leer el perfil de un candidato (CV, notas de reclutamiento, o ambos) y devolver JSON estructurado con campos que un recruiter experto identificaría.

REGLAS CRÍTICAS:
1. Responde SIEMPRE con JSON válido que cumpla el schema. Nada de texto adicional, nada de markdown fences.
2. skills_inferred: Skills que el CV NO menciona literalmente pero que se DEDUCEN del contexto. Ej: "manejé facturación de 10M USD mensuales" → inferir "contabilidad", "finanzas", "análisis financiero". Sé conservador pero asertivo.
3. seniority: inferir de años de experiencia + cargos. entry = 0-2 años, mid = 3-5, senior = 6-10, lead = 10+ con rol de liderazgo.
4. Si un campo no se puede determinar, usar null (para singulares) o [] (para arrays). NUNCA inventar datos.
5. parse_confidence: alta si CV completo y claro · media si parcial · baja si son solo 2-3 líneas.
6. summary: máximo 200 caracteres, debe ser ACCIONABLE para un recruiter ("3 años en pricing telco, domina Excel y SQL, nivel intermedio de inglés — fit para roles mid de pricing").
7. strengths / red_flags: máximo 3 cada uno, concretos y basados en evidencia del texto.
8. Idiomas: inferir nivel si no es explícito. Ej: "trabajé 2 años en UK" → inglés avanzado.

Output JSON schema exacto:
{
  "current_title": string|null,
  "seniority": "entry"|"mid"|"senior"|"lead"|"unknown",
  "years_experience": number|null,
  "skills_hard": string[],
  "skills_soft": string[],
  "skills_inferred": string[],
  "education_level": "bachiller"|"tecnico"|"tecnologo"|"pregrado"|"posgrado"|"maestria"|"doctorado"|"unknown",
  "education_field": string|null,
  "institutions": string[],
  "languages": [{"language": string, "level": "basico"|"intermedio"|"avanzado"|"nativo"}],
  "industries": string[],
  "titles_held": string[],
  "years_in_current_role": number|null,
  "companies_worked": string[],
  "strengths": string[],
  "red_flags": string[],
  "summary": string,
  "parse_confidence": "alta"|"media"|"baja",
  "parse_notes": string|null
}`;

function buildUserPrompt(candidateText: string, candidateName: string): string {
  return `Perfil del candidato a analizar:

Nombre: ${candidateName}

Texto del CV / notas de reclutamiento:
---
${candidateText}
---

Devuelve el JSON estructurado siguiendo el schema exacto.`;
}

/**
 * Parsea un CV/perfil de candidato y devuelve JSON estructurado.
 * Si Claude no devuelve JSON válido, lanza error (que el endpoint atrapa).
 */
export async function parseCV(
  candidateName: string,
  candidateText: string
): Promise<ParsedCV> {
  const client = getClient();

  // Si el texto está vacío o muy corto, devolver un parse mínimo sin gastar tokens
  if (!candidateText || candidateText.trim().length < 30) {
    return {
      current_title: null,
      seniority: "unknown",
      years_experience: null,
      skills_hard: [],
      skills_soft: [],
      skills_inferred: [],
      education_level: "unknown",
      education_field: null,
      institutions: [],
      languages: [],
      industries: [],
      titles_held: [],
      years_in_current_role: null,
      companies_worked: [],
      strengths: [],
      red_flags: ["CV o perfil demasiado corto para evaluar"],
      summary: "Sin datos suficientes en el perfil.",
      parse_confidence: "baja",
      parse_notes: "texto < 30 chars",
    };
  }

  const response = await client.messages.create({
    model: PARSER_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(candidateText, candidateName) }],
  });

  const text = response.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();

  // Remover cualquier fence markdown que Claude haya puesto por accidente
  const jsonText = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: ParsedCV;
  try {
    parsed = JSON.parse(jsonText) as ParsedCV;
  } catch (e) {
    throw new Error(
      `Parser returned invalid JSON. First 300 chars: ${jsonText.slice(0, 300)}`
    );
  }

  return parsed;
}

/**
 * Construye el texto de entrada para el parser a partir de una fila
 * de talent_pool. Combina CV (si existe) + notas + summary + tags + campos
 * estructurados. Así el parser funciona incluso si no hay PDF todavía.
 */
export function buildCandidateText(row: {
  full_name?: string | null;
  current_role?: string | null;
  years_experience?: number | null;
  skills?: string | null;
  education?: string | null;
  languages?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  cv_data?: string | null;
  summary?: string | null;
  tags?: string | null;
  notes?: string | null;
}): string {
  const parts: string[] = [];

  if (row.current_role) parts.push(`Cargo actual: ${row.current_role}`);
  if (row.years_experience != null) parts.push(`Años de experiencia: ${row.years_experience}`);
  if (row.location) parts.push(`Ubicación: ${row.location}`);
  if (row.linkedin_url) parts.push(`LinkedIn: ${row.linkedin_url}`);
  if (row.education) parts.push(`Educación: ${row.education}`);
  if (row.languages) parts.push(`Idiomas: ${row.languages}`);
  if (row.skills) parts.push(`Skills declaradas: ${row.skills}`);
  if (row.tags) parts.push(`Tags: ${row.tags}`);
  if (row.summary) parts.push(`Resumen: ${row.summary}`);
  if (row.notes) parts.push(`Notas de reclutamiento:\n${row.notes}`);
  if (row.cv_data) {
    // cv_data puede ser texto plano o base64 de PDF. Por ahora solo tomamos texto.
    // Cuando tengamos PDFs reales, acá se llamará pdf-parse.
    const cvPreview = row.cv_data.length > 8000 ? row.cv_data.slice(0, 8000) + "\n[...truncado]" : row.cv_data;
    parts.push(`CV:\n${cvPreview}`);
  }

  return parts.join("\n\n");
}
