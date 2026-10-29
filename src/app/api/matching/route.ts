import { neon } from '@neondatabase/serverless';
import { requireAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from 'next/server';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Simple text matching algorithm
function calculateMatchScore(
  candidate: any,
  vacancy: any
): { score: number; details: any } {
  let score = 0;
  const details: any = {
    skills_match: 0,
    experience_match: 0,
    location_match: 0,
    language_match: 0,
    education_match: 0,
  };

  // 1. Skills matching (40 points max)
  if (candidate.skills && vacancy.requirements) {
    const candidateSkills = candidate.skills.toLowerCase().split(',').map((s: string) => s.trim());
    const requiredSkills = vacancy.requirements.toLowerCase().split(';').flat();

    let matchingSkills = 0;
    requiredSkills.forEach((req: string) => {
      candidateSkills.forEach((skill: string) => {
        if (skill.includes(req) || req.includes(skill)) {
          matchingSkills++;
        }
      });
    });

    details.skills_match = Math.min(40, (matchingSkills / requiredSkills.length) * 40);
    score += details.skills_match;
  }

  // 2. Experience level matching (30 points max)
  if (candidate.years_experience !== null && vacancy.requirements) {
    const experienceKeywords = vacancy.requirements.toLowerCase();
    const yearsMatch = candidate.years_experience;

    if (experienceKeywords.includes('3-5 years') && yearsMatch >= 3 && yearsMatch <= 5) {
      details.experience_match = 30;
    } else if (experienceKeywords.includes('5+ years') && yearsMatch >= 5) {
      details.experience_match = 30;
    } else if (experienceKeywords.includes('senior') && yearsMatch >= 7) {
      details.experience_match = 30;
    } else if (yearsMatch > 0) {
      details.experience_match = Math.min(30, (yearsMatch / 5) * 30);
    } else {
      details.experience_match = 0;
    }

    score += details.experience_match;
  }

  // 3. Location compatibility (15 points max)
  if (candidate.location && vacancy.location) {
    const candidateLocation = candidate.location.toLowerCase();
    const vacancyLocation = vacancy.location.toLowerCase();

    if (vacancyLocation.includes('remote')) {
      details.location_match = 15; // Remote positions accept any location
      score += 15;
    } else if (candidateLocation.includes(vacancyLocation) || vacancyLocation.includes(candidateLocation)) {
      details.location_match = 15; // Exact location match
      score += 15;
    } else if (
      (candidateLocation.includes('remote') || candidateLocation.includes('anywhere')) &&
      vacancyLocation.includes('remote')
    ) {
      details.location_match = 15;
      score += 15;
    } else {
      details.location_match = 0;
    }
  }

  // 4. Language matching (10 points max)
  if (candidate.languages && vacancy.requirements) {
    const candidateLanguages = candidate.languages.toLowerCase();
    const requiredLanguages = vacancy.requirements.toLowerCase();

    if (requiredLanguages.includes('english')) {
      if (candidateLanguages.includes('english') || candidateLanguages.includes('c1') || candidateLanguages.includes('c2')) {
        details.language_match = 10;
        score += 10;
      } else if (candidateLanguages.includes('b1') || candidateLanguages.includes('b2')) {
        details.language_match = 7;
        score += 7;
      }
    }

    if (requiredLanguages.includes('mandarin') && candidateLanguages.includes('mandarin')) {
      details.language_match = Math.min(10, details.language_match + 5);
      score += 5;
    }
  }

  // 5. Education matching (5 points max)
  if (candidate.education && vacancy.requirements) {
    const candidateEducation = candidate.education.toLowerCase();
    const requiredEducation = vacancy.requirements.toLowerCase();

    const educationLevels = ['bachelor', 'master', 'diploma', 'degree', 'technician'];
    const hasRelevantEducation = educationLevels.some(
      (level) => candidateEducation.includes(level) && requiredEducation.includes(level)
    );

    if (hasRelevantEducation) {
      details.education_match = 5;
      score += 5;
    }

    // Check for specific field matches
    const relevantFields = ['accounting', 'finance', 'international trade', 'business', 'logistics', 'engineering'];
    relevantFields.forEach((field) => {
      if (candidateEducation.includes(field) && requiredEducation.includes(field)) {
        details.education_match = 5;
        score += 5;
      }
    });
  }

  return {
    score: Math.min(100, parseFloat(score.toFixed(2))),
    details,
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { vacancy_id } = body;

    if (!vacancy_id) {
      return NextResponse.json(
        { error: 'vacancy_id is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Get the vacancy
    const vacancyResult = await sql(
      'SELECT * FROM vacancies WHERE id = $1',
      [vacancy_id]
    );

    if (vacancyResult.length === 0) {
      return NextResponse.json(
        { error: 'Vacancy not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const vacancy = vacancyResult[0];

    // Get all active candidates
    const candidates = await sql(
      'SELECT * FROM talent_pool WHERE status = $1',
      ['active']
    );

    // Delete existing matching results for this vacancy
    await sql('DELETE FROM matching_results WHERE vacancy_id = $1', [vacancy_id]);

    // Calculate match scores and insert results
    const matchResults: any[] = [];

    for (const candidate of candidates) {
      const { score, details } = calculateMatchScore(candidate, vacancy);

      if (score > 0) {
        const result = await sql(
          `INSERT INTO matching_results (
            vacancy_id, candidate_id, match_score, match_details
          ) VALUES (
            $1, $2, $3, $4
          ) RETURNING *`,
          [
            vacancy_id,
            candidate.id,
            score,
            JSON.stringify(details),
          ]
        );

        matchResults.push({
          ...result[0],
          candidate: {
            id: candidate.id,
            full_name: candidate.full_name,
            email: candidate.email,
            current_role: candidate.current_role,
            years_experience: candidate.years_experience,
            location: candidate.location,
          },
        });
      }
    }

    // Sort by match score descending
    matchResults.sort((a, b) => b.match_score - a.match_score);

    return NextResponse.json(
      {
        vacancy_id,
        vacancy_title: vacancy.title,
        total_matches: matchResults.length,
        matches: matchResults,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('POST /api/matching error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run matching' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const vacancy_id = searchParams.get('vacancy_id');
    const min_score = parseFloat(searchParams.get('min_score') || '0');

    if (!vacancy_id) {
      return NextResponse.json(
        { error: 'vacancy_id query parameter is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Verify vacancy exists
    const vacancyResult = await sql(
      'SELECT * FROM vacancies WHERE id = $1',
      [parseInt(vacancy_id)]
    );

    if (vacancyResult.length === 0) {
      return NextResponse.json(
        { error: 'Vacancy not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Get matching results with candidate details
    const query = `
      SELECT
        mr.id,
        mr.vacancy_id,
        mr.candidate_id,
        mr.match_score,
        mr.match_details,
        mr.created_at,
        tp.full_name,
        tp.email,
        tp.phone,
        tp.current_role,
        tp.years_experience,
        tp.skills,
        tp.education,
        tp.languages,
        tp.location,
        tp.linkedin_url,
        tp.summary
      FROM matching_results mr
      JOIN talent_pool tp ON mr.candidate_id = tp.id
      WHERE mr.vacancy_id = $1 AND mr.match_score >= $2
      ORDER BY mr.match_score DESC
    `;

    const results = await sql(query, [parseInt(vacancy_id), min_score]);

    return NextResponse.json(
      {
        vacancy_id: parseInt(vacancy_id),
        vacancy_title: vacancyResult[0].title,
        total_matches: results.length,
        matches: results,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('GET /api/matching error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch matching results' },
      { status: 500, headers: corsHeaders }
    );
  }
}
