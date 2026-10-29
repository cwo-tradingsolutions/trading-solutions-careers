import { neon } from '@neondatabase/serverless';
import { requireAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from 'next/server';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const candidateId = parseInt(params.id);

    if (isNaN(candidateId)) {
      return NextResponse.json(
        { error: 'Invalid candidate ID' },
        { status: 400, headers: corsHeaders }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);
    const candidate = await sql(
      'SELECT * FROM talent_pool WHERE id = $1',
      [candidateId]
    );

    if (candidate.length === 0) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(candidate[0], { headers: corsHeaders });
  } catch (error) {
    console.error('GET /api/talent-pool/[id] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch candidate' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const candidateId = parseInt(params.id);

    if (isNaN(candidateId)) {
      return NextResponse.json(
        { error: 'Invalid candidate ID' },
        { status: 400, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const {
      full_name,
      email,
      phone,
      current_role,
      years_experience,
      skills,
      education,
      languages,
      location,
      linkedin_url,
      cv_data,
      cv_filename,
      summary,
      tags,
      source,
      status,
      notes,
    } = body;

    const sql = neon(process.env.DATABASE_URL!);

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (full_name !== undefined) {
      updates.push(`full_name = $${paramCount++}`);
      values.push(full_name);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    if (current_role !== undefined) {
      updates.push(`"current_role" = $${paramCount++}`);
      values.push(current_role);
    }
    if (years_experience !== undefined) {
      updates.push(`years_experience = $${paramCount++}`);
      values.push(years_experience);
    }
    if (skills !== undefined) {
      updates.push(`skills = $${paramCount++}`);
      values.push(skills);
    }
    if (education !== undefined) {
      updates.push(`education = $${paramCount++}`);
      values.push(education);
    }
    if (languages !== undefined) {
      updates.push(`languages = $${paramCount++}`);
      values.push(languages);
    }
    if (location !== undefined) {
      updates.push(`location = $${paramCount++}`);
      values.push(location);
    }
    if (linkedin_url !== undefined) {
      updates.push(`linkedin_url = $${paramCount++}`);
      values.push(linkedin_url);
    }
    if (cv_data !== undefined) {
      updates.push(`cv_data = $${paramCount++}`);
      values.push(cv_data);
    }
    if (cv_filename !== undefined) {
      updates.push(`cv_filename = $${paramCount++}`);
      values.push(cv_filename);
    }
    if (summary !== undefined) {
      updates.push(`summary = $${paramCount++}`);
      values.push(summary);
    }
    if (tags !== undefined) {
      updates.push(`tags = $${paramCount++}`);
      values.push(tags);
    }
    if (source !== undefined) {
      updates.push(`source = $${paramCount++}`);
      values.push(source);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(notes);
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400, headers: corsHeaders }
      );
    }

    values.push(candidateId);

    const query = `UPDATE talent_pool SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await sql(query, values);

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(result[0], { headers: corsHeaders });
  } catch (error) {
    console.error('PATCH /api/talent-pool/[id] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update candidate' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const candidateId = parseInt(params.id);

    if (isNaN(candidateId)) {
      return NextResponse.json(
        { error: 'Invalid candidate ID' },
        { status: 400, headers: corsHeaders }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Delete matching results first (foreign key constraint)
    await sql('DELETE FROM matching_results WHERE candidate_id = $1', [candidateId]);

    // Delete the candidate
    const result = await sql(
      'DELETE FROM talent_pool WHERE id = $1 RETURNING *',
      [candidateId]
    );

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { message: 'Candidate deleted successfully', candidate: result[0] },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('DELETE /api/talent-pool/[id] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete candidate' },
      { status: 500, headers: corsHeaders }
    );
  }
}
