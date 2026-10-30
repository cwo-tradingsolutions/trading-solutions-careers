/**
 * GET /api/admin/diag/audio?email=...
 *
 * Endpoint de diagnóstico (admin only). Devuelve info estructurada de la
 * entrevista IA del candidato — para debugear por qué el audio no carga.
 *
 * Tambien ejecuta un HEAD upstream a ElevenLabs para confirmar que el
 * conversation_id existe del lado de ellos y devuelve status code.
 *
 * NO devuelve el audio en sí, solo metadata. Seguro para diagnostico.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { aiInterviewEnabled } from "@/lib/ai-interview-flag";

export const runtime = "nodejs";

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
    return NextResponse.json({ error: "Pasá ?email=foo@bar.com, ?candidate_id=UUID o ?name=parteDelNombre" }, { status: 400 });
  }

  // Buscar candidato (email exacto, id exacto, o nombre parcial ILIKE)
  let candQuery = supabaseAdmin
    .from("ht_candidates")
    .select("id, name, email, stage")
    .limit(1);
  if (email) candQuery = candQuery.ilike("email", email);
  if (candidateId) candQuery = candQuery.eq("id", candidateId);
  if (name) candQuery = candQuery.ilike("name", `%${name}%`);
  const { data: cand } = await candQuery.maybeSingle();

  if (!cand) {
    return NextResponse.json({
      error: "Candidato no encontrado",
      hint: "Probá con ?name=Vianny o copiá el email exacto del panel del candidato",
      tried: { email, candidateId, name },
    }, { status: 404 });
  }

  // Buscar última entrevista IA
  const { data: ai } = await supabaseAdmin
    .from("ht_ai_interviews")
    .select("id, token, conversation_id, audio_url, status, ai_score, completed_at, created_at, transcript, agent_id")
    .eq("candidate_id", cand.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ai) {
    return NextResponse.json({
      candidate: cand,
      interview: null,
      diagnosis: "Sin entrevistas IA registradas",
    });
  }

  // Diagnóstico estructurado
  const diagnosis: any = {
    has_conversation_id: !!ai.conversation_id,
    conversation_id_format: ai.conversation_id
      ? (ai.conversation_id.startsWith('conv_') ? 'OK_conv_prefix' : 'UNUSUAL_format')
      : null,
    has_audio_url: !!ai.audio_url,
    audio_url_kind: ai.audio_url
      ? (ai.audio_url.includes('localhost') ? 'BAD_localhost'
        : ai.audio_url.startsWith('https://api.elevenlabs') ? 'DIRECT_elevenlabs'
        : ai.audio_url.includes('/api/headhunting/ai-interview') ? 'PROXY_OK'
        : 'OTHER')
      : null,
    elevenlabs_api_key_configured: !!process.env.ELEVENLABS_API_KEY,
  };

  // Probar HEAD a ElevenLabs si hay conversation_id + API key
  let elevenlabs_audio_check: any = null;
  let elevenlabs_transcript_check: any = null;
  if (ai.conversation_id && process.env.ELEVENLABS_API_KEY) {
    // Audio: GET con Range: bytes=0-0 (ElevenLabs no soporta HEAD para audio)
    try {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations/${ai.conversation_id}/audio`,
        {
          method: "GET",
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
            "Range": "bytes=0-0",
          },
        }
      );
      // Leer Content-Range que tiene el tamaño total
      const contentRange = r.headers.get('content-range'); // "bytes 0-0/12345"
      const totalBytes = contentRange ? Number(contentRange.split('/')[1]) : null;
      // Cancelar body para no descargar
      if (r.body) {
        try { r.body.cancel?.(); } catch {}
      }
      elevenlabs_audio_check = {
        status: r.status,
        ok: r.status === 200 || r.status === 206,
        content_type: r.headers.get('content-type'),
        content_range: contentRange,
        total_size_kb: totalBytes ? Math.round(totalBytes / 1024) : null,
      };
    } catch (e: any) {
      elevenlabs_audio_check = { error: e?.message || String(e) };
    }

    // Transcript GET (full conversation metadata)
    try {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations/${ai.conversation_id}`,
        { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } }
      );
      if (r.ok) {
        const j = await r.json();
        elevenlabs_transcript_check = {
          status: r.status,
          ok: true,
          conversation_status: j.status || null,
          turn_count: Array.isArray(j.transcript) ? j.transcript.length : (j.transcript ? 'present' : 'empty'),
          duration_secs: j.metadata?.call_duration_secs || null,
          start_time_unix: j.metadata?.start_time_unix_secs || null,
        };
      } else {
        const detail = await r.text().catch(() => '');
        elevenlabs_transcript_check = {
          status: r.status,
          ok: false,
          detail: detail.slice(0, 200),
        };
      }
    } catch (e: any) {
      elevenlabs_transcript_check = { error: e?.message || String(e) };
    }
  }

  // Recomendación de fix más detallada
  let recommendation = "OK · todo en orden, debería funcionar";
  if (!ai.conversation_id) {
    recommendation = "Falta conversation_id — relanzar entrevista (botón Reenviar)";
  } else if (elevenlabs_audio_check?.status === 401) {
    recommendation = "ELEVENLABS_API_KEY inválida — revisar variable de entorno en Vercel";
  } else if (elevenlabs_transcript_check?.ok && elevenlabs_audio_check?.ok) {
    // ElevenLabs sí tiene todo · el problema es del lado de la app
    if (!ai.audio_url || diagnosis.audio_url_kind === 'BAD_localhost') {
      recommendation = "ElevenLabs tiene el audio Y el transcript. Solo falta regenerar audio_url en BD (script: actualizar audio_url al proxy correcto)";
    } else if (!ai.transcript) {
      recommendation = "ElevenLabs tiene el transcript pero la BD no lo tiene cacheado. Re-correr scoring debería traerlo. Si sigue fallando, problema de timeout en Vercel.";
    } else {
      recommendation = "ElevenLabs y BD tienen todo. El problema puede ser CORS o el frontend cargando mal el audio. Probar en otro browser / incognito.";
    }
  } else if (elevenlabs_audio_check?.status === 404 && elevenlabs_transcript_check?.status === 404) {
    recommendation = "ElevenLabs perdió audio Y transcript. La conversación ya no existe ahí. Hay que reenviar entrevista al candidato.";
  } else if (elevenlabs_audio_check?.status === 404 && elevenlabs_transcript_check?.ok) {
    recommendation = "Curioso · ElevenLabs tiene transcript pero NO audio. Puede ser plan que ya no incluye audio storage. El scoring SÍ debería poder correr porque solo necesita transcript.";
  } else if (elevenlabs_audio_check?.ok && elevenlabs_transcript_check?.status === 404) {
    recommendation = "Audio existe pero no transcript. Raro. Reintentar fetch del transcript en /finalize.";
  }

  return NextResponse.json({
    candidate: cand,
    interview: {
      id: ai.id,
      token: ai.token,
      status: ai.status,
      ai_score: ai.ai_score,
      completed_at: ai.completed_at,
      conversation_id: ai.conversation_id,
      audio_url: ai.audio_url,
      transcript_in_db: !!ai.transcript,
      transcript_size_chars: ai.transcript ? JSON.stringify(ai.transcript).length : 0,
      agent_id: ai.agent_id,
    },
    diagnosis,
    elevenlabs_audio_check,
    elevenlabs_transcript_check,
    recommendation,
  });
}
