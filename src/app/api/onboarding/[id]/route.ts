/**
 * GET    /api/onboarding/[id] → detalle completo
 * PATCH  /api/onboarding/[id] → actualizar tasks/notes/checkins
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { OnboardingTask, computeProgress } from "@/lib/onboarding-tasks";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from("ts_onboarding")
    .select("*, person:ts_people(*)")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Onboarding no encontrado" }, { status: 404 });

  return NextResponse.json({ onboarding: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const updates: any = { updated_at: new Date().toISOString() };

    // Toggle a single task
    if (body.toggle_task_id) {
      const { data: existing, error } = await supabaseAdmin
        .from("ts_onboarding")
        .select("tasks")
        .eq("id", params.id)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const tasks: OnboardingTask[] = (existing.tasks || []).map((t: OnboardingTask) =>
        t.id === body.toggle_task_id
          ? { ...t, done: !t.done, done_at: !t.done ? new Date().toISOString() : null }
          : t
      );
      updates.tasks = tasks;

      // Auto-update milestone completion timestamps
      const prog = computeProgress(tasks);
      if (prog.byMilestone.day1.pct === 100) updates.day1_completed_at = updates.day1_completed_at ?? new Date().toISOString();
      if (prog.byMilestone.week1.pct === 100) updates.week1_completed_at = updates.week1_completed_at ?? new Date().toISOString();
      if (prog.byMilestone.day30.pct === 100) updates.day30_completed_at = updates.day30_completed_at ?? new Date().toISOString();
      if (prog.byMilestone.day60.pct === 100) updates.day60_completed_at = updates.day60_completed_at ?? new Date().toISOString();
      if (prog.byMilestone.day90.pct === 100) {
        updates.day90_completed_at = updates.day90_completed_at ?? new Date().toISOString();
        updates.status = 'completed';
      } else if (prog.pct > 0) {
        updates.status = 'in_progress';
      }
    }

    // Direct field updates
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.manager_30d_check_in !== undefined) updates.manager_30d_check_in = body.manager_30d_check_in;
    if (body.manager_60d_check_in !== undefined) updates.manager_60d_check_in = body.manager_60d_check_in;
    if (body.manager_90d_review !== undefined) updates.manager_90d_review = body.manager_90d_review;
    if (body.ramp_up_score !== undefined) updates.ramp_up_score = body.ramp_up_score;
    if (body.status !== undefined) updates.status = body.status;

    const { data, error } = await supabaseAdmin
      .from("ts_onboarding")
      .update(updates)
      .eq("id", params.id)
      .select("*, person:ts_people(*)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, onboarding: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
