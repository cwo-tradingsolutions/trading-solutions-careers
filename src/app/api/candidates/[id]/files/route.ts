import { NextRequest, NextResponse } from 'next/server';
import { almacen } from "@/lib/almacen";
import { supabaseAdmin } from '@/lib/supabase';
import { isAdminRequest } from '@/lib/bateria/auth';
import {
  MAX_BYTES_ADJUNTO,
  MIMES_PERMITIDOS,
  esTipoValido,
  slugArchivo,
} from '@/lib/adjuntos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'candidate-files';
const VIGENCIA_URL = 60 * 60; // una hora

type Ctx = { params: { id: string } };

/** Lista los adjuntos del candidato, cada uno con URL firmada. */
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('ht_candidate_files')
    .select('id, kind, title, storage_path, mime, bytes, uploaded_by, created_at')
    .eq('candidate_id', params.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('candidates/files GET', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filas = data ?? [];
  const firmadas: Record<string, string> = {};
  if (filas.length > 0) {
    const { data: urls } = await almacen(BUCKET)
      .createSignedUrls(filas.map((f) => f.storage_path), VIGENCIA_URL);
    for (const u of urls ?? []) {
      if (u?.path && u.signedUrl) firmadas[u.path] = u.signedUrl;
    }
  }

  return NextResponse.json(
    { archivos: filas.map((f) => ({ ...f, url: firmadas[f.storage_path] ?? null })) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/** Sube un documento y lo indexa contra el candidato. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    // El candidato tiene que existir: sin esto quedarían archivos huérfanos
    // en el bucket que nadie vuelve a encontrar ni a borrar.
    const { data: cand } = await supabaseAdmin
      .from('ht_candidates')
      .select('id')
      .eq('id', params.id)
      .single();
    if (!cand) return NextResponse.json({ error: 'Candidato no encontrado' }, { status: 404 });

    const form = await req.formData();
    const archivo = form.get('file');
    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
    }

    const kindCrudo = String(form.get('kind') ?? 'otro');
    const kind = esTipoValido(kindCrudo) ? kindCrudo : 'otro';
    const titulo = String(form.get('title') ?? '').trim() || archivo.name;

    const ext = MIMES_PERMITIDOS[archivo.type];
    if (!ext) {
      return NextResponse.json(
        { error: 'Formato no permitido. Se aceptan PDF, imágenes, Word y Excel.' },
        { status: 415 }
      );
    }
    if (archivo.size > MAX_BYTES_ADJUNTO) {
      return NextResponse.json({ error: 'El archivo supera los 20 MB' }, { status: 413 });
    }

    const binario = Buffer.from(await archivo.arrayBuffer());
    const path = `candidatos/${params.id}/${Date.now()}_${slugArchivo(titulo)}.${ext}`;

    const { error: upErr } = await almacen(BUCKET).upload(path, binario, {
      contentType: archivo.type,
      cacheControl: '3600',
      upsert: false,
    });
    if (upErr) {
      console.error('candidates/files upload', upErr);
      return NextResponse.json({ error: 'No se pudo guardar el archivo' }, { status: 500 });
    }

    const { data: fila, error: insErr } = await supabaseAdmin
      .from('ht_candidate_files')
      .insert({
        candidate_id: params.id,
        kind,
        title: titulo,
        storage_path: path,
        mime: archivo.type,
        bytes: binario.length,
        uploaded_by: 'hr-admin',
      })
      .select('id, kind, title, storage_path, mime, bytes, created_at')
      .single();

    if (insErr) {
      // Si no se pudo indexar, el archivo sobra en el bucket. Se retira para
      // que el storage no quede con basura que nadie sabe de quién es.
      await almacen(BUCKET).remove([path]);
      console.error('candidates/files insert', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ archivo: fila });
  } catch (err) {
    console.error('candidates/files POST', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

/** Elimina un adjunto: primero el objeto, después la fila. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const fileId = req.nextUrl.searchParams.get('fileId');
  if (!fileId) return NextResponse.json({ error: 'Falta fileId' }, { status: 400 });

  // Se exige que el archivo sea de ESTE candidato: un id suelto no debe poder
  // borrar el adjunto de otra persona.
  const { data: fila } = await supabaseAdmin
    .from('ht_candidate_files')
    .select('id, storage_path')
    .eq('id', fileId)
    .eq('candidate_id', params.id)
    .single();
  if (!fila) return NextResponse.json({ error: 'Adjunto no encontrado' }, { status: 404 });

  const { error: rmErr } = await almacen(BUCKET).remove([fila.storage_path]);
  if (rmErr) console.error('candidates/files remove', rmErr);

  const { error } = await supabaseAdmin.from('ht_candidate_files').delete().eq('id', fila.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ eliminado: true });
}
