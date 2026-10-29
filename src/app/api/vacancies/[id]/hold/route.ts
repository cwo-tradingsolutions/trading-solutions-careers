/**
 * POST   /api/vacancies/[id]/hold  — poner la vacante en stand-by
 * DELETE /api/vacancies/[id]/hold  — reanudarla
 * PATCH  /api/vacancies/[id]/hold  — reiniciar la búsqueda (cambio de perfil)
 *
 * Stand-by no es cerrar. La vacante sigue abierta y se sigue haciendo
 * sourcing; lo que se detiene es el reloj del SLA, porque esos días los pidió
 * el área y no son demora del equipo de Talento.
 *
 * Todo queda con fecha y con nombre: el día que alguien pregunte por qué una
 * vacante lleva 34 días, la respuesta tiene que estar escrita.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const requestedBy = String(body.requested_by || "").trim();
    const reason = String(body.reason || "").trim();
    const desde = body.started_at ? new Date(body.started_at).toISOString() : new Date().toISOString();

    // Sin quién la pidió, la pausa no sirve para defender el indicador:
    // queda un hueco en el tiempo que nadie puede explicar después.
    if (!requestedBy) {
      return NextResponse.json(
        { error: "Falta quién pidió el stand-by. Sin eso la pausa no se puede sustentar después." },
        { status: 400 },
      );
    }

    const { data: abierta } = await supabaseAdmin
      .from("ht_vacancy_holds")
      .select("id, started_at")
      .eq("vacancy_id", params.id)
      .is("ended_at", null)
      .maybeSingle();

    if (abierta) {
      return NextResponse.json(
        { error: "Esta vacante ya está en stand-by desde el " + new Date(abierta.started_at).toLocaleDateString("es-CO") },
        { status: 409 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("ht_vacancy_holds")
      .insert({
        vacancy_id: params.id,
        started_at: desde,
        requested_by: requestedBy,
        reason: reason || null,
        created_by: body.actor_email || null,
      })
      .select("id, started_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, pausa: data });
  } catch (err: any) {
    console.error("[hold] POST", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const hasta = url.searchParams.get("ended_at");
    const fin = hasta ? new Date(hasta).toISOString() : new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("ht_vacancy_holds")
      .update({ ended_at: fin })
      .eq("vacancy_id", params.id)
      .is("ended_at", null)
      .select("id, started_at, ended_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Esta vacante no está en stand-by" }, { status: 404 });
    return NextResponse.json({ success: true, pausa: data });
  } catch (err: any) {
    console.error("[hold] DELETE", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const desde = body.search_restarted_at
      ? new Date(body.search_restarted_at).toISOString()
      : new Date().toISOString();
    const motivo = String(body.reason || "").trim();

    if (!motivo) {
      return NextResponse.json(
        { error: "Falta el motivo del reinicio. Reiniciar el reloj sin decir por qué es lo que después nadie puede explicar." },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("ht_vacancies")
      .update({ search_restarted_at: desde, search_restart_reason: motivo })
      .eq("id", params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, search_restarted_at: desde });
  } catch (err: any) {
    console.error("[hold] PATCH", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
