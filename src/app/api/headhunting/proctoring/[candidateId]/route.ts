import { NextRequest, NextResponse } from 'next/server';
import { almacen } from "@/lib/almacen";
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';

/**
 * Returns signed URLs for all proctoring snapshots of a candidate.
 * Signed URLs expire in 1 hour.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidateId } = await params;

    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId requerido' }, { status: 400 });
    }

    // List all files under the candidate's folder
    const { data: files, error: listError } = await almacen('proctoring-snapshots')
      .list(candidateId, {
        limit: 500,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (listError) {
      console.error('Proctoring list error:', listError);
      return NextResponse.json({ error: 'Error al listar capturas' }, { status: 500 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ snapshots: [], count: 0 });
    }

    const paths = files.map((f) => `${candidateId}/${f.name}`);
    const { data: signed, error: signError } = await almacen('proctoring-snapshots')
      .createSignedUrls(paths, 3600);

    if (signError) {
      console.error('Signed URL error:', signError);
      return NextResponse.json({ error: 'Error al generar URLs firmadas' }, { status: 500 });
    }

    // Parse filename: {scenario_index}_{timestamp}.{ext}
    const snapshots = (signed || []).map((s, i) => {
      const name = files[i].name;
      const parts = name.split('_');
      const scenarioIndex = parseInt(parts[0], 10);
      const timestampPart = parts[1]?.split('.')[0];
      const ts = timestampPart ? parseInt(timestampPart, 10) : 0;
      return {
        url: s.signedUrl,
        path: s.path,
        filename: name,
        scenario_index: isNaN(scenarioIndex) ? null : scenarioIndex,
        captured_at: ts ? new Date(ts).toISOString() : null,
        size: files[i].metadata?.size,
      };
    }).sort((a, b) => {
      const ta = a.captured_at ? new Date(a.captured_at).getTime() : 0;
      const tb = b.captured_at ? new Date(b.captured_at).getTime() : 0;
      return ta - tb;
    });

    return NextResponse.json({ snapshots, count: snapshots.length });
  } catch (err) {
    console.error('Proctoring GET error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
