/**
 * PATCH /api/referrals/[id] → admin · update status / notes
 * GET   /api/referrals/[id] → admin · ver detalle (incluye CV base64)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from("ts_referrals")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "no encontrado" }, { status: 404 });

  return NextResponse.json({ referral: data });
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
    const updates: Record<string, unknown> = {};

    const allowedStatuses = ['received','reviewed','imported_to_cvbank','contacted','rejected','archived'];
    if (body.status && allowedStatuses.includes(body.status)) {
      updates.status = body.status;
      updates.reviewed_at = new Date().toISOString();
    }
    if (body.internal_notes !== undefined) updates.internal_notes = body.internal_notes;
    if (body.reviewed_by !== undefined) updates.reviewed_by = body.reviewed_by;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("ts_referrals")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, referral: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
