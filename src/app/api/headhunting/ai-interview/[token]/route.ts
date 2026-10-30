/**
 * GET /api/headhunting/ai-interview/[token]
 *
 * Valida el token de entrevista IA y devuelve la configuración necesaria
 * para que la página candidate-facing inicie la conversación con ElevenLabs.
 *
 * Devuelve:
 *   - candidate (nombre, email)
 *   - vacancy (título, área)
 *   - client (nombre)
 *   - agent_id (ElevenLabs)
 *   - signed_url (para iniciar la conversación con vars dinámicas pre-llenadas)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewTestMode } from "@/lib/preview-mode";
import {
  allowFinalizeLookup,
  conversationMatchesInterview,
  fetchElevenConversation,
} from "@/lib/ai-interview-finalize";

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  const { data: interview, error } = await supabaseAdmin
    .from("ht_ai_interviews")
    .select("*, ht_candidates(id, name, email, vacancy_id, ht_vacancies(title, area, model_id), ht_clients(name))")
    .eq("token", token)
    .single();

  if (error || !interview) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  if (interview.status === "completed") {
    return NextResponse.json({ error: "already_completed" }, { status: 409 });
  }

  // Token evergreen · si el candidato hace click, extendemos 7 días más.
  // Razón: drafts de Gmail pueden sentarse días antes de enviar · si el link
  // expira en el camino, candidato recibe link muerto sin culpa.
  if (interview.token_expires_at) {
    const expires = new Date(interview.token_expires_at);
    const now = new Date();
    if (!isPreviewTestMode() && (expires < now || (expires.getTime() - now.getTime()) < 3 * 24 * 60 * 60 * 1000)) {
      const fresh = new Date();
      fresh.setDate(fresh.getDate() + 7);
      await supabaseAdmin
        .from("ht_ai_interviews")
        .update({ token_expires_at: fresh.toISOString() })
        .eq("id", interview.id);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = (interview as any).ht_candidates;
  const vacancy = candidate?.ht_vacancies;
  const client = candidate?.ht_clients;

  // Get a signed URL from ElevenLabs API to start the conversation
  // (this is the recommended approach — keeps API key server-side)
  let signedUrl: string | null = null;
  let dynamicVars: Record<string, string> = {};

  if (process.env.ELEVENLABS_API_KEY && interview.agent_id) {
    try {
      // Build dynamic variables for the agent prompt
      dynamicVars = {
        candidate_name: candidate?.name || "candidato",
        first_name: (candidate?.name || "").split(" ")[0] || "candidato",
        vacancy_title: vacancy?.title || "la vacante",
        vacancy_area: vacancy?.area || "—",
        client_name: client?.name || "Trading Solutions",
        recruiter_name: "Talent Acquisition Team",
        interview_token: token,
      };

      // A new signed URL can belong to a new call. The conversation id is stored
      // when that call actually starts (POST), not from this preload.
      const url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(interview.agent_id)}`;
      const r = await fetch(url, {
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
      });
      if (r.ok) {
        const j = await r.json();
        signedUrl = j.signed_url;
      } else {
        console.error("ElevenLabs signed URL failed:", r.status);
      }
    } catch (e) {
      console.error("ElevenLabs signed URL error:", e);
    }
  }

  // Mark as in_progress when first accessed. Preview never writes.
  if (!isPreviewTestMode() && interview.status === "invited") {
    await supabaseAdmin
      .from("ht_ai_interviews")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", interview.id);
  }

  return NextResponse.json({
    interview_id: interview.id,
    candidate: { id: candidate?.id, name: candidate?.name, email: candidate?.email },
    vacancy: vacancy ? { title: vacancy.title, area: vacancy.area } : null,
    client: client || { name: "Trading Solutions" },
    agent_id: interview.agent_id,
    signed_url: signedUrl,
    dynamic_variables: dynamicVars,
  });
}

/**
 * POST stores the conversation that just started. A reload gets a new signed
 * URL; this replaces the previous id only after ElevenLabs shows this token.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  if (isPreviewTestMode()) {
    return NextResponse.json({ ok: true });
  }

  const { token } = params;
  const body = await req.json().catch(() => ({}));
  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id.trim() : "";
  if (!conversationId) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const { data: interview, error } = await supabaseAdmin
    .from("ht_ai_interviews")
    .select("id, token, status, agent_id, conversation_id")
    .eq("token", token)
    .single();

  if (error || !interview) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
  if (interview.status === "completed") {
    return NextResponse.json({ status: "completed" });
  }
  if (!allowFinalizeLookup(token)) {
    return NextResponse.json({ status: "in_progress" }, { status: 429 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json({ status: "in_progress" });
  }

  const detail = await fetchElevenConversation(conversationId, apiKey);
  const matches = detail && conversationMatchesInterview(detail, {
    id: interview.id,
    token,
    status: interview.status,
    agent_id: interview.agent_id,
    conversation_id: interview.conversation_id,
  });
  if (!matches) {
    return NextResponse.json({ ok: false }, { status: 409 });
  }

  const { error: writeError } = await supabaseAdmin
    .from("ht_ai_interviews")
    .update({ conversation_id: conversationId })
    .eq("id", interview.id)
    .neq("status", "completed");
  if (writeError) {
    console.error("ai-interview bind failed");
    return NextResponse.json({ error: "invalid_token" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
