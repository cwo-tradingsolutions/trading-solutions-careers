/**
 * /api/admin/reclutadores
 *
 * GET    → el equipo, con cuántas vacantes lleva cada uno.
 * POST   → agrega una persona.
 * PATCH  → edita una persona (nombre, rol, cargo, agenda, activo).
 *
 * Desactivar en vez de borrar: una persona que se va deja procesos con su
 * nombre, y borrarla dejaría vacantes sin dueño y correos sin explicación.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { listarReclutadores, revisarDatos, type Reclutador } from "@/lib/reclutadores";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const noAutorizado = requireAdmin(req);
  if (noAutorizado) return noAutorizado;

  try {
    const incluirInactivos = req.nextUrl.searchParams.get("todos") === "1";
    const gente = await listarReclutadores(incluirInactivos);

    const { data: vacs } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, status, owner_recruiter_id, support_recruiter_id")
      .order("created_at", { ascending: false });

    const abierta = (v: any) => v.status == null || v.status === "open";
    const conConteo = gente.map((r) => ({
      ...r,
      vacantes: (vacs ?? []).filter((v: any) => v.owner_recruiter_id === r.id && abierta(v)).length,
      apoyo_en: (vacs ?? []).filter((v: any) => v.support_recruiter_id === r.id && abierta(v)).length,
    }));

    return NextResponse.json({ reclutadores: conConteo, vacantes: vacs ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "No se pudo leer el equipo" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const noAutorizado = requireAdmin(req);
  if (noAutorizado) return noAutorizado;

  try {
    const body = (await req.json()) as Partial<Reclutador>;
    const error = revisarDatos(body);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const { data, error: dbError } = await supabaseAdmin
      .from("ts_recruiters")
      .insert({
        nombre: body.nombre!.trim(),
        email: body.email!.trim(),
        rol: body.rol || "reclutador",
        cargo: body.cargo?.trim() || null,
        calendly_url: body.calendly_url?.trim() || null,
      })
      .select("id, nombre, email, rol, cargo, calendly_url, activo")
      .single();

    if (dbError) {
      const repetido = /duplicate|unique/i.test(dbError.message);
      return NextResponse.json(
        { error: repetido ? "Ya hay alguien con ese correo" : dbError.message },
        { status: repetido ? 409 : 500 },
      );
    }
    return NextResponse.json({ reclutador: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "No se pudo guardar" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const noAutorizado = requireAdmin(req);
  if (noAutorizado) return noAutorizado;

  try {
    const body = (await req.json()) as Partial<Reclutador> & { id?: string };
    if (!body.id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

    const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.nombre !== undefined) cambios.nombre = body.nombre.trim();
    if (body.rol !== undefined) cambios.rol = body.rol;
    if (body.cargo !== undefined) cambios.cargo = body.cargo?.trim() || null;
    if (body.calendly_url !== undefined) cambios.calendly_url = body.calendly_url?.trim() || null;
    if (body.activo !== undefined) cambios.activo = body.activo;

    const parcial = { ...body, email: body.email ?? "x@x.co", nombre: body.nombre ?? "x" };
    const error = revisarDatos(parcial);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const { data, error: dbError } = await supabaseAdmin
      .from("ts_recruiters")
      .update(cambios)
      .eq("id", body.id)
      .select("id, nombre, email, rol, cargo, calendly_url, activo")
      .single();

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json({ reclutador: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "No se pudo guardar" }, { status: 500 });
  }
}
