/**
 * GET /api/admin/reminder-rules · lista todas las reglas (incluyendo inactivas)
 * PATCH /api/admin/reminder-rules · actualiza una regla por id
 *
 * Body PATCH: {
 *   id: string,
 *   templates?: { '1': { es: {...}, en: {...} }, '2': ..., '3': ... },
 *   reminder_days?: number[],
 *   max_iterations?: number,
 *   active?: boolean,
 *   on_exhausted_action?: 'mark_paused' | 'mark_rejected' | 'noop',
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from("ts_reminder_rules")
    .select("*")
    .order("scenario_key", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data || [] });
}

export async function PATCH(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { id, ...patch } = body;
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    const allowed = ["templates", "reminder_days", "max_iterations", "active", "on_exhausted_action", "scenario_label", "stage_codes"];
    const update: Record<string, unknown> = {};
    for (const k of allowed) if (k in patch) update[k] = patch[k];
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("ts_reminder_rules")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, rule: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
