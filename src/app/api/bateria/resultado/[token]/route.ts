import { NextRequest, NextResponse } from 'next/server';
import { almacen } from "@/lib/almacen";
import { supabaseAdmin } from '@/lib/supabase';
import { isAdminRequest } from '@/lib/bateria/auth';
import { findItem, ITEMS } from '@/lib/bateria/items';
import {
  FACTORS, ARQUETIPOS, DISC_PATRONES, DISC_LABEL, MOTIVADORES,
  INTEGRIDAD_LABEL, RAZONAMIENTO_LABEL, franja,
} from '@/lib/bateria/interpretacion';
import { calcularMatch } from '@/lib/bateria/match';
import { perfilDe, perfilPorTitulo } from '@/lib/bateria/perfiles-cargo';

export const dynamic = 'force-dynamic';

/**
 * Informe completo. Solo para el equipo de seleccion, nunca para el candidato.
 * La capa de interpretacion se resuelve en el servidor y viaja ya armada:
 * asi los textos y las claves no quedan en un chunk estatico del navegador.
 */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: session } = await supabaseAdmin
    .from('ts_bat_sessions').select('*').eq('token', params.token).single();
  if (!session) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  const [{ data: answers }, { data: events }, { data: snaps }] = await Promise.all([
    supabaseAdmin.from('ts_bat_answers').select('*').eq('session_id', session.id).order('answered_at'),
    supabaseAdmin.from('ts_bat_events').select('*').eq('session_id', session.id).order('at'),
    supabaseAdmin.from('ts_bat_snapshots').select('*').eq('session_id', session.id).order('captured_at'),
  ]);

  // URLs firmadas: el bucket es privado.
  let capturas: { path: string; url: string | null; captured_at: string; block: string | null }[] = [];
  if (snaps?.length) {
    const { data: urls } = await almacen('proctoring-snapshots')
      .createSignedUrls(snaps.map((s: any) => s.storage_path), 60 * 60);
    capturas = snaps.map((s: any, idx: number) => ({
      path: s.storage_path, url: urls?.[idx]?.signedUrl ?? null,
      captured_at: s.captured_at, block: s.block,
    }));
  }

  // Revision item por item: que midio, que respondio, la clave y el sustento.
  const revision = (answers ?? []).map((a: any) => {
    const item = findItem(a.item_code);
    let correcta: string | null = null;
    let acerto: boolean | null = null;
    if (item && (item.type === 'mc' || item.type === 'figure')) {
      correcta = item.answer;
      acerto = a.answer?.choice === item.answer;
    }
    let efectividad: number | null = null;
    if (item?.type === 'situational' && a.answer?.choice) {
      efectividad = item.options.find((o) => o.key === a.answer.choice)?.effectiveness ?? null;
    }
    return {
      item_code: a.item_code, block: a.block, subdomain: a.subdomain,
      etiqueta: item?.hiddenLabel ?? null, tipo: a.item_type,
      enunciado: item && 'stem' in item ? item.stem : item && 'prompt' in item ? item.prompt : null,
      respuesta: a.answer, correcta, acerto, efectividad,
      latency_ms: a.latency_ms,
      sustento: item && 'rationale' in item ? item.rationale ?? null : null,
    };
  });

  // ── Capa de interpretacion ya resuelta ────────────────────
  const sc: any = session.scores ?? null;
  let interpretacion: any = null;
  if (sc) {
    const arq = ARQUETIPOS[sc.personalidad?.arquetipo] ?? ARQUETIPOS.EQUILIBRADO;
    const arqAlt = sc.personalidad?.arquetipoAlterno ? ARQUETIPOS[sc.personalidad.arquetipoAlterno] ?? null : null;
    interpretacion = {
      arquetipo: arq,
      arquetipoAlterno: arqAlt,
      factores: Object.entries(FACTORS).map(([key, f]) => {
        const pct = sc.personalidad?.factores?.[key] ?? 0;
        const fr = franja(pct);
        return {
          key, label: f.label, polos: f.polos, pct, franja: fr,
          queSignifica: f.queSignifica,
          lectura: fr === 'alto' ? f.alto : fr === 'bajo' ? f.bajo : f.medio,
          facetas: f.facets.map((fa) => {
            const fpct = sc.personalidad?.facetas?.[fa.key] ?? 0;
            return {
              key: fa.key, label: fa.label, pct: fpct, franja: franja(fpct),
              lectura: franja(fpct) === 'bajo' ? fa.bajo : fa.alto,
            };
          }),
        };
      }),
      discLabel: DISC_LABEL,
      patron: DISC_PATRONES[sc.disc?.patron] ?? DISC_PATRONES.EQ,
      motivadores: (sc.motivadores?.orden ?? []).map((k: string) => ({
        key: k, pct: sc.motivadores?.pct?.[k] ?? 0, ...MOTIVADORES[k],
      })),
      integridad: Object.entries(sc.integridad?.byDimension ?? {}).map(([k, pct]) => ({
        key: k, label: INTEGRIDAD_LABEL[k] ?? k, pct: pct as number, franja: franja(pct as number),
      })),
      razonamiento: Object.entries(sc.razonamiento?.bySubdomain ?? {}).map(([k, v]: any) => ({
        key: k, label: RAZONAMIENTO_LABEL[k] ?? k, ...v,
      })),
    };
  }

  // Sin no-store el navegador reutiliza el informe anterior: se recalcula, se
  // vuelve a pedir la misma URL y devuelve la version vieja sin puntajes.
  const perfil = perfilDe(session.perfil_cargo ?? perfilPorTitulo(session.vacancy_title));
  const match = session.match_data ?? (sc ? calcularMatch(sc, perfil?.key ?? null) : null);

  return NextResponse.json(
    { session, revision, interpretacion, perfil, match, informeIA: session.informe_ia ?? null,
      eventos: events ?? [], capturas, total_items: ITEMS.length },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
