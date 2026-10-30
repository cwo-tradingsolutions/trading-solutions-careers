// ─── AI Scoring Agent for Headhunting Assessments ─────────────────
// Uses Claude API to analyze role-play responses and generate psychometric scores

import Anthropic from '@anthropic-ai/sdk';
import { crearAnthropic } from "@/lib/anthropic";
import {
  SYSTEM_PROMPT,
  ROLE_PLAY_SCORING_PROMPT,
  NUMERICAL_SCORING_PROMPT,
  ENGLISH_SCORING_PROMPT,
  LIKERT_SCORING_PROMPT,
  MATCH_CALCULATION_PROMPT,
} from './scoring-prompts';
import { TS_BENCHMARK_STATS } from './calibration-data';
import type {
  HtScenario,
  HtResponse,
  AIAnalysis,
  ProfileScores,
  IdealProfile,
} from './types';

// Lazy init del cliente Anthropic: NO instanciar al cargar el módulo
// (si no, el build de Next.js rompe cuando ANTHROPIC_API_KEY no existe
// durante la etapa "Collecting page data").
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  _anthropic = crearAnthropic();
  return _anthropic;
}
const anthropic = new Proxy({} as Anthropic, {
  get(_t, prop) {
    const c = getAnthropic() as unknown as Record<PropertyKey, unknown>;
    const v = c[prop];
    return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(c) : v;
  },
});
const MODEL = 'claude-sonnet-4-5';

// ─── Score a single response ─────────────────────────────────────
export async function scoreResponse(
  scenario: HtScenario,
  response: HtResponse
): Promise<{ analysis: AIAnalysis; scores: Record<string, number>; confidence: number }> {
  // ── Multiple-choice: use option_weights directly (no AI call needed) ──
  if (scenario.scenario_type === 'role_play_mc' && scenario.scoring_rubric.option_weights) {
    return scoreMCResponse(scenario, response);
  }

  // ── Open-text: use AI scoring ──
  const promptTemplate = getPromptForType(scenario.scenario_type);

  const prompt = promptTemplate
    .replace('{scenario_text}', scenario.scenario_text)
    .replace('{response_text}', response.response_text)
    .replace('{time_spent}', String(response.time_spent_seconds))
    .replace('{time_limit}', String(scenario.time_limit_seconds))
    .replace('{rubric_json}', JSON.stringify(scenario.scoring_rubric, null, 2))
    .replace('{target_columns}', JSON.stringify(scenario.target_columns));

  const result = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = result.content[0].type === 'text' ? result.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON');

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    analysis: parsed.analysis,
    scores: parsed.scores,
    confidence: parsed.confidence ?? 0.7,
  };
}

// ─── Score a multiple-choice response using pre-defined option_weights ─
function scoreMCResponse(
  scenario: HtScenario,
  response: HtResponse
): { analysis: AIAnalysis; scores: Record<string, number>; confidence: number } {
  const optionWeights = scenario.scoring_rubric.option_weights!;
  const selectedOption = response.response_data?.selected_option as number | undefined;

  // Default to first option if none selected (shouldn't happen)
  const idx = typeof selectedOption === 'number' && selectedOption >= 0 && selectedOption < optionWeights.length
    ? selectedOption
    : 0;

  const chosen = optionWeights[idx];
  const scores = chosen.maps;

  // Build a lightweight analysis
  const analysis: AIAnalysis = {
    summary: `Candidato eligió opción ${idx + 1} (perfil: ${chosen.profile}). Respuesta evaluada automáticamente por opción seleccionada.`,
    indicators_detected: Object.entries(scores).map(([col, val]) => ({
      indicator: col,
      evidence: `Opción ${idx + 1} seleccionada`,
      strength: (val as number) >= 8 ? 'strong' : (val as number) >= 5 ? 'moderate' : 'weak',
    })),
    behavioral_patterns: [chosen.profile],
    red_flags: [],
  };

  // Time penalty: if candidate answered too fast (<10s) or timed out, reduce confidence
  const timeSpent = response.time_spent_seconds;
  const timeLimit = scenario.time_limit_seconds;
  let confidence = 0.95;
  if (timeSpent < 10) confidence = 0.6; // Too fast — likely random
  if (timeSpent >= timeLimit) confidence = 0.7; // Timed out — auto-advanced

  return { analysis, scores, confidence };
}

