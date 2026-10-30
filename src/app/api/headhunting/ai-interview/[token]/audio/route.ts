/**
 * GET /api/headhunting/ai-interview/[token]/audio
 *
 * Streams el audio de la conversación de ElevenLabs sin buffearlo en memoria.
 * Soporta Range requests para que el <audio> pueda hacer seek y empezar a
 * reproducir antes de descargar el archivo completo.
 *
 * Acepta conversation_id por query param (?cid=conv_xxx) para mantener el
 * endpoint stateless cuando el audio_url viene precomputado en /finalize.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { publicStepBody } from "@/lib/candidate-public-error";

// Forzar runtime Node.js para soportar streaming de body grande
export const runtime = "nodejs";
// Permitir respuestas largas (Vercel free: 30s; pro: 60s+).
// El audio puede ser de 20-30MB (entrevistas de 25 min) y bajarlo + procesarlo
// puede tardar 5-15s la primera vez. Después el browser cachea con max-age.
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  const url = new URL(req.url);
  let conversationId: string | null = url.searchParams.get("cid");

  // Si no viene por query, lookup en DB
  if (!conversationId) {
    const { data, error } = await supabaseAdmin
      .from("ht_ai_interviews")
      .select("conversation_id")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("ai-interview audio lookup", error);
      return NextResponse.json(publicStepBody(), { status: 500 });
    }
    if (!data?.conversation_id) {
      return NextResponse.json({ error: "no_conversation_id" }, { status: 404 });
    }
    conversationId = data.conversation_id;
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "elevenlabs_not_configured" }, { status: 503 });
  }

  try {
    // ─── ElevenLabs NO soporta Range requests ───
    // Devuelve 200 con cuerpo entero, ignora Range. Eso confunde al <audio>
    // que recibe 200 sin Content-Length y muestra `--:--` en duración.
    //
    // Solución: bajamos el audio entero de ElevenLabs (sin Range), lo
    // bufferizamos, y nosotros respondemos al browser con:
    //   - 206 Partial Content + Content-Range (si pidió Range)
    //   - 200 OK + Content-Length completo (si no)
    const rangeHeader = req.headers.get("range");

    const r = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`,
      { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } }
    );

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("ai-interview audio upstream", r.status, detail.slice(0, 200));
      return NextResponse.json(
        { error: "elevenlabs_fetch_failed", status: r.status },
        { status: 502 }
      );
    }

    // Buffer el audio entero (puede ser 5-30MB según duración)
    const arrayBuffer = await r.arrayBuffer();
    const audio = Buffer.from(arrayBuffer);
    const totalSize = audio.length;
    const contentType = r.headers.get("Content-Type") || "audio/mpeg";

    // Headers comunes
    const baseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      // Cache 24h: el audio es inmutable por conversation_id
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Disposition": `inline; filename="entrevista-${conversationId}.mp3"`,
      "Access-Control-Allow-Origin": "*",
    };

    // ─── Caso 1: el browser pidió Range (típico para seek/streaming) ───
    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = m[2] && m[2].length > 0
          ? Math.min(parseInt(m[2], 10), totalSize - 1)
          : totalSize - 1;

        if (start >= totalSize || start > end) {
          return new NextResponse(null, {
            status: 416, // Range Not Satisfiable
            headers: { "Content-Range": `bytes */${totalSize}` },
          });
        }

        const slice = audio.subarray(start, end + 1);
        return new NextResponse(slice, {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Length": String(slice.length),
            "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          },
        });
      }
    }

    // ─── Caso 2: sin Range — devolver todo con 200 + Content-Length ───
    return new NextResponse(audio, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Length": String(totalSize),
      },
    });
  } catch (err) {
    console.error("audio proxy error:", err);
    return NextResponse.json(publicStepBody(), { status: 500 });
  }
}

// HEAD para que el <audio> pueda hacer pre-flight check rápido
// IMPORTANTE: ElevenLabs NO soporta HEAD para /audio (devuelve 405).
// Hacemos GET con Range: bytes=0-0 (solo 1 byte) para validar sin descargar todo.
export async function HEAD(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  const url = new URL(req.url);
  let conversationId: string | null = url.searchParams.get("cid");

  if (!conversationId) {
    const { data } = await supabaseAdmin
      .from("ht_ai_interviews")
      .select("conversation_id")
      .eq("token", token)
      .maybeSingle();
    conversationId = data?.conversation_id || null;
  }

  if (!conversationId || !process.env.ELEVENLABS_API_KEY) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    // GET con Range: bytes=0-0 — ElevenLabs sí soporta esto y devuelve 206
    // con metadata sin descargar el audio entero
    const r = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`,
      {
        method: "GET",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Range": "bytes=0-0",
        },
      }
    );
    // Cerramos body inmediatamente para no descargar más bytes
    if (r.body) {
      try { r.body.cancel?.(); } catch {}
    }
    return new NextResponse(null, {
      status: (r.status === 200 || r.status === 206) ? 200 : r.status,
      headers: {
        "Content-Type": r.headers.get("Content-Type") || "audio/mpeg",
        "Content-Length": r.headers.get("Content-Length") || "0",
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
