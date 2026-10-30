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

    // Auto-rechazo OFF hasta GO de Kelly. No se persiste mark_rejected.
    let warning: string | undefined;
    if (update.on_exhausted_action === "mark_rejected") {
      update.on_exhausted_action = "mark_paused";
      warning = "mark_rejected está apagado hasta GO de Kelly; se guardó mark_paused";
    }

    const { data, error } = await supabaseAdmin
      .from("ts_reminder_rules")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, rule: data, ...(warning ? { warning } : {}) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
