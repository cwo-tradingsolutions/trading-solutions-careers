import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

// GET /api/headhunting/vacancies?client_id=xxx
export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const clientId = req.nextUrl.searchParams.get('client_id');

    let query = supabaseAdmin
      .from('ht_vacancies')
      .select(`
        *,
        ht_candidates(count)
      `)
      .order('created_at', { ascending: false });

    if (clientId) query = query.eq('client_id', clientId);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ vacancies: data || [] });
  } catch (err) {
    console.error('List vacancies error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// POST /api/headhunting/vacancies — create a new vacancy
export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { client_id, model_id, title, description, area, position_level, ideal_profile, competency_weights } = body;

    if (!client_id || !model_id || !title) {
      return NextResponse.json(
        { error: 'client_id, model_id, y title son requeridos' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('ht_vacancies')
      .insert({
        client_id,
        model_id,
        title,
        description: description || '',
        area: area || '',
        position_level: position_level || 'Operativo',
        ideal_profile: ideal_profile || {},
        competency_weights: competency_weights || {},
        status: 'open',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ vacancy: data }, { status: 201 });
  } catch (err) {
    console.error('Create vacancy error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
