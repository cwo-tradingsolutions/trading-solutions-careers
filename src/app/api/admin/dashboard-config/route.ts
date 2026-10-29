/**
 * GET   /api/admin/dashboard-config  → lee config singleton
 * PATCH /api/admin/dashboard-config  → actualiza target_hires_quarter, target_hires_month, target_nps, pipeline_aging_days
 *
 * Usado desde el modal "Settings" en HR Admin para que Kelly pueda cambiar
 * metas trimestrales sin redeploy ni SQL.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

const DEFAULTS = {
  target_hires_quarter: 5,
  target_hires_month: 2,
  target_nps: 70,
  pipeline_aging_days: 21,
};

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from("ts_dashboard_config")
    .select("target_hires_quarter, target_hires_month, target_nps, pipeline_aging_days, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Si la tabla no tiene row aún, devolver defaults
  return NextResponse.json({
    config: data || { ...DEFAULTS, updated_at: null },
    is_default: !data,
  });
}

export async function PATCH(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const updates: Record<string, any> = {};

    // Validar cada campo (solo enteros positivos en rangos sanos)
    if (body.target_hires_quarter !== undefined) {
      const v = Number(body.target_hires_quarter);
      if (!Number.isInteger(v) || v < 0 || v > 100) {
        return NextResponse.json({ error: "target_hires_quarter debe ser entero entre 0 y 100" }, { status: 400 });
      }
      updates.target_hires_quarter = v;
    }
    if (body.target_hires_month !== undefined) {
      const v = Number(body.target_hires_month);
      if (!Number.isInteger(v) || v < 0 || v > 50) {
        return NextResponse.json({ error: "target_hires_month debe ser entero entre 0 y 50" }, { status: 400 });
      }
      updates.target_hires_month = v;
    }
    if (body.target_nps !== undefined) {
      const v = Number(body.target_nps);
      if (!Number.isInteger(v) || v < -100 || v > 100) {
        return NextResponse.json({ error: "target_nps debe ser entero entre -100 y 100" }, { status: 400 });
      }
      updates.target_nps = v;
    }
    if (body.pipeline_aging_days !== undefined) {
      const v = Number(body.pipeline_aging_days);
      if (!Number.isInteger(v) || v < 1 || v > 365) {
        return NextResponse.json({ error: "pipeline_aging_days debe ser entero entre 1 y 365" }, { status: 400 });
      }
      updates.pipeline_aging_days = v;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    // Upsert: si no existe row, lo crea; si existe, actualiza
    const { data, error } = await supabaseAdmin
      .from("ts_dashboard_config")
      .upsert({ id: 1, ...DEFAULTS, ...updates })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, config: data });
  } catch (err: any) {
    console.error("dashboard-config PATCH error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
