/**
 * POST /api/admin/diag/fix-conversation
 * Body: { candidate_id: string, new_conversation_id: string, also_refetch_transcript?: boolean }
 *
 * Actualiza el conversation_id guardado en ht_ai_interviews para apuntar a una
 * sesión válida (típicamente la 2da después de un corte).
 *
 * También regenera el audio_url proxy para que use el nuevo cid.
 *
 * Si also_refetch_transcript=true, además trae el transcript desde ElevenLabs
 * y lo pisa en BD (útil cuando la sesión vieja tenía transcript parcial).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { aiInterviewEnabled } from "@/lib/ai-interview-flag";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  if (!aiInterviewEnabled()) {
    return NextResponse.json({ status: "disabled" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const { candidate_id, new_conversation_id, also_refetch_transcript } = body;

    if (!candidate_id || !new_conversation_id) {
      return NextResponse.json({ error: "Falta candidate_id o new_conversation_id" }, { status: 400 });
    }

    // Pull entrevista actual
    const { data: ai } = await supabaseAdmin
      .from("ht_ai_interviews")
      .select("id, token, conversation_id, transcript")
      .eq("candidate_id", candidate_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ai) return NextResponse.json({ error: "Sin entrevista IA para este candidato" }, { status: 404 });

    const oldCid = ai.conversation_id;

    // Construir nuevo audio_url proxy
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host');
    const baseUrl = host && !host.includes('localhost')
      ? `${proto}://${host}`
      : 'https://trading-solutions-careers.vercel.app';
    const newAudioUrl = `${baseUrl}/api/headhunting/ai-interview/${ai.token}/audio?cid=${new_conversation_id}`;

    const updates: any = {
      conversation_id: new_conversation_id,
      audio_url: newAudioUrl,
    };

    // Refetch transcript si lo pidieron
    let transcriptInfo: any = null;
    if (also_refetch_transcript && process.env.ELEVENLABS_API_KEY) {
      try {
        const r = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${new_conversation_id}`,
          { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } }
        );
        if (r.ok) {
          const j = await r.json();
          updates.transcript = j;
          transcriptInfo = {
            turns: Array.isArray(j.transcript) ? j.transcript.length : null,
            duration_secs: j.metadata?.call_duration_secs || null,
          };
        }
      } catch (e) {
        console.error("refetch transcript failed:", e);
      }
    }

    const { error: upErr } = await supabaseAdmin
      .from("ht_ai_interviews")
      .update(updates)
      .eq("id", ai.id);

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      candidate_id,
      old_conversation_id: oldCid,
      new_conversation_id,
      audio_url: newAudioUrl,
      transcript_refetched: !!also_refetch_transcript,
      transcript_info: transcriptInfo,
    });
  } catch (err: any) {
    console.error("fix-conversation error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
