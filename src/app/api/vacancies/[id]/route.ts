import { neon } from "@/lib/sql";
import { requireAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from 'next/server';
import { columnaCierreWebExiste, validarFechasWeb } from "@/lib/vacancy-web-dates";
import { publicStepBody } from "@/lib/candidate-public-error";
import { VACANCY_ADMIN_HEADER, presentVacancyDetail, vacancyAdminRequested } from "@/lib/public-vacancy";

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

    const admin = vacancyAdminRequested(
      request.headers.get(VACANCY_ADMIN_HEADER),
      request.nextUrl.searchParams.get("admin"),
    );
    if (admin) {
      const authError = requireAdmin(request);
      if (authError) return authError;
    }

    const sql = neon(process.env.DATABASE_URL!);
    const vacancy = await sql(
      'SELECT * FROM vacancies WHERE id = $1',
      [vacancyId]
    );
    const presented = presentVacancyDetail(vacancy[0], admin);
    if (presented.status === 404) {
      return NextResponse.json(
        { error: 'Vacancy not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(presented.body, { headers: corsHeaders });
  } catch (error) {
    console.error('GET /api/vacancies/[id] error:', error);
    return NextResponse.json(publicStepBody(), { status: 500, headers: corsHeaders });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const tocaFechas = ["fecha_apertura", "posted_at", "fecha_objetivo", "target_close_date"]
      .some((k) => body[k] !== undefined);
    let avisoFechas: string | null = null;
    const cierreExiste = tocaFechas ? await columnaCierreWebExiste() : false;
    if (tocaFechas) {
      const fechas = await validarFechasWeb(
        body.fecha_apertura ?? body.posted_at,
        body.fecha_objetivo ?? body.target_close_date,
      );
      if (!fechas.ok) {
        return NextResponse.json({ error: fechas.error }, { status: 400, headers: corsHeaders });
      }
      body.posted_at = fechas.apertura;
      if (fechas.objetivo && cierreExiste) body.target_close_date = fechas.objetivo;
      else delete body.target_close_date;
      avisoFechas = fechas.aviso;
    }

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
    if (body.posted_at !== undefined && tocaFechas) {
      updates.push(`posted_at = $${paramCount++}`);
      values.push(body.posted_at);
    }
    if (cierreExiste && body.target_close_date !== undefined && tocaFechas) {
      updates.push(`target_close_date = $${paramCount++}`);
      values.push(body.target_close_date);
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

    return NextResponse.json({ ...result[0], aviso_fechas: avisoFechas }, { headers: corsHeaders });
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
