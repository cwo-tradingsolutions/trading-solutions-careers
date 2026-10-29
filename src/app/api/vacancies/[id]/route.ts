import { neon } from '@neondatabase/serverless';
import { requireAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from 'next/server';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // Solo lectura para orígenes externos. La escritura exige sesión de HR Admin
  // y no se anuncia acá.
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
    const vacancyId = parseInt(params.id);

    if (isNaN(vacancyId)) {
      return NextResponse.json(
        { error: 'Invalid vacancy ID' },
        { status: 400, headers: corsHeaders }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);
    const vacancy = await sql(
      'SELECT * FROM vacancies WHERE id = $1',
      [vacancyId]
    );

    if (vacancy.length === 0) {
      return NextResponse.json(
        { error: 'Vacancy not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(vacancy[0], { headers: corsHeaders });
  } catch (error) {
    console.error('GET /api/vacancies/[id] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch vacancy' },
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
    const vacancyId = parseInt(params.id);

    if (isNaN(vacancyId)) {
      return NextResponse.json(
        { error: 'Invalid vacancy ID' },
        { status: 400, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const {
      title,
      department,
      location,
      work_mode,
      employment_type,
      description,
      responsibilities,
      requirements,
      preferred_qualifications,
      salary_range,
      status,
      linkedin_url,
    } = body;

    const sql = neon(process.env.DATABASE_URL!);

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (department !== undefined) {
      updates.push(`department = $${paramCount++}`);
      values.push(department);
    }
    if (location !== undefined) {
      updates.push(`location = $${paramCount++}`);
      values.push(location);
    }
    if (work_mode !== undefined) {
      updates.push(`work_mode = $${paramCount++}`);
      values.push(work_mode);
    }
    if (employment_type !== undefined) {
      updates.push(`employment_type = $${paramCount++}`);
      values.push(employment_type);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (responsibilities !== undefined) {
      updates.push(`responsibilities = $${paramCount++}`);
      values.push(responsibilities);
    }
    if (requirements !== undefined) {
      updates.push(`requirements = $${paramCount++}`);
      values.push(requirements);
    }
    if (preferred_qualifications !== undefined) {
      updates.push(`preferred_qualifications = $${paramCount++}`);
      values.push(preferred_qualifications);
    }
    if (salary_range !== undefined) {
      updates.push(`salary_range = $${paramCount++}`);
      values.push(salary_range);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (linkedin_url !== undefined) {
      updates.push(`linkedin_url = $${paramCount++}`);
      values.push(linkedin_url);
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400, headers: corsHeaders }
      );
    }

    values.push(vacancyId);

    const query = `UPDATE vacancies SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await sql(query, values);

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Vacancy not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(result[0], { headers: corsHeaders });
  } catch (error) {
    console.error('PATCH /api/vacancies/[id] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update vacancy' },
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
    const vacancyId = parseInt(params.id);

    if (isNaN(vacancyId)) {
      return NextResponse.json(
        { error: 'Invalid vacancy ID' },
        { status: 400, headers: corsHeaders }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Delete matching results first (foreign key constraint)
    await sql('DELETE FROM matching_results WHERE vacancy_id = $1', [vacancyId]);

    // Delete the vacancy
    const result = await sql(
      'DELETE FROM vacancies WHERE id = $1 RETURNING *',
      [vacancyId]
    );

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Vacancy not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { message: 'Vacancy deleted successfully', vacancy: result[0] },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('DELETE /api/vacancies/[id] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete vacancy' },
      { status: 500, headers: corsHeaders }
    );
  }
}
