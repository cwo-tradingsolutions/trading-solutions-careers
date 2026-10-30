/**
 * POST /api/admin/diag/revert-vianny
 *
 * Revierte el cambio incorrecto que hice en Vianny Santiago.
 * Su conversation_id ORIGINAL (la suya real) era:
 *   conv_1501kqtp9wazf9q9ckm0jztetew8
 *
 * Yo la actualicé incorrectamente a conv_5201kqqgnaycerfrn4d627rjs3f5
 * (que era de Lisbeth, no de Vianny).
 *
 * Este endpoint:
 *   1. Restaura el conversation_id original
 *   2. Borra el transcript que sobreescribí (era de Lisbeth)
 *   3. Pull el transcript real de Vianny desde ElevenLabs
 *   4. Actualiza audio_url al de Vianny original
 *
 * IMPORTANTE: el ai_score (72) que tiene Vianny en BD se computó del
 * transcript original (parcial). Eso queda válido.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { aiInterviewEnabled } from "@/lib/ai-interview-flag";

export const runtime = "nodejs";

const VIANNY_CANDIDATE_ID = "e683b0eb-e92c-4fca-80c6-23e23da28c9f";
const VIANNY_ORIGINAL_CID = "conv_1501kqtp9wazf9q9ckm0jztetew8";

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  if (!aiInterviewEnabled()) {
    return NextResponse.json({ status: "disabled" }, { status: 503 });
  }

  // Pull entrevista actual
  const { data: ai } = await supabaseAdmin
    .from("ht_ai_interviews")
    .select("id, token, conversation_id, transcript")
    .eq("candidate_id", VIANNY_CANDIDATE_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ai) return NextResponse.json({ error: "Sin entrevista IA para Vianny" }, { status: 404 });

  // Reconstruir audio_url al original
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host') || 'trading-solutions-careers.vercel.app';
  const baseUrl = `${proto}://${host}`;
  const originalAudioUrl = `${baseUrl}/api/headhunting/ai-interview/${ai.token}/audio?cid=${VIANNY_ORIGINAL_CID}`;

  // Re-fetch el transcript REAL de Vianny desde ElevenLabs
  let originalTranscript: any = null;
  let elevenLabsStatus: any = null;
  if (process.env.ELEVENLABS_API_KEY) {
    try {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations/${VIANNY_ORIGINAL_CID}`,
        { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } }
      );
      elevenLabsStatus = r.status;
      if (r.ok) {
        originalTranscript = await r.json();
      }
    } catch (e) {
      console.error("revert-vianny: refetch transcript failed:", e);
    }
  }

  const updates: any = {
    conversation_id: VIANNY_ORIGINAL_CID,
    audio_url: originalAudioUrl,
  };
  if (originalTranscript) {
    updates.transcript = originalTranscript;
  }

  const { error: upErr } = await supabaseAdmin
    .from("ht_ai_interviews")
    .update(updates)
    .eq("id", ai.id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    candidate_id: VIANNY_CANDIDATE_ID,
    candidate_name: "Vianny Santiago",
    reverted_to_cid: VIANNY_ORIGINAL_CID,
    elevenlabs_status: elevenLabsStatus,
    transcript_refetched: !!originalTranscript,
    transcript_turns: Array.isArray(originalTranscript?.transcript) ? originalTranscript.transcript.length : null,
    note: "Vianny revertida a su conversation_id original. El audio puede seguir sin estar disponible (esa fue la razón del problema inicial). Para escucharla hay que reenviar entrevista.",
  });
}