// ─── Scale conversion: internal quality (1-10) → real psychometric scales ──
// The MC option_weights use a 1-10 quality scale. Real psychometric scales are:
//   DISC, Big Five, Cognitive (except IQ): 0-100 percentile
//   IQ: 70-145 standard score
//   BETESA (Fi, Bi, Bd, Fd): 40-120 raw
//   McClelland (Logros, Afiliación, Poder): 1.0-5.0
//
// Conversion: quality 7 = benchmark mean; each quality unit = 0.5 std dev
// Then clamp to the valid range for each scale type.

const SCALE_RANGES: Record<string, { min: number; max: number }> = {
  // DISC percentiles
  D: { min: 0, max: 100 }, I: { min: 0, max: 100 }, S: { min: 0, max: 100 }, C: { min: 0, max: 100 },
  // IQ standard score
  IQ: { min: 70, max: 145 },
  // Cognitive percentiles
  'Verbal Comprehension': { min: 0, max: 100 }, 'Attention and Memory': { min: 0, max: 100 },
  'Perceptual Speed': { min: 0, max: 100 }, 'Nonverbal Reasoning': { min: 0, max: 100 },
  // Big Five percentiles
  Agreeableness: { min: 0, max: 100 }, Openness: { min: 0, max: 100 },
  Extraversion: { min: 0, max: 100 }, Conscientiousness: { min: 0, max: 100 }, Neuroticism: { min: 0, max: 100 },
  // BETESA raw
  'Fi Score': { min: 40, max: 120 }, 'Bi Score': { min: 40, max: 120 },
  'Bd Score': { min: 40, max: 120 }, 'Fd Score': { min: 40, max: 120 },
  // McClelland
  Logros_media: { min: 1, max: 5 }, 'Afiliación_media': { min: 1, max: 5 }, Poder_media: { min: 1, max: 5 },
};

function isInternalScale(score: number): boolean {
  // Heuristic: if the score is between 1-10, it's on the internal quality scale
  // Real psychometric scores would be much larger (IQ>70, DISC 0-100, BETESA 40-120)
  return score >= 1 && score <= 10;
}

function convertToRealScales(profile: Record<string, number>): Record<string, number> {
  const converted: Record<string, number> = {};

  for (const [col, rawVal] of Object.entries(profile)) {
    const range = SCALE_RANGES[col];
    const stats = TS_BENCHMARK_STATS[col];

    if (!range || !stats) {
      converted[col] = rawVal;
      continue;
    }

    // McClelland is already on a 1-5 scale in the rubrics; don't convert if plausible
    if (['Logros_media', 'Afiliación_media', 'Poder_media'].includes(col)) {
      if (rawVal >= 1 && rawVal <= 5) {
        converted[col] = Math.round(rawVal * 10) / 10;
        continue;
      }
    }

    // Only convert if the score looks like internal scale (1-10)
    if (!isInternalScale(rawVal)) {
      converted[col] = rawVal;
      continue;
    }

    // Convert: quality 7 ≈ benchmark mean, each unit = 0.75 std dev
    // Using 0.75 creates meaningful spread between good (8) and poor (5) responses
    const realScore = stats.mean + (rawVal - 7) * 0.75 * stats.std;
    const clamped = Math.max(range.min, Math.min(range.max, realScore));
    converted[col] = Math.round(clamped * 10) / 10;
  }

  return converted;
}

// ─── Consolidate all response scores into a full profile ─────────
export function consolidateProfile(
  allScores: { scenario: HtScenario; scores: Record<string, number>; confidence: number }[]
): ProfileScores {
  const columnScores: Record<string, { values: number[]; weights: number[] }> = {};

  for (const { scenario, scores, confidence } of allScores) {
    for (const [col, value] of Object.entries(scores)) {
      if (!columnScores[col]) columnScores[col] = { values: [], weights: [] };
      columnScores[col].values.push(value);
      columnScores[col].weights.push(confidence);
    }
  }

  const rawProfile: Record<string, number> = {};
  for (const [col, data] of Object.entries(columnScores)) {
    const totalWeight = data.weights.reduce((a, b) => a + b, 0);
    const weightedSum = data.values.reduce((sum, v, i) => sum + v * data.weights[i], 0);
    rawProfile[col] = Math.round((weightedSum / totalWeight) * 10) / 10;
  }

  // Convert from internal quality scale (1-10) to real psychometric scales
  const profile = convertToRealScales(rawProfile);

  // Fill missing columns with benchmark mean as fallback
  const allColumns = Object.keys(TS_BENCHMARK_STATS);
  for (const col of allColumns) {
    if (!(col in profile)) {
      profile[col] = TS_BENCHMARK_STATS[col].mean;
    }
  }

  return profile as ProfileScores;
}

