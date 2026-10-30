/**
 * GET /api/admin/diag/identify-session?cid=conv_xxx
 *
 * Lee la primera parte del transcript de una conversación de ElevenLabs y
 * extrae las pistas que identifican al candidato:
 *   - dynamic_variables (pueden tener candidate_name, vacancy_title, etc.)
 *   - first_message del agent (típicamente "Hola Juan, gracias por...")
 *   - primeros 3 turnos del transcript
 *
 * Útil para confirmar qué candidato corresponde a una conversation_id antes
 * de hacer fix-conversation y evitar mezclar entrevistas.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { aiInterviewEnabled } from "@/lib/ai-interview-flag";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  if (!aiInterviewEnabled()) {
    return NextResponse.json({ status: "disabled" }, { status: 503 });
  }

  const url = new URL(req.url);
  const cid = url.searchParams.get("cid");

  if (!cid) return NextResponse.json({ error: "Pasá ?cid=conv_xxx" }, { status: 400 });
  if (!process.env.ELEVENLABS_API_KEY) return NextResponse.json({ error: "API key no configurada" }, { status: 503 });

  const r = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${cid}`,
    { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } }
  );
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return NextResponse.json({ error: "elevenlabs_failed", status: r.status, detail: detail.slice(0, 200) }, { status: 502 });
  }

  const j = await r.json();

  // Extraer los nombres mencionados en los primeros mensajes del agent
  const transcript = Array.isArray(j.transcript) ? j.transcript : [];
  const firstAgentMessages = transcript.filter((t: any) => t.role === 'agent').slice(0, 3);
  const firstUserMessages = transcript.filter((t: any) => t.role === 'user').slice(0, 3);

  // Capturar nombres potenciales en los primeros mensajes
  const allText = [
    ...firstAgentMessages.map((t: any) => t.message || ''),
    ...firstUserMessages.map((t: any) => t.message || ''),
  ].join(' ');

  // Heurística: capturar palabras tipo "Hola NOMBRE" o "soy NOMBRE"
  const possibleNames: string[] = [];
  const patterns = [
    /[Hh]ola[,\s]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/g,
    /[Mm]i\s+nombre\s+es\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/g,
    /[Ss]oy\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/g,
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(allText)) !== null) {
      if (m[1] && m[1].length > 2 && !['Vamos', 'Soy', 'Trading', 'Solutions'].includes(m[1])) {
        possibleNames.push(m[1]);
      }
    }
  }

  return NextResponse.json({
    conversation_id: cid,
    status: j.status,
    duration_secs: j.metadata?.call_duration_secs,
    start_time_unix: j.metadata?.start_time_unix_secs,
    start_time_iso: j.metadata?.start_time_unix_secs ? new Date(j.metadata.start_time_unix_secs * 1000).toISOString() : null,
    turn_count: transcript.length,
    dynamic_variables: j.metadata?.dynamic_variables || j.conversation_initiation_client_data?.dynamic_variables || null,
    first_agent_message: firstAgentMessages[0]?.message?.slice(0, 300) || null,
    first_user_message: firstUserMessages[0]?.message?.slice(0, 300) || null,
    possible_candidate_names: [...new Set(possibleNames)].slice(0, 5),
  });
}
