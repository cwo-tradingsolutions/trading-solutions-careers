/**
 * POST /api/admin/rescore-ai-interviews
 *
 * Re-score de entrevistas AI que tienen status=completed + conversation_id pero sin ai_score.
 * Útil cuando el conversation_id se metió manualmente y nunca corrió el scoring inicial.
 *
 * Para cada interview:
 *   1. Pull transcript desde ElevenLabs API usando conversation_id
 *   2. Llama al endpoint /finalize internamente (corre 3 agentes Claude: scoring + competencias + inglés)
 *   3. Actualiza ht_ai_interviews con los resultados
 *
 * Body opcional: { interview_ids?: string[] } — si querés limitar a IDs específicos
 *
 * Llamar:
 *   fetch('/api/admin/rescore-ai-interviews', { method: 'POST' }).then(r => r.json()).then(console.log)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const interviewIdsFilter: string[] | null = Array.isArray(body.interview_ids) ? body.interview_ids : null;

    // 1. Find all interviews ready to rescore
    let query = supabaseAdmin
      .from("ht_ai_interviews")
      .select("id, token, conversation_id, candidate_id")
      .eq("status", "completed")
      .not("conversation_id", "is", null)
      .is("ai_score", null);

    if (interviewIdsFilter && interviewIdsFilter.length > 0) {
      query = query.in("id", interviewIdsFilter);
    }

    const { data: pending, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!pending || pending.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Sin entrevistas pendientes de re-scoring",
        rescored: 0,
      });
    }

    // 2. Construir baseUrl para invocar finalize internamente
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host');
    const baseUrl = host && !host.includes('localhost')
      ? `${proto}://${host}`
      : "https://trading-solutions-careers.vercel.app";

    const results: Array<{ interview_id: string; success: boolean; score?: number; error?: string; error_kind?: string; http_status?: number }> = [];

    // 3. Para cada interview, invocar /finalize con timeout explícito
    for (const interview of pending) {
      try {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 90_000); // 90s timeout

        const r = await fetch(`${baseUrl}/api/headhunting/ai-interview/${interview.token}/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: interview.conversation_id }),
          signal: ctrl.signal,
        }).finally(() => clearTimeout(timeoutId));

        const j = await r.json();
        if (j.success && j.scored) {
          results.push({
            interview_id: interview.id,
            success: true,
            score: j.score,
          });
        } else if (j.note === "No transcript available") {
          results.push({
            interview_id: interview.id,
            success: false,
            error: "ElevenLabs no tiene transcript para este conversation_id. Probablemente el audio expiró o nunca se grabó completo. Reenviar entrevista.",
            error_kind: "no_transcript",
          });
        } else {
          results.push({
            interview_id: interview.id,
            success: false,
            error: j.error || j.note || `HTTP ${r.status} sin scoring`,
            error_kind: "scoring_failed",
            http_status: r.status,
          });
        }
      } catch (e: any) {
        const isAbort = e?.name === 'AbortError';
        results.push({
          interview_id: interview.id,
          success: false,
          error: isAbort
            ? "Timeout: el scoring tardó más de 90s. Probablemente Anthropic está lento o transcript muy largo. Reintentar."
            : (e?.message || String(e)),
          error_kind: isAbort ? "timeout" : "exception",
        });
      }
    }

    return NextResponse.json({
      success: true,
      rescored: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      total: pending.length,
      results,
    });
  } catch (err: any) {
    console.error("rescore-ai-interviews error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}

// GET para preview
export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { data: pending } = await supabaseAdmin
    .from("ht_ai_interviews")
    .select("id, conversation_id, completed_at, candidate:ht_candidates(name, email, vacancy_id)")
    .eq("status", "completed")
    .not("conversation_id", "is", null)
    .is("ai_score", null)
    .order("completed_at", { ascending: false });

  return NextResponse.json({
    pending_count: pending?.length || 0,
    pending: (pending || []).map((p: any) => ({
      interview_id: p.id,
      candidate_name: p.candidate?.name,
      candidate_email: p.candidate?.email,
      conversation_id: p.conversation_id?.slice(0, 20) + '…',
      completed_at: p.completed_at,
    })),
  });
}
