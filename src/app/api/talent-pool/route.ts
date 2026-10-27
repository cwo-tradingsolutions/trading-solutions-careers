import { neon } from "@/lib/sql";
import { requireAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const skills = searchParams.get('skills');
    const location = searchParams.get('location');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = 'SELECT * FROM talent_pool WHERE 1=1';
    const params: any[] = [];

    if (status) {
      query += ' AND status = $' + (params.length + 1);
      params.push(status);
    }

    if (search) {
      query += ' AND (full_name ILIKE $' + (params.length + 1) + ' OR email ILIKE $' + (params.length + 1) + ' OR "current_role" ILIKE $' + (params.length + 1) + ')';
      params.push(`%${search}%`);
    }

    if (skills) {
      query += ' AND skills ILIKE $' + (params.length + 1);
      params.push(`%${skills}%`);
    }

    if (location) {
      query += ' AND location ILIKE $' + (params.length + 1);
      params.push(`%${location}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const candidates = await sql(query, params);

    return NextResponse.json(
      {
        data: candidates,
        count: candidates.length,
        limit,
        offset,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('GET /api/talent-pool error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch candidates' },
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
      notes,
    } = body;

    // Validate required fields
    if (!full_name || !email) {
      return NextResponse.json(
        { error: 'Full name and email are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Check if email already exists
    const existing = await sql(
      'SELECT id FROM talent_pool WHERE email = $1',
      [email]
    );

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Candidate with this email already exists' },
        { status: 409, headers: corsHeaders }
      );
    }

    const result = await sql(
      `INSERT INTO talent_pool (
        full_name, email, phone, "current_role", years_experience,
        skills, education, languages, location, linkedin_url,
        cv_data, cv_filename, summary, tags, source, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING *`,
      [
        full_name,
        email,
        phone || null,
        current_role || null,
        years_experience || null,
        skills || null,
        education || null,
        languages || null,
        location || null,
        linkedin_url || null,
        cv_data || null,
        cv_filename || null,
        summary || null,
        tags || null,
        source || 'manual',
        notes || null,
      ]
    );

    return NextResponse.json(result[0], { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('POST /api/talent-pool error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create candidate' },
      { status: 500, headers: corsHeaders }
    );
  }
}
