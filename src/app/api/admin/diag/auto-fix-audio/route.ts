/**
 * POST /api/admin/diag/auto-fix-audio
 *
 * Auto-fix masivo: recorre todas las entrevistas con audio vacío
 * (causadas por candidatos que cortaron y reanudaron, dejando varias
 * sesiones en ElevenLabs y la BD apuntando a la primera/incompleta).
 *
 * Para cada entrevista problemática:
 *   1. Lista todas las sesiones del agent en ±48h del started_at
 *   2. Identifica la sesión más larga con audio real (>1KB)
 *   3. Si es distinta a la guardada, actualiza conversation_id + audio_url
 *   4. Refresca transcript desde ElevenLabs
 *
 * Devuelve reporte detallado: cuántos reparados, cuántos OK, cuántos sin sesión válida.
 *
 * Body opcional: { dry_run: true } → solo simula, no escribe.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { aiInterviewEnabled } from "@/lib/ai-interview-flag";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  if (!aiInterviewEnabled()) {
    return NextResponse.json({ status: "disabled" }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dry_run;

    if (!process.env.ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: "ElevenLabs API key no configurada" }, { status: 503 });
    }

    // 1. Pull todas las entrevistas completadas con conversation_id
    //    + JOIN con candidato para tener su nombre (necesario para validación)
    const { data: interviews } = await supabaseAdmin
      .from("ht_ai_interviews")
      .select("id, candidate_id, token, conversation_id, agent_id, started_at, ai_score, ht_candidates(name)")
      .eq("status", "completed")
      .not("conversation_id", "is", null)
      .order("created_at", { ascending: false });

    if (!interviews || interviews.length === 0) {
      return NextResponse.json({ message: "Sin entrevistas para auditar", scanned: 0 });
    }

    // Group por agent_id para optimizar (1 list call por agent)
    const byAgent: Record<string, typeof interviews> = {};
    interviews.forEach(it => {
      if (!it.agent_id) return;
      if (!byAgent[it.agent_id]) byAgent[it.agent_id] = [];
      byAgent[it.agent_id].push(it);
    });

    const results: any[] = [];

    for (const [agentId, agentInterviews] of Object.entries(byAgent)) {
      // Pull todas las conversaciones del agent (100 = max permitido por ElevenLabs)
      const r = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=100`,
        { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! } }
      );
      if (!r.ok) {
        results.push({ agent_id: agentId, error: `ElevenLabs list failed: ${r.status}` });
        continue;
      }
      const j = await r.json();
      const allConvos = (j.conversations || j.history || []) as any[];

      // Para cada entrevista de este agent
      for (const it of agentInterviews) {
        const candidateName: string = (it as any).ht_candidates?.name || "";
        const firstName = candidateName.split(" ")[0]?.trim() || "";
        const firstNameNorm = firstName.toLowerCase()
          .normalize("NFD").replace(/\p{Diacritic}/gu, "");

        // PASO 0 — VERIFICAR PRIMERO si la conversation_id actual de la BD
        // ya es válida (tiene audio + nombre matchea). Si sí, no hace falta
        // buscar en el listado paginado (que puede no incluir la sesión correcta).
        if (it.conversation_id) {
          try {
            // Pull metadata de la cid actual
            const metaR = await fetch(
              `https://api.elevenlabs.io/v1/convai/conversations/${it.conversation_id}`,
              { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! } }
            );
            if (metaR.ok) {
              const meta = await metaR.json();

              // ✅ FUENTE DE VERDAD: dynamic_variables.candidate_name
              // Lo setea nuestro backend cuando inicia la conversación con ElevenLabs.
              // Si esto no matchea, la cid es de OTRO candidato (cruce confirmado).
              const dynVars = meta.conversation_initiation_client_data?.dynamic_variables
                || meta.metadata?.dynamic_variables
                || {};
              const cidCandidateName: string = dynVars.candidate_name || dynVars.first_name || "";
              const cidCandidateNorm = cidCandidateName.toLowerCase()
                .normalize("NFD").replace(/\p{Diacritic}/gu, "");
              const candidateNameNorm = candidateName.toLowerCase()
                .normalize("NFD").replace(/\p{Diacritic}/gu, "");

              // Match si el candidate_name del dynamic_variable coincide con el de la BD
              // (compara por nombre completo o al menos primer nombre)
              const dynVarMatch = cidCandidateName.length >= 3 && (
                cidCandidateNorm === candidateNameNorm ||
                cidCandidateNorm.includes(firstNameNorm) ||
                candidateNameNorm.includes(cidCandidateNorm.split(" ")[0] || "")
              );

              // Bajar audio para confirmar tamaño
              const audioR = await fetch(
                `https://api.elevenlabs.io/v1/convai/conversations/${it.conversation_id}/audio`,
                { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! } }
              );
              const audioBuf = audioR.ok ? await audioR.arrayBuffer() : null;
              const audioBytes = audioBuf ? audioBuf.byteLength : 0;

              if (audioBytes > 1000 && dynVarMatch) {
                // ✅ Audio existe Y dynamic_variable matchea: 100% correcto
                results.push({
                  candidate_id: it.candidate_id,
                  candidate_name: candidateName,
                  status: "already_correct",
                  audio_size_kb: Math.round(audioBytes / 1024),
                  validated_by: "dynamic_variables.candidate_name",
                  cid_candidate_name: cidCandidateName,
                });
                continue;
              } else if (audioBytes > 1000 && cidCandidateName && !dynVarMatch) {
                // 🚨 CRUCE CONFIRMADO por dynamic_variables
                results.push({
                  candidate_id: it.candidate_id,
                  candidate_name: candidateName,
                  status: "cid_mismatch_other_candidate",
                  current_cid: it.conversation_id,
                  audio_size_kb: Math.round(audioBytes / 1024),
                  cid_actually_belongs_to: cidCandidateName,
                  recommendation: `La conversación actual pertenece a "${cidCandidateName}", no a "${candidateName}". Reenviar entrevista a este candidato.`,
                });
                continue;
              } else if (audioBytes > 1000 && !cidCandidateName) {
                // Audio existe pero la conversación no tiene dynamic_variables (sesión vieja).
                // Validar por transcript como fallback.
                const transcript = Array.isArray(meta.transcript) ? meta.transcript : [];
                const firstAgent = transcript.find((t: any) => t.role === 'agent')?.message || '';
                const haystack = firstAgent.toLowerCase()
                  .normalize("NFD").replace(/\p{Diacritic}/gu, "");
                const transcriptMatch = firstNameNorm.length >= 3 && haystack.includes(firstNameNorm);

                results.push({
                  candidate_id: it.candidate_id,
                  candidate_name: candidateName,
                  status: transcriptMatch ? "already_correct" : "audio_ok_name_unclear",
                  audio_size_kb: Math.round(audioBytes / 1024),
                  validated_by: transcriptMatch ? "transcript_first_message" : null,
                  first_agent_message: firstAgent.slice(0, 200),
                  note: transcriptMatch ? null : "Sin dynamic_variables y agent saluda genérico. Revisar manualmente.",
                });
                continue;
              }
              // Si llegamos acá: audio < 1000 bytes → cae al PASO 1
            }
          } catch {}
        }

        // PASO 1 — Si la cid actual no funciona, buscar alternativas en el listado
        const startedUnix = it.started_at ? Math.floor(new Date(it.started_at).getTime() / 1000) : 0;
        if (!startedUnix) {
          results.push({ candidate_id: it.candidate_id, status: "skip", reason: "Sin started_at" });
          continue;
        }

        // Filtrar conversaciones cercanas
        const nearby = allConvos.filter((c: any) => {
          const cStart = c.start_time_unix_secs || 0;
          return Math.abs(cStart - startedUnix) < 48 * 60 * 60;
        });

        if (nearby.length === 0) {
          results.push({
            candidate_id: it.candidate_id,
            status: "no_sessions_found",
            current_cid: it.conversation_id,
          });
          continue;
        }

        // CRÍTICO: como el agent_id es compartido entre TODOS los candidatos,
        // filtrar solo por timestamp puede asignar la conversación de OTRA persona.
        // Validamos por NOMBRE leyendo el primer mensaje del agent en cada conversación.
        // (candidateName, firstName y firstNameNorm ya declarados arriba en PASO 0)

        const candidates = nearby
          .filter((c: any) => c.status === "done" && (c.call_duration_secs || 0) >= 30)
          .sort((a: any, b: any) => {
            const da = a.call_duration_secs || 0;
            const db = b.call_duration_secs || 0;
            if (db !== da) return db - da;
            return (b.message_count || 0) - (a.message_count || 0);
          });

        // Para cada conversación cercana, leer el transcript y verificar el nombre
        // saludado por el agent. Solo aceptar las que matchean al candidato actual.
        const top = candidates.slice(0, 5);
        const checks = await Promise.all(
          top.map(async (c: any) => {
            try {
              // 1. Pull metadata + transcript
              const metaR = await fetch(
                `https://api.elevenlabs.io/v1/convai/conversations/${c.conversation_id}`,
                { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! } }
              );
              if (!metaR.ok) return null;
              const meta = await metaR.json();
              const transcript = Array.isArray(meta.transcript) ? meta.transcript : [];
              const firstAgent = transcript.find((t: any) => t.role === 'agent')?.message || '';
              const firstUser = transcript.find((t: any) => t.role === 'user')?.message || '';

              // 2. Validar nombre — el agent dice "Hola Vianny" / "Hola María"
              //    O el candidato se presenta "Soy Vianny"
              const haystack = (firstAgent + ' ' + firstUser).toLowerCase()
                .normalize("NFD").replace(/\p{Diacritic}/gu, "");
              const nameMatches = firstNameNorm.length >= 3 && haystack.includes(firstNameNorm);

              if (!nameMatches) return { convo: c, size: 0, name_match: false, skipped: 'name_mismatch' };

              // 3. Solo si nombre matchea, bajar audio para verificar tamaño
              const audioR = await fetch(
                `https://api.elevenlabs.io/v1/convai/conversations/${c.conversation_id}/audio`,
                { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! } }
              );
              if (audioR.ok) {
                const buf = await audioR.arrayBuffer();
                return { convo: c, size: buf.byteLength, name_match: true, full_transcript: meta };
              }
            } catch {}
            return null;
          })
        );

        // Filtrar solo las con name_match Y audio real
        const valid = checks
          .filter(x => x && (x as any).name_match && (x as any).size > 1000) as
          { convo: any; size: number; name_match: boolean; full_transcript: any }[];
        const bestConvo = valid[0]?.convo || null;
        const bestSize = valid[0]?.size || 0;
        const bestTranscript = valid[0]?.full_transcript || null;

        if (!bestConvo) {
          results.push({
            candidate_id: it.candidate_id,
            status: "no_audio_in_any_session",
            sessions_found: nearby.length,
            current_cid: it.conversation_id,
          });
          continue;
        }

        // ¿La BD ya apunta a la mejor?
        if (bestConvo.conversation_id === it.conversation_id) {
          results.push({
            candidate_id: it.candidate_id,
            status: "already_correct",
            audio_size_kb: Math.round(bestSize / 1024),
          });
          continue;
        }

        // ¡Necesita fix!
        if (dryRun) {
          results.push({
            candidate_id: it.candidate_id,
            candidate_name: candidateName,
            status: "would_fix",
            old_cid: it.conversation_id,
            new_cid: bestConvo.conversation_id,
            new_audio_size_kb: Math.round(bestSize / 1024),
            new_duration_secs: bestConvo.call_duration_secs,
            name_validated: true,
          });
        } else {
          // Reutilizar transcript ya descargado durante validación de nombre
          const newTranscript: any = bestTranscript;

          // Construir audio_url proxy
          const proto = req.headers.get('x-forwarded-proto') || 'https';
          const host = req.headers.get('host') || 'trading-solutions-careers.vercel.app';
          const baseUrl = `${proto}://${host}`;
          const newAudioUrl = `${baseUrl}/api/headhunting/ai-interview/${it.token}/audio?cid=${bestConvo.conversation_id}`;

          const updates: any = {
            conversation_id: bestConvo.conversation_id,
            audio_url: newAudioUrl,
          };
          if (newTranscript) updates.transcript = newTranscript;

          const { error: upErr } = await supabaseAdmin
            .from("ht_ai_interviews")
            .update(updates)
            .eq("id", it.id);

          if (upErr) {
            results.push({
              candidate_id: it.candidate_id,
              status: "fix_failed",
              error: upErr.message,
            });
          } else {
            results.push({
              candidate_id: it.candidate_id,
              status: "fixed",
              old_cid: it.conversation_id,
              new_cid: bestConvo.conversation_id,
              new_audio_size_kb: Math.round(bestSize / 1024),
              new_duration_secs: bestConvo.call_duration_secs,
              transcript_refetched: !!newTranscript,
              had_score: it.ai_score != null,
              note: it.ai_score != null ? "Re-correr scoring porque transcript cambió" : null,
            });
          }
        }
      }
    }

    const summary = {
      scanned: interviews.length,
      fixed: results.filter(r => r.status === "fixed").length,
      already_correct: results.filter(r => r.status === "already_correct").length,
      would_fix: results.filter(r => r.status === "would_fix").length,
      cid_mismatch_other_candidate: results.filter(r => r.status === "cid_mismatch_other_candidate").length,
      audio_ok_name_unclear: results.filter(r => r.status === "audio_ok_name_unclear").length,
      no_audio: results.filter(r => r.status === "no_audio_in_any_session").length,
      no_sessions: results.filter(r => r.status === "no_sessions_found").length,
      errors: results.filter(r => r.status === "fix_failed" || r.error).length,
    };

    return NextResponse.json({
      dry_run: dryRun,
      summary,
      results,
    });
  } catch (err: any) {
    console.error("auto-fix-audio error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