// ─── Calculate match percentage ──────────────────────────────────
export async function calculateMatch(
  candidateProfile: ProfileScores,
  idealProfile: IdealProfile,
  competencyWeights: Record<string, number>
): Promise<{
  match_percentage: number;
  match_breakdown: Record<string, { score: number; ideal_min: number; ideal_max: number; match: number }>;
  dimension_scores: Record<string, number>;
  benchmark_comparison: { vs_mean: Record<string, number>; percentile_rank: number };
  red_flags: string[];
  recommendation: 'AVANZA' | 'EN ESPERA' | 'NO AVANZA';
  recommendation_reason: string;
}> {
  const prompt = MATCH_CALCULATION_PROMPT
    .replace('{candidate_profile}', JSON.stringify(candidateProfile, null, 2))
    .replace('{ideal_profile}', JSON.stringify(idealProfile, null, 2))
    .replace('{competency_weights}', JSON.stringify(competencyWeights, null, 2));

  const result = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = result.content[0].type === 'text' ? result.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON for match calculation');

  return JSON.parse(jsonMatch[0]);
}

// ─── Score all responses for a candidate and produce final result ─
export async function scoreCandidate(
  scenarios: HtScenario[],
  responses: HtResponse[],
  idealProfile: IdealProfile,
  competencyWeights: Record<string, number>
): Promise<{
  profile: ProfileScores;
  dimensionScores: Record<string, number>;
  matchResult: Awaited<ReturnType<typeof calculateMatch>>;
}> {
  // Score each response
  const allScores: { scenario: HtScenario; scores: Record<string, number>; confidence: number }[] = [];

  for (const response of responses) {
    const scenario = scenarios.find(s => s.id === response.scenario_id);
    if (!scenario) continue;
    // For MC: check selected_option in response_data; for text: check response_text
    const hasMCAnswer = scenario.scenario_type === 'role_play_mc' && response.response_data?.selected_option !== undefined;
    const hasTextAnswer = !!response.response_text?.trim();
    if (!hasMCAnswer && !hasTextAnswer) continue;

    try {
      const { scores, confidence } = await scoreResponse(scenario, response);
      allScores.push({ scenario, scores, confidence });
    } catch (err) {
      console.error(`Scoring failed for scenario ${scenario.id}:`, err);
    }
  }

  // Consolidate into full profile
  const profile = consolidateProfile(allScores);

  // Calculate dimension scores
  const dimensionScores = calculateDimensionScores(allScores);

  // Calculate match
  const matchResult = await calculateMatch(profile, idealProfile, competencyWeights);

  return { profile, dimensionScores, matchResult };
}

// ─── Helper: calculate dimension-level scores ────────────────────
function calculateDimensionScores(
  allScores: { scenario: HtScenario; scores: Record<string, number>; confidence: number }[]
): Record<string, number> {
  const dimensions: Record<string, number[]> = {};

  for (const { scenario, scores } of allScores) {
    const dim = scenario.block;
    if (!dimensions[dim]) dimensions[dim] = [];

    const values = Object.values(scores);
    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      dimensions[dim].push(avg);
    }
  }

  const result: Record<string, number> = {};
  for (const [dim, values] of Object.entries(dimensions)) {
    result[dim] = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  }

  return result;
}

// ─── Helper: select prompt template by scenario type ─────────────
function getPromptForType(type: string): string {
  switch (type) {
    case 'numerical': return NUMERICAL_SCORING_PROMPT;
    case 'english': return ENGLISH_SCORING_PROMPT;
    case 'likert': return LIKERT_SCORING_PROMPT;
    default: return ROLE_PLAY_SCORING_PROMPT;
  }
}
