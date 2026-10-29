import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { token, scenario_id, response_text, response_data, time_spent_seconds, is_final,
      tab_switch_count, tab_switch_events, camera_snapshots_count } = body;

    // Merge proctoring data into response_data so it persists without schema changes
    const enrichedData = {
      ...(response_data || {}),
      ...(tab_switch_count !== undefined && { _proctoring: {
        tab_switch_count: tab_switch_count || 0,
        tab_switch_events: tab_switch_events || [],
        camera_snapshots_count: camera_snapshots_count || 0,
      }}),
    };

    if (!token || !scenario_id) {
      return NextResponse.json({ error: 'Token y scenario_id requeridos' }, { status: 400 });
    }

    // Validate token and session
    const { data: candidate } = await supabaseAdmin
      .from('ht_candidates')
      .select('id, status')
      .eq('assessment_token', token)
      .single();

    if (!candidate || candidate.status !== 'in_progress') {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 403 });
    }

    // Check if response already exists (upsert logic)
    const { data: existing } = await supabaseAdmin
      .from('ht_responses')
      .select('id')
      .eq('candidate_id', candidate.id)
      .eq('scenario_id', scenario_id)
      .single();

    if (existing) {
      // Update existing response — solo actualizar time_spent_seconds si viene
      // explícitamente. Si no viene, preservar el valor que ya tenía el row
      // (evita sobreescribir el tiempo correcto por-escenario con cero/total).
      const updates: Record<string, unknown> = {
        response_text: response_text || '',
        response_data: Object.keys(enrichedData).length > 0 ? enrichedData : null,
        is_final: is_final || false,
      };
      if (time_spent_seconds !== undefined && time_spent_seconds !== null) {
        updates.time_spent_seconds = time_spent_seconds;
      }
      const { error } = await supabaseAdmin
        .from('ht_responses')
        .update(updates)
        .eq('id', existing.id);

      if (error) {
        console.error('Save update error:', error);
        return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
      }
    } else {
      // Insert new response
      const { error } = await supabaseAdmin
        .from('ht_responses')
        .insert({
          candidate_id: candidate.id,
          scenario_id,
          response_text: response_text || '',
          response_data: Object.keys(enrichedData).length > 0 ? enrichedData : null,
          time_spent_seconds: time_spent_seconds ?? 0,
          is_final: is_final || false,
        });

      if (error) {
        console.error('Save insert error:', error);
        return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
      }
    }

    return NextResponse.json({ saved: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Assessment save error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
