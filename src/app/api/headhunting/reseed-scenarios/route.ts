import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrScripts } from "@/lib/admin-scripts-auth";
import { supabaseAdmin } from '@/lib/supabase';
import { TS_SCENARIOS } from '@/lib/headhunting/scenarios-ts';

const MODEL_ID = '186c9e42-5448-40b0-9a87-0f8e8a2f2af0';

export async function POST(req: NextRequest) {
  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdminOrScripts(req);
  if (authError) return authError;

  try {
    // Step 1: Delete all existing scenarios for this model_id
    const { error: deleteError } = await supabaseAdmin
      .from('ht_scenarios')
      .delete()
      .eq('model_id', MODEL_ID);

    if (deleteError) {
      console.error('Error deleting scenarios:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete existing scenarios', details: deleteError.message },
        { status: 500 }
      );
    }

    // Step 2: Prepare scenarios for insertion - replace MODEL placeholder with actual UUID
    const scenariosToInsert = TS_SCENARIOS.map((scenario) => {
      const { options, ...scenarioWithoutOptions } = scenario;
      return {
        ...scenarioWithoutOptions,
        model_id: MODEL_ID,
        // Normalize scenario_type to match database constraint if needed
        scenario_type: scenarioWithoutOptions.scenario_type === 'role_play_mc' ? 'role_play' : scenarioWithoutOptions.scenario_type,
      };
    });

    // Step 3: Insert all scenarios
    const { error: insertError, data } = await supabaseAdmin
      .from('ht_scenarios')
      .insert(scenariosToInsert)
      .select();

    if (insertError) {
      console.error('Error inserting scenarios:', insertError);
      return NextResponse.json(
        { error: 'Failed to insert scenarios', details: insertError.message },
        { status: 500 }
      );
    }

    const insertedCount = data ? data.length : 0;

    return NextResponse.json({
      success: true,
      message: `Successfully reseeded scenarios for model ${MODEL_ID}`,
      inserted_count: insertedCount,
      model_id: MODEL_ID,
      scenarios_count: scenariosToInsert.length,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
