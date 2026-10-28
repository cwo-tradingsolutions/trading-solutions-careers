/**
 * POST /api/agents/market-research
 *
 * Agente que produce un estudio de mercado para una vacante específica
 * de Trading Solutions. Cubre:
 *   - Benchmark salarial (mín / mediana / máx) por geografía
 *   - Oferta y demanda de talento (cuánta gente fit en el mercado)
 *   - Bilingüismo (qué porcentaje del talent pool es bilingüe al nivel
 *     requerido — clave para roles US-facing)
 *   - Competitividad TS vs mercado (somos más bajos/iguales/más altos en
 *     compensación, beneficios, marca, growth)
 *   - Impacto en employer brand
 *   - Acciones concretas para subir competitividad
 *   - Fuentes citadas (con flag de necesita_verificación cuando aplica)
 *
 * Body:
 *   { vacancy_id?: number, role: string, locale: 'colombia'|'latam'|'us_remote'|'global', extras?: string }
 *
 * Returns:
 *   { report: { salary_benchmark, talent_supply, bilingualism, competitiveness, employer_brand_impact, actions, sources }, model }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neon } from "@/lib/sql";
import { getAnthropic } from "@/lib/anthropic";

export const runtime = "nodejs";

const TS_CONTEXT = `
TRADING SOLUTIONS:
- Boutique freight forwarder con operación en >10 países (Maritime, Ground, Air, Customs)
- +300 clientes activos · +52k TEUs marítimos · +500 tons Air & Land
- HQ Barranquilla (Atlántico, Colombia) · operación remota US-facing
- Equipo en crecimiento — talent acquisition agresivo
- Competidores en su nicho logística internacional: Lean Solutions Group (BAQ), DHL Global Forwarding, Kuehne+Nagel, BDP/PSA, Expeditors, CargoMaster, regionales Colombia: Logística Plus, ICONTEC, Dimerco
- Tope salarial actual TS: Inside Sales $4M COP/mes · Pricing $4M · Customer Doc $3M · Lead Finance $6M (cerrada)

EMPLOYER BRAND:
- Enfoque "no vienes a un puesto, construyes tu futuro"
- Beneficios: aprendizaje continuo, exposición internacional, wellness, reconocimiento
- Career site bonito en Vercel (trading-solutions-careers.vercel.app)
- Activación LinkedIn 22-Abr-2026
`.trim();

export async function POST(req: NextRequest) {
  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const role = (body.role || "").toString().trim();
    const locale = (body.locale || "colombia").toString();
    const vacancyId = body.vacancy_id ? parseInt(body.vacancy_id, 10) : null;
    const extras = (body.extras || "").toString();

    if (!role) return NextResponse.json({ error: "missing_role" }, { status: 400 });

    // Pull live vacancy data si vino vacancy_id
    let vacancyContext = "";
    if (vacancyId) {
      try {
        const sql = neon(process.env.DATABASE_URL!);
        const rows = await sql`SELECT * FROM vacancies WHERE id = ${vacancyId} LIMIT 1`;
        if (rows.length > 0) {
          const v = rows[0] as Record<string, unknown>;
          vacancyContext = `\nVACANTE EN TS (datos actuales DB):\n- Título: ${v.title}\n- Departamento: ${v.department}\n- Ubicación: ${v.location}\n- Modalidad: ${v.work_mode}\n- Nivel: ${v.level}\n- Salario rango: ${v.salary_range}\n- Tags: ${v.tags}\n- Requirements: ${(v.requirements as string)?.slice(0, 600)}`;
        }
      } catch { /* sigue sin contexto vivo */ }
    }

    const localeLabels: Record<string, string> = {
      colombia: "Colombia (foco Barranquilla / Atlántico, también Bogotá y Medellín)",
      latam: "Latinoamérica (México, Colombia, Perú, Argentina, Chile)",
      us_remote: "Estados Unidos remoto (talento latam que trabaja para empresas US)",
      global: "Global (incluye Asia, Europa, Norteamérica)",
    };

    const prompt = `Eres un experto senior en Talent Intelligence y Compensation Benchmarking, especializado en logística internacional, freight forwarding y BPO US-facing en LatAm. Tu tarea es producir un ESTUDIO DE MERCADO para que Kelly Castañeda (CHRO de Trading Solutions) decida si su oferta es competitiva.

ROL A INVESTIGAR: ${role}
GEOGRAFÍA: ${localeLabels[locale] ?? locale}
${extras ? `\nCONTEXTO ADICIONAL:\n${extras}` : ""}
${vacancyContext}

CONTEXTO DE TS:
${TS_CONTEXT}

INSTRUCCIONES:
1. Da datos NUMÉRICOS específicos cuando puedas (rangos salariales en COP/USD, % de talent pool bilingüe, días-promedio de time-to-fill, etc).
2. Cuando un dato es estimación o necesita verificación, márcalo con "needs_verification: true" y explica por qué.
3. Cita fuentes plausibles (Indeed, LinkedIn Talent Insights, Computrabajo, OCC México, Glassdoor, Adecco Salary Guide, Thomas Reuters, encuestas Mercer/Korn Ferry, reportes Bumeran/elempleo.com). Si sabes que algo es de un reporte específico, ponlo. Si no, di "industry-typical figure (verify)".
4. Compara TS vs competencia DIRECTA: Lean Solutions Group (boutique BPO BAQ), Liberty Networks, Coupa, Multinacionales Maersk/MSC, BPOs grandes (Concentrix, Teleperformance), BPOs talento bilingüe (Lean, Liberty).
5. El employer brand impact debe responder: ¿Por qué un top performer escogería TS sobre Lean Solutions, sobre una multinacional, sobre quedarse en su empresa actual?
6. Las acciones deben ser CONCRETAS: si TS está bajo en salario, di "subir tope a X COP", no "considerar mejorar compensación".

FORMATO DE SALIDA (JSON estricto):
{
  "executive_summary": "2-3 frases con la lectura general — somos competitivos o no, dónde están los gaps",
  "salary_benchmark": {
    "currency": "COP" | "USD",
    "market_low": number,
    "market_median": number,
    "market_high": number,
    "ts_current": number | null,
    "ts_position": "below" | "competitive" | "above",
    "delta_vs_median_pct": number,
    "needs_verification": boolean,
    "notes": "..."
  },
  "talent_supply": {
    "total_pool_estimated": "..." (e.g. "~3,500 perfiles en BAQ"),
    "qualified_for_role_estimated": "...",
    "competition_for_talent": "low" | "medium" | "high",
    "biggest_local_employers_competing": ["...", "..."],
    "needs_verification": boolean
  },
  "bilingualism": {
    "english_required_level": "B1" | "B2" | "C1" | "advanced" | "native",
    "pct_bilingual_locally": number,
    "pct_at_required_level": number,
    "scarcity_factor": "abundant" | "moderate" | "scarce" | "very_scarce",
    "notes": "..."
  },
  "competitiveness": {
    "vs_lean_solutions": { "salary": "below|competitive|above", "benefits": "...", "brand": "..." },
    "vs_multinacionales": { "salary": "...", "benefits": "...", "brand": "..." },
    "vs_freelance_us_market": { "salary": "...", "feasibility": "..." },
    "overall_score_0_100": number
  },
  "employer_brand_impact": {
    "current_strength": "...",
    "current_weakness": "...",
    "story_to_tell_top_talent": "...",
    "competitive_moat": "..."
  },
  "recommended_actions": [
    { "priority": "high"|"medium"|"low", "action": "...", "expected_impact": "..." }
  ],
  "sources": [
    { "name": "...", "url_hint": "...", "needs_verification": boolean }
  ],
  "alerts": [
    "Frase concreta de ALERTA — algo que Kelly debe saber YA. Por ejemplo: 'BPO bilingüe en BAQ subió 18% en 2025 — TS está 12% bajo mediana'."
  ]
}

Responde SOLO con el JSON.`;

    const anthropic = getAnthropic();
    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      temperature: 0.5,
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
      role,
      locale,
      vacancy_id: vacancyId,
      report: parsed,
      generated_at: new Date().toISOString(),
      model: result.model,
      usage: result.usage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    console.error("market-research error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
