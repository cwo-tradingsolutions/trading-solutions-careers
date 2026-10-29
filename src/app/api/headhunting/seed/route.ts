import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { TS_TOP_PERFORMERS, TS_DNA_PATTERNS } from '@/lib/headhunting/calibration-data';
import { TS_SCENARIOS } from '@/lib/headhunting/scenarios-ts';
import { TS_IDEAL_PROFILES } from '@/lib/headhunting/match-calculator';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

// POST /api/headhunting/seed — Seeds Trading Solutions data
// This creates the client, competency model, vacancies, and scenarios
export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    // 1. Create Trading Solutions as client
    const { data: client, error: clientError } = await supabaseAdmin
      .from('ht_clients')
      .upsert(
        {
          name: 'Trading Solutions',
          industry: 'Logistics / International Trade',
          contact_name: 'Kelly Castaneda',
          contact_email: 'jointheteam@tradingsolutions.com',
          sender_email: 'jointheteam@tradingsolutions.com',
          logo_url: null,
          primary_color: '#2C64ED',
          status: 'active',
        },
        { onConflict: 'name' }
      )
      .select()
      .single();

    if (clientError) {
      // If upsert fails, try insert then select
      const { data: existingClient } = await supabaseAdmin
        .from('ht_clients')
        .select('*')
        .eq('name', 'Trading Solutions')
        .single();

      if (!existingClient) {
        const { data: newClient, error: insertError } = await supabaseAdmin
          .from('ht_clients')
          .insert({
            name: 'Trading Solutions',
            industry: 'Logistics / International Trade',
            contact_name: 'Kelly Castaneda',
            contact_email: 'jointheteam@tradingsolutions.com',
            sender_email: 'jointheteam@tradingsolutions.com',
            logo_url: null,
            primary_color: '#2C64ED',
            status: 'active',
          })
          .select()
          .single();

        if (insertError) {
          return NextResponse.json({ error: 'Error creating client: ' + insertError.message }, { status: 500 });
        }
        var tsClient = newClient;
      } else {
        var tsClient = existingClient;
      }
    } else {
      var tsClient = client;
    }

    const clientId = tsClient.id;

    // 2. Create competency model
    const dimensions = [
      {
        name: 'Cognitivo',
        key: 'cognitivo',
        weight: 1.0,
        competencies: [
          { key: 'razonamiento_numerico', label: 'Razonamiento Numérico', mandate: 'Mandato Math', target_columns: ['IQ', 'Perceptual Speed', 'Nonverbal Reasoning'] },
          { key: 'english', label: 'Inglés', mandate: 'Mandato Inglés', target_columns: ['Verbal Comprehension'] },
          { key: 'tecnologico', label: 'Pensamiento Analítico', mandate: 'Mandato Tecnológico', target_columns: ['IQ', 'Attention and Memory'] },
        ],
      },
      {
        name: 'Comportamental',
        key: 'comportamental',
        weight: 1.0,
        competencies: [
          { key: 'liderazgo', label: 'Liderazgo bajo Presión', mandate: 'Workaholic', target_columns: ['D', 'Conscientiousness', 'Poder_media'] },
          { key: 'trabajo_equipo', label: 'Trabajo en Equipo', mandate: 'No Víctima', target_columns: ['I', 'S', 'Agreeableness'] },
          { key: 'adaptabilidad', label: 'Adaptabilidad', mandate: 'Necesidad', target_columns: ['Openness', 'S'] },
          { key: 'gestion_errores', label: 'Gestión de Errores', mandate: 'Gestión/Agency', target_columns: ['C', 'Conscientiousness', 'Neuroticism'] },
        ],
      },
      {
        name: 'Carácter',
        key: 'caracter',
        weight: 1.0,
        competencies: [
          { key: 'etica_trabajo', label: 'Ética de Trabajo', mandate: 'Workaholic', target_columns: ['Conscientiousness', 'Logros_media'] },
          { key: 'accountability', label: 'Accountability', mandate: 'No Víctima', target_columns: ['D', 'Neuroticism', 'C'] },
          { key: 'autogestion', label: 'Autogestión', mandate: 'Gestión/Agency', target_columns: ['Conscientiousness', 'Fi Score'] },
          { key: 'competitividad', label: 'Competitividad', mandate: 'Competitivo', target_columns: ['D', 'Poder_media', 'Logros_media'] },
          { key: 'instinto_comercial', label: 'Instinto Comercial', mandate: 'Vendían cosas', target_columns: ['I', 'Fd Score', 'Extraversion'] },
        ],
      },
      {
        name: 'Bienestar + Trayectoria',
        key: 'bienestar_trayectoria',
        weight: 1.0,
        competencies: [
          { key: 'estabilidad_emocional', label: 'Estabilidad Emocional', mandate: 'Salud Mental', target_columns: ['Neuroticism', 'Agreeableness'] },
          { key: 'valores_proposito', label: 'Valores y Propósito', mandate: 'Valores y Propósito', target_columns: ['Afiliación_media'] },
          { key: 'logros_academicos', label: 'Logros Académicos', mandate: 'Becas/Honores', target_columns: ['Logros_media', 'IQ'] },
          { key: 'pensamiento_creativo', label: 'Pensamiento Creativo', mandate: 'Creativa', target_columns: ['Openness', 'Bd Score'] },
        ],
      },
    ];

    const { data: model, error: modelError } = await supabaseAdmin
      .from('ht_competency_models')
      .insert({
        client_id: clientId,
        name: 'Modelo Trading Solutions — 4 Dimensiones',
        dimensions,
        benchmark_profiles: TS_TOP_PERFORMERS,
        scoring_config: { model: 'claude-sonnet-4-20250514', temperature: 0.3, max_tokens: 2000 },
        is_active: true,
      })
      .select()
      .single();

    if (modelError) {
      return NextResponse.json({ error: 'Error creating model: ' + modelError.message }, { status: 500 });
    }

    const modelId = model.id;

    // 3. Create 4 vacancies
    const vacancyConfigs = [
      { key: 'Pricing Junior', title: 'Pricing Junior', area: 'Operations', level: 'Operativo' },
      { key: 'Pricing Senior', title: 'Pricing Senior', area: 'Operations', level: 'Tactico' },
      { key: 'Customer Documentation', title: 'Customer Documentation', area: 'Finance', level: 'Tactico' },
      { key: 'In Site Sales Support', title: 'In Site Sales Support', area: 'Sales', level: 'Tactico' },
    ];

    const createdVacancies: Record<string, string> = {};

    for (const vc of vacancyConfigs) {
      const profile = TS_IDEAL_PROFILES[vc.key];
      if (!profile) continue;

      const { data: vacancy, error: vacError } = await supabaseAdmin
        .from('ht_vacancies')
        .insert({
          client_id: clientId,
          model_id: modelId,
          title: vc.title,
          description: `Vacante ${vc.title} en Trading Solutions`,
          area: vc.area,
          position_level: vc.level,
          ideal_profile: profile.ideal,
          competency_weights: profile.weights,
          status: 'open',
        })
        .select()
        .single();

      if (vacancy) {
        createdVacancies[vc.key] = vacancy.id;
      }
    }

    // 4. Create scenarios (replacing __MODEL_ID__ with actual model ID)
    const scenariosToInsert = TS_SCENARIOS.map(s => ({
      ...s,
      model_id: modelId,
    }));

    const { error: scenError } = await supabaseAdmin
      .from('ht_scenarios')
      .insert(scenariosToInsert);

    if (scenError) {
      return NextResponse.json({
        error: 'Error creating scenarios: ' + scenError.message,
        partial: { clientId, modelId, vacancies: createdVacancies },
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      client_id: clientId,
      model_id: modelId,
      vacancies: createdVacancies,
      scenarios_created: scenariosToInsert.length,
      message: 'Trading Solutions data seeded successfully',
    });
  } catch (err) {
    console.error('Seed error:', err);
    return NextResponse.json({ error: 'Error interno: ' + String(err) }, { status: 500 });
  }
}
