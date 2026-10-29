/**
 * POST   /api/admin/candidates/[id]/pause-reminders
 * DELETE /api/admin/candidates/[id]/pause-reminders
 *
 * Pausa o reanuda recordatorios automáticos para un candidato específico.
 * Útil para top candidates que están de viaje o en situaciones especiales.
 *
 * POST body: { until: ISO_date, reason?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { until, reason } = body;
    if (!until) return NextResponse.json({ error: "Falta until (ISO date)" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("ts_candidate_reminders_paused")
      .upsert({
        candidate_id: params.candidateId,
        paused_until: until,
        reason: reason || null,
        paused_by: "manual",
      });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, paused_until: until });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  const { error } = await supabaseAdmin
    .from("ts_candidate_reminders_paused")
    .delete()
    .eq("candidate_id", params.candidateId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
