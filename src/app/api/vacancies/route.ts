import { neon } from "@/lib/sql";
import { requireAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(request: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const department = searchParams.get('department');

    let query = 'SELECT * FROM vacancies WHERE 1=1';
    const params: any[] = [];

    if (status) {
      query += ' AND status = $' + (params.length + 1);
      params.push(status);
    }

    if (department) {
      query += ' AND department = $' + (params.length + 1);
      params.push(department);
    }

    query += ' ORDER BY created_at DESC';

    const vacancies = await sql(query, params);

    return NextResponse.json(vacancies, { headers: corsHeaders });
  } catch (error) {
    console.error('GET /api/vacancies error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch vacancies' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request: NextRequest) {
  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
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
      linkedin_url,
    } = body;

    // Validate required fields
    if (!title || !department) {
      return NextResponse.json(
        { error: 'Title and department are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);
    const result = await sql(
      `INSERT INTO vacancies (
        title, department, location, work_mode, employment_type,
        description, responsibilities, requirements, preferred_qualifications,
        salary_range, linkedin_url
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) RETURNING *`,
      [
        title,
        department,
        location || null,
        work_mode || null,
        employment_type || null,
        description || null,
        responsibilities || null,
        requirements || null,
        preferred_qualifications || null,
        salary_range || null,
        linkedin_url || null,
      ]
    );

    return NextResponse.json(result[0], { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('POST /api/vacancies error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create vacancy' },
      { status: 500, headers: corsHeaders }
    );
  }
}
