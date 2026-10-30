/**
 * GET   /api/recruitment-sources — catálogo (activas e inactivas)
 * POST  /api/recruitment-sources — alta. No hay DELETE: se desactiva.
 * PATCH /api/recruitment-sources — renombrar el label o cambiar active.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { validarAltaFuente, validarCambioFuente } from "@/lib/recruitment-sources";
import { cargarFuentes } from "@/lib/recruitment-sources-db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  const { fuentes, desde } = await cargarFuentes();
  return NextResponse.json({ fuentes, desde });
}

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const forma = validarAltaFuente(body);
  if (!forma.ok) return NextResponse.json({ error: forma.error }, { status: 400 });

  const { data: ya } = await supabaseAdmin
    .from("ht_recruitment_sources")
    .select("key")
    .eq("key", forma.key)
    .maybeSingle();
  if (ya) {
    return NextResponse.json({ error: "Esa fuente ya existe. Se puede renombrar o desactivar." }, { status: 409 });
  }

  const { data: ultimo } = await supabaseAdmin
    .from("ht_recruitment_sources")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort = ((ultimo as { sort_order?: number } | null)?.sort_order ?? 0) + 10;

  const { data, error } = await supabaseAdmin
    .from("ht_recruitment_sources")
    .insert({ key: forma.key, label: forma.label, active: true, sort_order: sort })
    .select("key, label, active, sort_order")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, fuente: data });
}

export async function PATCH(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const cambio = validarCambioFuente(body);
  if (!cambio.ok) return NextResponse.json({ error: cambio.error }, { status: 400 });

  const patch: { label?: string; active?: boolean } = {};
  if (cambio.label !== undefined) patch.label = cambio.label;
  if (cambio.active !== undefined) patch.active = cambio.active;

  const { data, error } = await supabaseAdmin
    .from("ht_recruitment_sources")
    .update(patch)
    .eq("key", cambio.key)
    .select("key, label, active, sort_order")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No está esa fuente." }, { status: 404 });
  return NextResponse.json({ success: true, fuente: data });
}

export async function DELETE(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  return NextResponse.json(
    { error: "Una fuente no se borra. Se desactiva con active=false." },
    { status: 405 },
  );
}
