/**
 * GET  /api/headhunting/vacancies/[vacancyId]/rediscover-cv → matches cacheados
 * POST /api/headhunting/vacancies/[vacancyId]/rediscover-cv → corre AI rediscovery
 *
 * Toma todos los candidatos rechazados/no-contratados del CV Bank y los cruza
 * con la vacante. Usa Claude para evaluar fit de cada candidato vs requirements
 * de la posición y devuelve top matches con score 0-100 + reasoning.
 *
 * Cachea resultados en ts_cv_bank_matches para evitar re-cómputo.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import { crearAnthropic } from "@/lib/anthropic";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  _anthropic = crearAnthropic();
  return _anthropic;
}

const MODEL = "claude-sonnet-4-5";

const REDISCOVER_PROMPT = `Eres un experto en talent rediscovery — cruzar candidatos del banco con vacantes nuevas.

VACANTE OBJETIVO:
Título: {vacancy_title}
Área: {vacancy_area}
Nivel: {role_level}
Tipo: {vacancy_type}
Empresa: Trading Solutions (logística internacional, Barranquilla Colombia)

CANDIDATOS DEL BANCO (rechazados de procesos anteriores o que aplicaron a otras vacantes):
{candidates_json}

INSTRUCCIONES:
Para CADA candidato, evaluá su fit con la vacante objetivo. Considera:
- Experiencia relevante al rol (years_experience, current_job_role, current_company, headline)
- Educación y certificaciones (notes)
- Nivel de inglés (english_level)
- Aspiración salarial (salary_aspiration_cop) vs banda esperada del rol
- Ubicación (location) — Barranquilla preferido, otras ciudades de Colombia OK
- Por qué fue rechazado anteriormente (en notes si aplica) — algunas razones (perfil overqualified, no encajaba para esa vacante específica) NO descalifican para una NUEVA vacante.

Devuelve SOLO un JSON estricto con este shape:

{
  "matches": [
    {
      "candidate_id": "<uuid del candidato>",
      "match_score": <number 0-100>,
      "recommendation": "strong" | "possible" | "weak" | "no",
      "reasoning": "<2-3 oraciones · por qué match o no>",
      "strengths": ["<punto fuerte específico>", "..."],
      "concerns": ["<concern específico>", "..."]
    }
  ]
}

REGLAS:
- match_score >= 80 = strong (excelente fit, contactar urgente)
- match_score 60-79 = possible (vale la pena un primer screening)
- match_score 40-59 = weak (sólo si no hay opciones mejores)
- match_score < 40 = no
- Sé estricto: NO infles scores. Reportá honestamente.
- Si un candidato no tiene data suficiente (notes vacíos, sin role/company), score máximo 50.
- NO inventes data: si no podés determinar fit con confianza, da score bajo.
- Output: SOLO el JSON, sin markdown ni texto adicional.`;

export async function GET(
  req: NextRequest,
  { params }: { params: { vacancyId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { vacancyId } = params;

  const { data: matches } = await supabaseAdmin
    .from("ts_cv_bank_matches")
    .select("*, candidate:ht_candidates(id, name, email, current_job_role, current_company, headline, location, salary_aspiration_cop, english_level, stage, status)")
    .eq("vacancy_id", vacancyId)
    .order("match_score", { ascending: false });

  return NextResponse.json({ matches: matches || [], total: matches?.length || 0 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { vacancyId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { vacancyId } = params;

    // 1. Get vacancy info
    const { data: vacancy, error: vErr } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, area, role_level, vacancy_type")
      .eq("id", vacancyId)
      .single();

    if (vErr || !vacancy) {
      return NextResponse.json({ error: "Vacante no encontrada" }, { status: 404 });
    }

    // 2. Get pool: candidates rechazados/contratados de OTRAS vacantes que tengan open_to_rediscovery
    const { data: pool } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, current_job_role, current_company, headline, notes, location, salary_aspiration_cop, english_level, years_experience, seniority_level, stage, vacancy_id")
      .eq("client_id", TS_CLIENT_ID)
      .neq("vacancy_id", vacancyId) // NO los que ya aplicaron a esta vacante
      .in("stage", ["rechazado", "contratado"])
      .eq("open_to_rediscovery", true)
      .limit(50); // Cap para no saturar al AI

    if (!pool || pool.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No hay candidatos en el banco elegibles para rediscovery",
        matches: [],
      });
    }

    // 3. Build prompt — sólo enviamos data esencial para no exceder context
    const candidatesData = pool.map(c => ({
      id: c.id,
      name: c.name,
      role: c.current_job_role,
      company: c.current_job_role && c.current_company ? `${c.current_company}` : null,
      headline: c.headline,
      english: c.english_level,
      salary: c.salary_aspiration_cop,
      location: c.location,
      years: c.years_experience,
      level: c.seniority_level,
      notes_excerpt: c.notes?.slice(0, 300),
    }));

    const prompt = REDISCOVER_PROMPT
      .replace("{vacancy_title}", vacancy.title)
      .replace("{vacancy_area}", vacancy.area || '—')
      .replace("{role_level}", vacancy.role_level || 'entry')
      .replace("{vacancy_type}", vacancy.vacancy_type || 'incremental')
      .replace("{candidates_json}", JSON.stringify(candidatesData, null, 1));

    // 4. Run Claude
    const aiResult = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 6000,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    const text = aiResult.content[0].type === "text" ? aiResult.content[0].text : "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      return NextResponse.json({ error: "AI no devolvió JSON", raw: text.slice(0, 400) }, { status: 502 });
    }

    const result = JSON.parse(m[0]);
    const matches = result.matches || [];

    // 5. Upsert matches en cache
    const upsertPayloads = matches.map((mt: any) => ({
      vacancy_id: vacancyId,
      candidate_id: mt.candidate_id,
      match_score: typeof mt.match_score === 'number' ? Math.max(0, Math.min(100, mt.match_score)) : null,
      match_reasoning: mt.reasoning || null,
      match_strengths: Array.isArray(mt.strengths) ? mt.strengths : [],
      match_concerns: Array.isArray(mt.concerns) ? mt.concerns : [],
      recommendation: ['strong','possible','weak','no'].includes(mt.recommendation) ? mt.recommendation : 'no',
      computed_at: new Date().toISOString(),
    }));

    if (upsertPayloads.length > 0) {
      // Borrar matches viejos de esta vacante
      await supabaseAdmin.from("ts_cv_bank_matches").delete().eq("vacancy_id", vacancyId);
      // Insertar nuevos
      const { error: insErr } = await supabaseAdmin.from("ts_cv_bank_matches").insert(upsertPayloads);
      if (insErr) console.error('cv_bank_matches insert:', insErr);
    }

    return NextResponse.json({
      success: true,
      total_pool: pool.length,
      total_matches: matches.length,
      strong: matches.filter((m: any) => m.recommendation === 'strong').length,
      possible: matches.filter((m: any) => m.recommendation === 'possible').length,
    });
  } catch (err: any) {
    console.error('rediscover-cv error:', err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
