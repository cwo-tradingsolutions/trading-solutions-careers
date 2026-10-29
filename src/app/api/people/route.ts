/**
 * GET  /api/people → list all people (TPs + new hires)
 * POST /api/people → create manually (auto creation pasa por /api/onboarding/from-candidate)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const tp = url.searchParams.get("tp");

  let q = supabaseAdmin.from("ts_people").select("*").order("start_date", { ascending: false });
  if (status) q = q.eq("status", status);
  if (tp === "true") q = q.eq("is_top_performer", true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ people: data || [], total: data?.length || 0 });
}

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    if (!body.name || !body.role) {
      return NextResponse.json({ error: "Faltan name + role" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("ts_people")
      .insert({
        name: body.name,
        email: body.email || null,
        role: body.role,
        area: body.area || null,
        role_level: body.role_level || 'entry',
        start_date: body.start_date || null,
        status: body.status || 'onboarding',
        manager_email: body.manager_email || null,
        buddy_email: body.buddy_email || null,
        location: body.location || 'Barranquilla',
        is_top_performer: !!body.is_top_performer,
        notes: body.notes || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, person: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
