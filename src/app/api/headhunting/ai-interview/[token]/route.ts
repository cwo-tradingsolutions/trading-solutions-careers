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
        interview_id: String(interview.id),
      };

      // Request signed URL from ElevenLabs. include_conversation_id stores the
      // id on this interview before the candidate can send one.
      const url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(interview.agent_id)}&include_conversation_id=true`;
      const r = await fetch(url, {
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
      });
      if (r.ok) {
        const j = await r.json();
        signedUrl = j.signed_url;
        if (typeof j.conversation_id === "string" && j.conversation_id && !isPreviewTestMode()) {
          const { error: bindError } = await supabaseAdmin
            .from("ht_ai_interviews")
            .update({ conversation_id: j.conversation_id })
            .eq("id", interview.id);
          if (bindError) console.error("ai-interview bind conversation failed");
        }
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
