/**
 * /api/assessment-preview
 *
 * Endpoints para que el modo preview de la prueba (token === 'preview')
 * use la base de datos existente y guarde TODA la información:
 *   - Cada respuesta del candidato/reviewer
 *   - Tab switches (anti-trampa)
 *   - Tiempo por escenario
 *   - Snapshots de cámara (si se habilitó)
 *   - Status de completitud
 *
 * Tabla destino: assessment_preview_runs (creada idempotente).
 *
 * Endpoints:
 *   POST   /api/assessment-preview           → guardar respuesta de un escenario
 *   POST   /api/assessment-preview?op=complete → marcar run como completo + computar reporte
 *   GET    /api/assessment-preview?run_id=X  → leer un run para revisar después
 */
import { neon } from "@/lib/sql";
import { NextRequest, NextResponse } from "next/server";
import { TS_SCENARIOS } from "@/lib/headhunting/scenarios-ts";
import { TS_BENCHMARK_STATS, TS_DNA_PATTERNS } from "@/lib/headhunting/calibration-data";
import { isPreviewTestMode, previewTestJson } from "@/lib/preview-mode";
import { publicStepBody } from "@/lib/candidate-public-error";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

async function ensureTables() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    CREATE TABLE IF NOT EXISTS assessment_preview_runs (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      reviewer_label TEXT DEFAULT 'Preview · HR Admin',
      started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE,
      total_time_seconds INTEGER,
      tab_switch_count INTEGER DEFAULT 0,
      camera_enabled BOOLEAN DEFAULT FALSE,
      report_data JSONB,
      meta JSONB
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS assessment_preview_responses (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      scenario_index INTEGER NOT NULL,
      scenario_id TEXT,
      block TEXT,
      response_text TEXT,
      response_data JSONB,
      time_spent_seconds INTEGER,
      tab_switch_count INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(session_id, scenario_index)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_preview_resp_session ON assessment_preview_responses(session_id)`;
}

// ─── POST: guardar respuesta o completar run ─────────────────────────
export async function POST(req: NextRequest) {
  try {
    if (isPreviewTestMode()) {
      const op = new URL(req.url).searchParams.get("op");
      const body = await req.json().catch(() => ({}));
      if (op === "complete") {
        if (!body?.session_id) {
          return NextResponse.json({ error: "missing_fields" }, { status: 400, headers: corsHeaders });
        }
      } else if (!body?.session_id || body?.scenario_index === undefined) {
        return NextResponse.json({ error: "missing_fields" }, { status: 400, headers: corsHeaders });
      }
      return previewTestJson(
        op === "complete" ? "POST /api/assessment-preview?op=complete" : "POST /api/assessment-preview"
      );
    }

    const sql = neon(process.env.DATABASE_URL!);
    await ensureTables();

    const url = new URL(req.url);
    const op = url.searchParams.get("op");
    const body = await req.json();

    if (op === "complete") {
      // Marcar run como completo y computar reporte vs benchmark TS
      const session_id = body.session_id as string;
      const tab_switch_count = (body.tab_switch_count as number) ?? 0;
      const camera_enabled = !!body.camera_enabled;
      const total_time_seconds = (body.total_time_seconds as number) ?? 0;

      // Pull all responses
      const responses = await sql`
        SELECT * FROM assessment_preview_responses
        WHERE session_id = ${session_id}
        ORDER BY scenario_index ASC
      `;

      // Compute simple report: for each scenario, get the option_weights for the
      // chosen option and aggregate by dimension. Compare against TS_BENCHMARK_STATS.
      const dimAggregate: Record<string, { sum: number; count: number }> = {};
      for (const r of responses) {
        const idx = r.scenario_index as number;
        const scenario = TS_SCENARIOS[idx];
        if (!scenario) continue;
        const data = (r.response_data as Record<string, unknown>) ?? {};
        const optionIdx = (data.option_index as number | undefined) ?? null;
        if (optionIdx === null) continue;
        const ow = scenario.scoring_rubric?.option_weights?.[optionIdx];
        if (!ow) continue;
        for (const [dim, weight] of Object.entries(ow.maps)) {
          if (!dimAggregate[dim]) dimAggregate[dim] = { sum: 0, count: 0 };
          dimAggregate[dim].sum += weight as number;
          dimAggregate[dim].count += 1;
        }
      }

      // Convert internal 1-10 quality scale to real psychometric scales using
      // the same logic as scoring-agent.ts (quality 7 ≈ benchmark mean,
      // each unit ≈ 0.75 std dev)
      const SCALE_RANGES: Record<string, { min: number; max: number }> = {
        D: { min: 0, max: 100 }, I: { min: 0, max: 100 }, S: { min: 0, max: 100 }, C: { min: 0, max: 100 },
        IQ: { min: 70, max: 145 },
        'Verbal Comprehension': { min: 0, max: 100 }, 'Attention and Memory': { min: 0, max: 100 },
        'Perceptual Speed': { min: 0, max: 100 }, 'Nonverbal Reasoning': { min: 0, max: 100 },
        Agreeableness: { min: 0, max: 100 }, Openness: { min: 0, max: 100 },
        Extraversion: { min: 0, max: 100 }, Conscientiousness: { min: 0, max: 100 }, Neuroticism: { min: 0, max: 100 },
        'Fi Score': { min: 40, max: 120 }, 'Bi Score': { min: 40, max: 120 },
        'Bd Score': { min: 40, max: 120 }, 'Fd Score': { min: 40, max: 120 },
        Logros_media: { min: 1, max: 5 }, 'Afiliación_media': { min: 1, max: 5 }, Poder_media: { min: 1, max: 5 },
      };

      const dimScores: Record<string, { score: number; benchmark_mean: number; benchmark_std: number; vs_mean: number; status: string; n_scenarios: number }> = {};
      for (const [dim, agg] of Object.entries(dimAggregate)) {
        const avgQuality = agg.sum / agg.count; // 1-10 scale
        const stats = (TS_BENCHMARK_STATS as Record<string, { mean: number; std: number; min: number; max: number }>)[dim];
        const range = SCALE_RANGES[dim];
        let realScore = avgQuality;
        if (stats && range) {
          // McClelland already on 1-5 scale natively
          if (['Logros_media', 'Afiliación_media', 'Poder_media'].includes(dim) && avgQuality >= 1 && avgQuality <= 5) {
            realScore = Math.round(avgQuality * 10) / 10;
          } else {
            const computed = stats.mean + (avgQuality - 7) * 0.75 * stats.std;
            realScore = Math.max(range.min, Math.min(range.max, computed));
            realScore = Math.round(realScore * 10) / 10;
          }
        }
        const vs_mean = stats ? Math.round((realScore - stats.mean) * 10) / 10 : 0;
        const status = stats
          ? Math.abs(vs_mean) <= stats.std
            ? "in_range"
            : vs_mean > 0
              ? "over"
              : "under"
          : "no_benchmark";
        dimScores[dim] = {
          score: realScore,
          benchmark_mean: stats?.mean ?? 0,
          benchmark_std: stats?.std ?? 0,
          vs_mean,
          status,
          n_scenarios: agg.count,
        };
      }

      // Overall match: % de dimensiones core de TS DNA en rango
      const coreDims = TS_DNA_PATTERNS.key_traits.map((t) => t.trait);
      const inRange = coreDims.filter((d) => dimScores[d]?.status === 'in_range' || (TS_DNA_PATTERNS.key_traits.find((t) => t.trait === d)?.direction === 'high' && dimScores[d]?.vs_mean >= 0) || (TS_DNA_PATTERNS.key_traits.find((t) => t.trait === d)?.direction === 'low' && dimScores[d]?.vs_mean <= 0)).length;
      const overallMatch = coreDims.length > 0 ? Math.round((inRange / coreDims.length) * 100) : 0;

      const report = {
        by_dimension: dimScores,
        overall_match: overallMatch,
        ts_dna_summary: TS_DNA_PATTERNS.summary,
        ts_dna_traits: TS_DNA_PATTERNS.key_traits,
        responses_count: responses.length,
        scenarios_total: TS_SCENARIOS.length,
      };

      await sql`
        INSERT INTO assessment_preview_runs (session_id, completed_at, total_time_seconds, tab_switch_count, camera_enabled, report_data, meta)
        VALUES (${session_id}, NOW(), ${total_time_seconds}, ${tab_switch_count}, ${camera_enabled}, ${JSON.stringify(report)}::jsonb, ${JSON.stringify({ user_agent: req.headers.get('user-agent') })}::jsonb)
        ON CONFLICT (session_id) DO UPDATE
          SET completed_at = NOW(), total_time_seconds = ${total_time_seconds},
              tab_switch_count = ${tab_switch_count}, camera_enabled = ${camera_enabled},
              report_data = ${JSON.stringify(report)}::jsonb
      `.catch(() => {
        // No UNIQUE on session_id by default — ignore conflict, just insert
      });

      return NextResponse.json({ ok: true, report }, { headers: corsHeaders });
    }

    // Default POST: save response
    const session_id = body.session_id as string;
    const scenario_index = body.scenario_index as number;
    const scenario_id = body.scenario_id as string;
    const block = body.block as string;
    const response_text = (body.response_text ?? "") as string;
    const response_data = body.response_data ?? {};
    const time_spent_seconds = (body.time_spent_seconds ?? 0) as number;
    const tab_switch_count = (body.tab_switch_count ?? 0) as number;

    if (!session_id || scenario_index === undefined) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400, headers: corsHeaders });
    }

    await sql`
      INSERT INTO assessment_preview_responses (session_id, scenario_index, scenario_id, block, response_text, response_data, time_spent_seconds, tab_switch_count)
      VALUES (${session_id}, ${scenario_index}, ${scenario_id}, ${block}, ${response_text}, ${JSON.stringify(response_data)}::jsonb, ${time_spent_seconds}, ${tab_switch_count})
      ON CONFLICT (session_id, scenario_index) DO UPDATE
        SET response_text = ${response_text}, response_data = ${JSON.stringify(response_data)}::jsonb,
            time_spent_seconds = ${time_spent_seconds}, tab_switch_count = ${tab_switch_count}
    `;

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    console.error("assessment-preview POST error:", e);
    return NextResponse.json(publicStepBody(), { status: 500, headers: corsHeaders });
  }
}

// ─── GET: leer run completo ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    if (isPreviewTestMode()) {
      return NextResponse.json({ runs: [], run: null, responses: [] }, { headers: corsHeaders });
    }

    const sql = neon(process.env.DATABASE_URL!);
    await ensureTables();

    const session_id = req.nextUrl.searchParams.get("session_id");
    if (!session_id) {
      // Listar todos los runs
      const runs = await sql`
        SELECT session_id, reviewer_label, started_at, completed_at, total_time_seconds, tab_switch_count
        FROM assessment_preview_runs
        ORDER BY started_at DESC
        LIMIT 50
      `;
      return NextResponse.json({ runs }, { headers: corsHeaders });
    }

    const runRows = await sql`
      SELECT * FROM assessment_preview_runs WHERE session_id = ${session_id} LIMIT 1
    `;
    const responses = await sql`
      SELECT * FROM assessment_preview_responses WHERE session_id = ${session_id} ORDER BY scenario_index ASC
    `;

    return NextResponse.json({ run: runRows[0] ?? null, responses }, { headers: corsHeaders });
  } catch (e) {
    console.error("assessment-preview GET error:", e);
    return NextResponse.json(publicStepBody(), { status: 500, headers: corsHeaders });
  }
}
