import { neon } from "@/lib/sql";
import { requireAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from 'next/server';
import { validarFechasWeb, columnaCierreWebExiste } from "@/lib/vacancy-web-dates";
import { publicStepBody } from "@/lib/candidate-public-error";
import { presentVacancyList, vacancyListQuery } from "@/lib/public-vacancy";

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
    const admin = requireAdmin(request) === null;
    const query = vacancyListQuery({
      admin,
      status: searchParams.get('status'),
      department: searchParams.get('department'),
    });

    const vacancies = await sql(query.text, query.params);

    return NextResponse.json(presentVacancyList(vacancies, admin), { headers: corsHeaders });
  } catch (error) {
    console.error('GET /api/vacancies error:', error);
    return NextResponse.json(publicStepBody(), { status: 500, headers: corsHeaders });
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

    const fechas = await validarFechasWeb(
      body.fecha_apertura ?? body.posted_at,
      body.fecha_objetivo ?? body.target_close_date,
    );
    if (!fechas.ok) {
      return NextResponse.json({ error: fechas.error }, { status: 400, headers: corsHeaders });
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

    const creada = result[0];
    await sql(`UPDATE vacancies SET posted_at = $1 WHERE id = $2`, [fechas.apertura, creada.id]);
    if (fechas.objetivo && await columnaCierreWebExiste()) {
      await sql(`UPDATE vacancies SET target_close_date = $1 WHERE id = $2`, [fechas.objetivo, creada.id]);
    }

    return NextResponse.json(
      { ...creada, posted_at: fechas.apertura, target_close_date: fechas.objetivo, aviso_fechas: fechas.aviso },
      { status: 201, headers: corsHeaders },
    );
  } catch (error) {
    console.error('POST /api/vacancies error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create vacancy' },
      { status: 500, headers: corsHeaders }
    );
  }
}
