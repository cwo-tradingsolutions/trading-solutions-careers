/**
 * POST /api/headhunting/vacancies/[vacancyId]/market-research
 * GET  /api/headhunting/vacancies/[vacancyId]/market-research → último cacheado
 *
 * Genera un estudio de mercado completo para la vacante usando Claude:
 *   - Compensación COP (min/median/max) en mercado Colombia + LATAM remoto
 *   - Tiempos de reclutamiento típicos industria
 *   - Talent pool & demanda
 *   - Skills más demandadas 2026
 *   - Sourcing recommendations (LinkedIn search strings, universidades)
 *   - Riesgos del proceso (counter-offers, drop-off típicos)
 *   - Recomendaciones tácticas (outreach, beneficios a destacar)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import { crearAnthropic } from "@/lib/anthropic";

/**
 * El estudio pide siete secciones en una sola respuesta y tarda del orden de
 * minutos. Esta ruta no declaraba maxDuration, así que corría con el límite por
 * defecto de la plataforma: la función se cortaba a mitad de la generación y
 * quedaba un error genérico después de la espera. 300s es el techo del plan y
 * ya se usa en otra ruta larga del proyecto.
 */
export const maxDuration = 300;

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  _anthropic = crearAnthropic();
  return _anthropic;
}

// Antes: "claude-sonnet-4-20250514" (Sonnet 4, may-2025). Los agentes nuevos
// del ATS ya usan el alias sin fecha, que apunta siempre al modelo vigente —
// un id con fecha se retira eventualmente y el endpoint empieza a devolver
// 500 sin explicación.
const MODEL = "claude-sonnet-4-5";

const MARKET_RESEARCH_PROMPT = `Eres un consultor experto en mercado laboral de logística internacional / freight forwarding en Colombia y LATAM. Conoces a fondo: compensación, tiempos de reclutamiento, talent pool, sourcing, beneficios típicos.

⚠️ INSTRUCCIÓN CRÍTICA SOBRE COMPENSACIÓN:
NO seas conservador. Reporta lo que el mercado REALMENTE pide HOY (2026), no lo que la empresa quisiera pagar. Si el mercado pide más, dilo. La data de aspiraciones reales (cuando esté disponible) es ground truth — úsala como ancla, no la ignores. El base_monthly_max debe reflejar lo que están pidiendo los TOP 25% de candidatos serios para esta posición, NO el promedio.

VACANTE:
- Título: {vacancy_title}
- Área: {vacancy_area}
- Nivel: {role_level}
- Empresa: Trading Solutions (logística internacional, base Barranquilla Colombia, ~70 colaboradores)
- Industria: Freight forwarding, comex, logística internacional

TARGETS DE LA EMPRESA:
- Time-to-fill target: {target_days} días
- Top performers internos perfil promedio: alto IQ (117), alta Conscientiousness (78), bajo Neuroticism (30), inglés B2+

{real_data_block}

Genera un estudio de mercado COMPLETO. Devuelve SOLO un JSON estricto sin texto extra:

{
  "exec_summary": "<3-4 oraciones · qué tan competitivo es buscar este perfil HOY en Colombia, key challenges>",

  "compensation": {
    "currency": "COP",
    "base_monthly_min": <number>,
    "base_monthly_median": <number>,
    "base_monthly_max": <number>,
    "total_annual_min": <number>,
    "total_annual_median": <number>,
    "total_annual_max": <number>,
    "typical_bonuses": ["<tipo de bono>", "..."],
    "benefits_market_standard": ["<beneficio>", "..."],
    "latam_remote_comparison": "<comparación con LATAM remoto si aplica>",
    "sources_referenced": ["<Computrabajo/LinkedIn Salary/Glassdoor/...>"],
    "notes": "<cualquier nota importante de contexto>"
  },

  "recruiting_timeline": {
    "industry_avg_ttf_days_min": <number>,
    "industry_avg_ttf_days_max": <number>,
    "ts_target_days": <number>,
    "comparison": "<está TS por encima/abajo del benchmark, comentario>",
    "candidate_in_market_days_typical": <number>,
    "factors_speeding_up": ["<factor>", "..."],
    "factors_slowing_down": ["<factor>", "..."]
  },

  "talent_landscape": {
    "pool_size_estimate": "<grande/medio/pequeño>",
    "pool_size_explanation": "<por qué>",
    "demand_level": "<alta/media/baja>",
    "supply_demand_balance": "<favorable a empleador / equilibrado / favorable a candidato>",
    "main_competing_companies": ["<empresa>", "..."],
    "active_passive_ratio": "<estimación %active vs %passive talent>",
    "geographic_hotspots": ["<ciudad>", "..."]
  },

  "in_demand_skills_2026": {
    "must_have_technical": ["<skill>", "..."],
    "must_have_soft": ["<skill>", "..."],
    "nice_to_have": ["<skill>", "..."],
    "emerging_trends": ["<tendencia>", "..."]
  },

  "sourcing_strategy": {
    "linkedin_search_strings": [
      "<query LinkedIn Recruiter usable>",
      "<...>"
    ],
    "universities_to_target": ["<universidad>", "..."],
    "industry_associations": ["<asociación>", "..."],
    "communities_groups": ["<grupo/community>", "..."],
    "alternative_channels": ["<canal>", "..."],
    "outreach_message_template": "<mensaje sugerido de 3-4 oraciones para LinkedIn InMail o email frío>"
  },

  "process_risks": {
    "counter_offer_likelihood": "<alta/media/baja>",
    "counter_offer_explanation": "<por qué>",
    "common_dropout_reasons": ["<razón>", "..."],
    "red_flags_in_candidates": ["<red flag>", "..."],
    "negotiation_pain_points": ["<punto de fricción típico>", "..."]
  },

  "tactical_recommendations": {
    "ts_value_props_to_highlight": ["<diferencial TS>", "..."],
    "what_to_avoid_saying": ["<frase/promesa a evitar>", "..."],
    "interview_focus_areas": ["<área a profundizar>", "..."],
    "decision_speed_recommended_days": <number>,
    "salary_negotiation_strategy": "<estrategia recomendada>"
  },

  "competitive_intelligence": {
    "typical_offer_packages": "<descripción del paquete típico de competidores>",
    "ts_advantages": ["<ventaja>", "..."],
    "ts_disadvantages": ["<desventaja>", "..."],
    "differentiators_to_communicate": ["<diferenciador>", "..."]
  }
}

REGLAS:
- Sé ESPECÍFICO con números (rango salarial real Colombia 2026, no genérico)
- Bandas SALARIALES Colombia 2026 actualizadas con data real de aspiraciones LinkedIn (úsalas como mínimo, ajusta hacia arriba si la data inyectada lo justifica):
  · Entry Operativo (Pricing Junior, Customer Doc): 2.5-4.5M COP base
  · Lead técnico (Pricing Sr, Sales Lead): 5-12M COP base (NO uses 5-9M, está obsoleto)
  · Lead People/HR (Talent Acq Lead, HR Lead): 6-15M COP base (perfiles MBA piden 14-18M)
  · Director / Manager: 10-22M COP base
  · C-Suite (CFO, COO, CWO): 18-40M+ COP base, frecuentemente con equity
- Inglés B2+ premium 15-25% sobre base · Inglés C1/Nativo premium 25-40%
- Industria logística freight forwarding tiene oferta limitada vs demanda → mercado favorable al candidato → presionando salarios al alza
- Universidades clave Barranquilla: Universidad del Norte, Universidad del Atlántico, Universidad Tecnológica de Bolívar (Cartagena)
- LinkedIn search strings deben ser usables literalmente en LinkedIn Recruiter
- Si tenés data inyectada de aspiraciones reales → tu base_monthly_max DEBE estar entre el P75 y MAX (excluyendo outliers obvios). Tu base_monthly_median DEBE estar cerca de la mediana real.
- NO inventes data falsa: si no estás seguro, dilo en notes
- Output: SOLO el JSON, sin texto adicional ni markdown`;

