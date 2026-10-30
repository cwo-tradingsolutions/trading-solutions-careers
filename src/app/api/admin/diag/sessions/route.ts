/**
 * GET /api/admin/diag/sessions?name=Vianny
 *
 * Lista TODAS las conversaciones del agent en ElevenLabs alrededor del
 * started_at del candidato. Permite detectar entrevistas con múltiples
 * sesiones (cortes + reanudaciones).
 *
 * Para cada conversación devuelve:
 *   - conversation_id, duración, turnos, estado
 *   - audio_size_bytes (si está disponible) — cero o muy bajo = sesión cortada
 *   - timestamp de inicio
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { aiInterviewEnabled } from "@/lib/ai-interview-flag";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  if (!aiInterviewEnabled()) {
    return NextResponse.json({ status: "disabled" }, { status: 503 });
  }

  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  const candidateId = url.searchParams.get("candidate_id");
  const name = url.searchParams.get("name");

  if (!email && !candidateId && !name) {
    return NextResponse.json({ error: "Pasá ?name=, ?email= o ?candidate_id=" }, { status: 400 });
  }

  // Buscar candidato
  let candQuery = supabaseAdmin
    .from("ht_candidates")
    .select("id, name, email, stage")
    .limit(1);
  if (email) candQuery = candQuery.ilike("email", email);
  if (candidateId) candQuery = candQuery.eq("id", candidateId);
  if (name) candQuery = candQuery.ilike("name", `%${name}%`);
  const { data: cand } = await candQuery.maybeSingle();

  if (!cand) return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });

  // Última entrevista
  const { data: ai } = await supabaseAdmin
    .from("ht_ai_interviews")
    .select("id, conversation_id, agent_id, started_at, completed_at")
    .eq("candidate_id", cand.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ai) return NextResponse.json({ candidate: cand, error: "Sin entrevista IA registrada" }, { status: 404 });
  if (!ai.agent_id) return NextResponse.json({ candidate: cand, error: "Sin agent_id" }, { status: 404 });
  if (!process.env.ELEVENLABS_API_KEY) return NextResponse.json({ error: "ElevenLabs API key no configurada" }, { status: 503 });

  // Listar TODAS las conversaciones del agent en las últimas 7 días
  const r = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${ai.agent_id}&page_size=50`,
    { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } }
  );
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return NextResponse.json({ error: "elevenlabs_list_failed", status: r.status, detail: detail.slice(0, 200) }, { status: 502 });
  }
  const j = await r.json();
  const allConvos = j.conversations || j.history || [];

  // Filtrar por started_at del candidato (±48h tolerancia)
  const startedUnix = ai.started_at ? Math.floor(new Date(ai.started_at).getTime() / 1000) : 0;
  const TOLERANCE_SECS = 48 * 60 * 60; // 48 horas
  const candidateConvos = allConvos.filter((c: any) => {
    const cStart = c.start_time_unix_secs || 0;
    return startedUnix > 0 && Math.abs(cStart - startedUnix) < TOLERANCE_SECS;
  });

  // Para cada conversación cercana, hacer GET pequeño al audio para ver tamaño
  const enriched = await Promise.all(
    candidateConvos.map(async (c: any) => {
      let audioSize: number | null = null;
      let audioOk = false;
      try {
        const audioR = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${c.conversation_id}/audio`,
          { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! } }
        );
        if (audioR.ok) {
          const buf = await audioR.arrayBuffer();
          audioSize = buf.byteLength;
          audioOk = audioSize > 1000; // >1KB = audio real
        }
      } catch {}

      return {
        conversation_id: c.conversation_id,
        status: c.status,
        start_time_unix: c.start_time_unix_secs,
        start_time_iso: c.start_time_unix_secs ? new Date(c.start_time_unix_secs * 1000).toISOString() : null,
        duration_secs: c.call_duration_secs || null,
        message_count: c.message_count || null,
        is_saved_in_db: c.conversation_id === ai.conversation_id,
        audio_size_bytes: audioSize,
        audio_size_kb: audioSize ? Math.round(audioSize / 1024) : null,
        has_real_audio: audioOk,
      };
    })
  );

  // Ordenar por start_time
  enriched.sort((a, b) => (a.start_time_unix || 0) - (b.start_time_unix || 0));

  // Recomendación: cuál usar
  const withAudio = enriched.filter(c => c.has_real_audio);
  const longest = enriched.reduce((max, c) => (c.duration_secs || 0) > (max.duration_secs || 0) ? c : max, enriched[0] || null);

  let recommendation = "";
  if (enriched.length === 0) {
    recommendation = "Sin sesiones encontradas en ElevenLabs cerca del started_at. Verificar agent_id o reenviar entrevista.";
  } else if (enriched.length === 1) {
    recommendation = withAudio.length > 0
      ? "1 sesión única con audio · todo OK"
      : "1 sesión única sin audio (entrevista incompleta) · reenviar al candidato";
  } else {
    if (withAudio.length === 0) {
      recommendation = `${enriched.length} sesiones encontradas · NINGUNA tiene audio real · reenviar`;
    } else if (withAudio.length === 1) {
      const best = withAudio[0];
      const isCurrent = best.is_saved_in_db;
      recommendation = isCurrent
        ? `${enriched.length} sesiones · la guardada en BD ya es la correcta`
        : `${enriched.length} sesiones · la BD apunta a una vacía. Actualizar conversation_id a ${best.conversation_id}`;
    } else {
      recommendation = `${enriched.length} sesiones con audio real · candidato hizo varias intentos completos · revisar cuál es la "buena" (probablemente la más larga: ${longest?.conversation_id})`;
    }
  }

  return NextResponse.json({
    candidate: cand,
    interview_in_db: {
      conversation_id: ai.conversation_id,
      agent_id: ai.agent_id,
      started_at: ai.started_at,
    },
    sessions_in_elevenlabs: enriched,
    summary: {
      total_sessions: enriched.length,
      sessions_with_audio: withAudio.length,
      longest_duration_secs: longest?.duration_secs || null,
    },
    recommendation,
  });
}
