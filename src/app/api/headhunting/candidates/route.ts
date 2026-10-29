import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { validarCanalReclutador } from '@/lib/candidate-source';

// GET /api/headhunting/candidates?vacancy_id=xxx&client_id=xxx
export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const vacancyId = req.nextUrl.searchParams.get('vacancy_id');
    // `clientId` se acepta por compatibilidad: el funnel lo mandó así meses y
    // el filtro se ignoraba en silencio.
    const clientId = req.nextUrl.searchParams.get('client_id') ?? req.nextUrl.searchParams.get('clientId');

    let query = supabaseAdmin
      .from('ht_candidates')
      .select('*, ht_results(match_percentage, recommendation), ht_vacancies(title)')
      .order('created_at', { ascending: false });

    if (vacancyId) query = query.eq('vacancy_id', vacancyId);
    if (clientId) query = query.eq('client_id', clientId);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ candidates: data || [] });
  } catch (err) {
    console.error('List candidates error:', err);
    return NextResponse.json(
      { error: 'Error interno', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// POST /api/headhunting/candidates — create a new candidate
export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { client_id, vacancy_id, name, email, phone, cv_url } = body;

    if (!client_id || !vacancy_id || !name || !email) {
      return NextResponse.json(
        { error: 'client_id, vacancy_id, name, y email son requeridos' },
        { status: 400 }
      );
    }

    const canal = validarCanalReclutador(body.source);
    if (!canal.ok) {
      return NextResponse.json({ error: canal.error }, { status: 400 });
    }

    // Check for duplicate email in same vacancy
    const { data: existing } = await supabaseAdmin
      .from('ht_candidates')
      .select('id')
      .eq('vacancy_id', vacancy_id)
      .eq('email', email)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un candidato con este email para esta vacante' },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('ht_candidates')
      .insert({
        client_id,
        vacancy_id,
        name,
        email,
        phone: phone || null,
        cv_url: cv_url || null,
        status: 'pending',
        source: canal.source,
        stage: 'aplico',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ candidate: data }, { status: 201 });
  } catch (err) {
    console.error('Create candidate error:', err);
    return NextResponse.json(
      { error: 'Error interno', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// PATCH /api/headhunting/candidates?id=xxx — update a candidate
export async function PATCH(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 });

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (body.name) updates.name = body.name;
    if (body.email) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.status) updates.status = body.status;

    const { error } = await supabaseAdmin
      .from('ht_candidates')
      .update(updates)
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Update candidate error:', err);
    return NextResponse.json(
      { error: 'Error interno', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// DELETE /api/headhunting/candidates?id=xxx — delete a candidate and related data
export async function DELETE(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 });

    // Delete related data first
    await supabaseAdmin.from('ht_responses').delete().eq('candidate_id', id);
    await supabaseAdmin.from('ht_results').delete().eq('candidate_id', id);

    const { error } = await supabaseAdmin.from('ht_candidates').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete candidate error:', err);
    return NextResponse.json(
      { error: 'Error interno', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
