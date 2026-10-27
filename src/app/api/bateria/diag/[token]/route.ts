import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isAdminRequest } from '@/lib/bateria/auth';
import { ITEMS, BATTERY_VERSION } from '@/lib/bateria/items';
import { score, applyProctoring } from '@/lib/bateria/scoring';
import { calcularMatch } from '@/lib/bateria/match';
import { perfilDe, perfilPorTitulo } from '@/lib/bateria/perfiles-cargo';
import { getAnthropic } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Diagnostico. Abrir en el navegador con la sesion de hr-admin iniciada:
 *   /api/bateria/diag/<token>
 * Dice si el calculo corre y que hay guardado.
 *
 * SOLO LEE. Para escribir hay que pedirlo: ?aplicar=1
 *
 * Por que: esta ruta se llamaba "diag" y cerraba la sesion. Un GET que
 * parece lectura marcaba status='completed' y guardaba puntajes, aunque la
 * persona llevara 16 de 172 respuestas. El 1-oct-2026 abrirla sobre dos
 * candidatas de China que estaban a medias --Yijiao Wang con 68 respuestas y
 * Judy Guo con 16-- las dejo cerradas con un match calculado sobre un
 * cuestionario incompleto. Las dos habian escrito preguntando por un error y
 * estaban esperando respuesta.
 *
 * Un diagnostico no cambia lo que mide.
 */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'No autorizado · entre primero a /hr-admin' }, { status: 401 });

  const out: Record<string, unknown> = {
    bateria: BATTERY_VERSION,
    items: ITEMS.length,
    // Lo primero que hay que descartar cuando el agente "no hace nada".
    entorno: {
      anthropicConfigurada: !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_VERTEX_PROJECT_ID),
      largoLlave: process.env.ANTHROPIC_API_KEY?.length ?? 0,
    },
  };

  const { data: sesion, error: eSes } = await supabaseAdmin
    .from('ts_bat_sessions').select('*').eq('token', params.token).single();
  if (eSes || !sesion) return NextResponse.json({ ...out, paso: 'leer_sesion', error: eSes?.message ?? 'no existe' }, { status: 404 });

  out.sesion = {
    id: sesion.id,
    version: sesion.battery_version,
    status: sesion.status,
    started_at: sesion.started_at,
    finished_at: sesion.finished_at,
    duration_seconds: sesion.duration_seconds,
    updated_at: sesion.updated_at,
    scoresEsNull: sesion.scores === null,
    scoresTipo: typeof sesion.scores,
    scoresClaves: sesion.scores && typeof sesion.scores === 'object' ? Object.keys(sesion.scores) : null,
    validityTipo: typeof sesion.validity,
  };

  const { data: respuestas, error: eAns } = await supabaseAdmin
    .from('ts_bat_answers').select('item_code, answer, latency_ms, answered_at')
    .eq('session_id', sesion.id).order('answered_at').limit(2000);
  out.respuestas = { n: respuestas?.length ?? 0, error: eAns?.message ?? null, primera: respuestas?.[0] ?? null };

  if (!respuestas?.length) return NextResponse.json(out);

  // 1) ¿el motor calcula?
  let scores: any = null, validity: any = null;
  try {
    const r = score(respuestas as any);
    scores = r.scores;
    validity = applyProctoring(r.validity, 0, 0, 5);
    out.calculo = {
      ok: true,
      claves: Object.keys(scores),
      factores: scores.personalidad?.factores,
      arquetipo: scores.personalidad?.arquetipo,
      patronDisc: scores.disc?.patron,
      tamanoJson: JSON.stringify(scores).length,
    };
  } catch (err: any) {
    out.calculo = { ok: false, error: err?.message ?? String(err), stack: String(err?.stack ?? '').split('\n').slice(0, 4) };
    return NextResponse.json(out);
  }

  // 2) ¿la escritura persiste? Solo si se pide con ?aplicar=1.
  //    Sin el parametro no se toca la sesion: cerrar una bateria a medias
  //    produce un match sobre un cuestionario incompleto, y ese numero
  //    despues se lee como si fuera el resultado de la persona.
  const aplicar = new URL(req.url).searchParams.get('aplicar') === '1';
  const incompleta = (respuestas?.length ?? 0) < ITEMS.length;

  if (!aplicar) {
    out.escritura = {
      omitida: true,
      razon: 'solo lectura · agregue ?aplicar=1 para escribir',
      respuestasGuardadas: respuestas?.length ?? 0,
      itemsTotales: ITEMS.length,
      incompleta,
    };
  } else if (incompleta) {
    out.escritura = {
      omitida: true,
      razon: `la sesion tiene ${respuestas?.length ?? 0} de ${ITEMS.length} respuestas · no se cierra una bateria a medias`,
      incompleta: true,
    };
  } else {
    const { data: escrito, error: eUpd } = await supabaseAdmin
      .from('ts_bat_sessions')
      .update({ scores, validity, status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', sesion.id)
      .select('id, status, updated_at, scores');

    out.escritura = {
      aplicada: true,
      error: eUpd?.message ?? null,
      filasDevueltas: escrito?.length ?? 0,
      scoresTrasEscribir: escrito?.[0]?.scores ? Object.keys(escrito[0].scores) : null,
    };
  }

  // ── ¿Las columnas nuevas existen? Si falta el SQL, guardar el informe falla.
  out.columnas = {
    perfil_cargo: 'perfil_cargo' in sesion,
    match_data: 'match_data' in sesion,
    informe_ia: 'informe_ia' in sesion,
    faltaCorrerSQL: !('informe_ia' in sesion),
  };

  const perfilKey = (sesion as any).perfil_cargo ?? perfilPorTitulo(sesion.vacancy_title);
  const perfil = perfilDe(perfilKey);
  const match = calcularMatch(scores, perfilKey);
  out.match = perfil
    ? { perfil: perfil.nombre, version: perfil.version, global: match?.global ?? null, alertas: match?.alertas?.length ?? 0 }
    : { perfil: null, nota: 'La vacante no coincide con ningún perfil de cargo definido.' };

  // ── ¿El agente responde? Llamada corta, solo para probar el canal.
  if (req.nextUrl.searchParams.get('ia') === '1') {
    const t0 = Date.now();
    try {
      const client = getAnthropic();
      const r: any = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'Responde exactamente: OK' }],
      });
      const txt = (r.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      out.agente = { ok: true, respuesta: txt.trim().slice(0, 40), ms: Date.now() - t0 };
    } catch (err: any) {
      out.agente = { ok: false, error: err?.message ?? String(err), status: err?.status ?? null, ms: Date.now() - t0 };
    }
  }

  const { data: relectura } = await supabaseAdmin
    .from('ts_bat_sessions').select('status, updated_at, scores').eq('id', sesion.id).single();
  out.relectura = {
    status: relectura?.status,
    updated_at: relectura?.updated_at,
    scoresEsNull: relectura?.scores === null,
    scoresClaves: relectura?.scores ? Object.keys(relectura.scores) : null,
  };

  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