export async function GET(
  req: NextRequest,
  { params }: { params: { vacancyId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { vacancyId } = params;
  const { data, error } = await supabaseAdmin
    .from("ts_market_research")
    .select("*")
    .eq("vacancy_id", vacancyId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ research: data });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { vacancyId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { vacancyId } = params;

    const { data: vacancy, error: vErr } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, area, role_level, vacancy_type")
      .eq("id", vacancyId)
      .single();

    if (vErr || !vacancy) {
      return NextResponse.json({ error: "Vacante no encontrada" }, { status: 404 });
    }

    // Target RYS-híbrido por (role_level, vacancy_type)
    const { data: targetRow } = await supabaseAdmin
      .from("ts_targets")
      .select("target_days_to_fill")
      .eq("role_level", vacancy.role_level || "entry")
      .eq("vacancy_type", vacancy.vacancy_type || "incremental")
      .maybeSingle();
    const fallback = vacancy.role_level === 'c_suite'
      ? (vacancy.vacancy_type === 'reemplazo' ? 60 : 80)
      : (vacancy.vacancy_type === 'reemplazo' ? 35 : 50);
    const targetDays = targetRow?.target_days_to_fill || fallback;

    // ── Pull real applicant data para esta vacante (ground truth para la IA) ──
    const { data: candsForVac } = await supabaseAdmin
      .from("ht_candidates")
      .select("name, notes")
      .eq("vacancy_id", vacancyId)
      .not("email", "ilike", "%@tradingsolutions.com");

    const salaries: number[] = [];
    (candsForVac || []).forEach((c: any) => {
      const m = String(c.notes || '').match(/Aspiración salarial:\s*COP\s+([\d.]+)/);
      if (m) {
        const n = Number(m[1].replace(/\./g, ''));
        // Filtrar outliers obvios (typos): <500K o >100M
        if (n >= 500_000 && n <= 100_000_000) salaries.push(n);
      }
    });

    let realDataBlock = "";
    if (salaries.length >= 5) {
      salaries.sort((a, b) => a - b);
      const min = salaries[0];
      const max = salaries[salaries.length - 1];
      const p25 = salaries[Math.floor(salaries.length * 0.25)];
      const p50 = salaries[Math.floor(salaries.length * 0.5)];
      const p75 = salaries[Math.floor(salaries.length * 0.75)];
      const avg = Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length);
      const fmt = (n: number) => `COP ${n.toLocaleString('es-CO')}`;
      realDataBlock = `
🎯 DATA REAL DE ASPIRACIONES SALARIALES (${salaries.length} candidatos que YA aplicaron a ESTA vacante via LinkedIn 2026):
- MIN: ${fmt(min)}
- P25: ${fmt(p25)}
- MEDIANA: ${fmt(p50)}
- P75: ${fmt(p75)}
- MAX: ${fmt(max)}
- PROMEDIO: ${fmt(avg)}

USAR ESTA DATA COMO ANCLA OBLIGATORIA:
- Tu base_monthly_min DEBE estar entre el MIN y P25 (no inventes algo más bajo)
- Tu base_monthly_median DEBE estar cerca de la MEDIANA real (±10%)
- Tu base_monthly_max DEBE estar entre el P75 y MAX (excluyendo outliers únicos)
- Si la data dice algo distinto a las bandas hardcoded en las reglas, GANA la data real
`;
    } else {
      realDataBlock = `(Sin data suficiente de aspiraciones reales para esta vacante — usá las bandas hardcoded de las REGLAS abajo.)`;
    }

    const prompt = MARKET_RESEARCH_PROMPT
      .replace("{vacancy_title}", vacancy.title)
      .replace("{vacancy_area}", vacancy.area || "—")
      .replace("{role_level}", vacancy.role_level || "entry")
      .replace("{target_days}", String(targetDays))
      .replace("{target_days}", String(targetDays))
      .replace("{real_data_block}", realDataBlock);

    const aiResult = await getAnthropic().messages.create({
      model: MODEL,
      // El estudio completo (compensación, timeline, talent pool, sourcing,
      // riesgos, recomendaciones) no cabía en 4500 tokens: la respuesta se
      // cortaba a mitad de camino y el JSON quedaba sin cerrar. El síntoma era
      // un "Expected ',' or '}' in JSON at position ..." que no decía nada.
      max_tokens: 12000,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const text = aiResult.content[0].type === "text" ? aiResult.content[0].text : "";

    // Si se cortó por límite de tokens, decirlo con todas las letras en vez de
    // dejar que reviente el JSON.parse con un error de sintaxis.
    if (aiResult.stop_reason === "max_tokens") {
      return NextResponse.json(
        {
          error: "El estudio se cortó por longitud",
          detail:
            "El modelo llegó al límite de tokens antes de terminar. Volvé a intentar; " +
            "si sigue pasando, hay que subir max_tokens o pedir un estudio más corto.",
        },
        { status: 502 },
      );
    }

    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      return NextResponse.json(
        { error: "La IA no devolvió JSON", detail: text.slice(0, 400) },
        { status: 502 }
      );
    }

    let report: any;
    try {
      report = JSON.parse(m[0]);
    } catch (parseErr: any) {
      // El detalle incluye el pedazo donde se rompió: sin eso, diagnosticar
      // esto significa adivinar.
      const pos = Number(String(parseErr?.message || "").match(/position (\d+)/)?.[1] ?? 0);
      return NextResponse.json(
        {
          error: "La IA devolvió un JSON inválido",
          detail: `${parseErr?.message}. Alrededor del punto de falla: …${m[0].slice(Math.max(0, pos - 120), pos + 120)}…`,
        },
        { status: 502 },
      );
    }

    // Save to cache
    const { data: saved, error: insErr } = await supabaseAdmin
      .from("ts_market_research")
      .insert({
        vacancy_id: vacancyId,
        model: MODEL,
        report: report,
        exec_summary: report.exec_summary,
        comp_min: report.compensation?.base_monthly_min || null,
        comp_median: report.compensation?.base_monthly_median || null,
        comp_max: report.compensation?.base_monthly_max || null,
        ttf_industry_min: report.recruiting_timeline?.industry_avg_ttf_days_min || null,
        ttf_industry_max: report.recruiting_timeline?.industry_avg_ttf_days_max || null,
        talent_pool_size: report.talent_landscape?.pool_size_estimate || null,
      })
      .select()
      .single();

    if (insErr) {
      console.error("save research error:", insErr);
    }

    return NextResponse.json({ success: true, research: saved || { report } });
  } catch (err: any) {
    console.error("market research error:", err);
    // El detail viaja al modal: sin él la pantalla mostraba "Error interno"
    // y no había forma de distinguir una API key faltante de un modelo
    // retirado o de un timeout.
    return NextResponse.json(
      { error: "No se pudo generar el estudio", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
