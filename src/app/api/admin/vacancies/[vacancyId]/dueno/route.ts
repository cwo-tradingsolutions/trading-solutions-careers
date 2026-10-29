/**
 * POST /api/admin/vacancies/[vacancyId]/dueno
 *
 * Asigna el dueño y el apoyo de una vacante.
 * Body: { owner_recruiter_id: string | null, support_recruiter_id?: string | null }
 *
 * El dueño responde por el proceso y es de quien salen la agenda y la firma de
 * los correos. El apoyo puede operarla igual, pero no aparece frente al
 * candidato: dos caras en un mismo proceso confunden.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { vacancyId: string } }) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const noAutorizado = requireAdmin(req);
  if (noAutorizado) return noAutorizado;

  try {
    const { owner_recruiter_id, support_recruiter_id } = (await req.json()) as {
      owner_recruiter_id?: string | null;
      support_recruiter_id?: string | null;
    };

    if (owner_recruiter_id && support_recruiter_id && owner_recruiter_id === support_recruiter_id) {
      return NextResponse.json({ error: "El apoyo no puede ser la misma persona que el dueño" }, { status: 400 });
    }

    const cambios: Record<string, unknown> = {};
    if (owner_recruiter_id !== undefined) cambios.owner_recruiter_id = owner_recruiter_id || null;
    if (support_recruiter_id !== undefined) cambios.support_recruiter_id = support_recruiter_id || null;
    if (!Object.keys(cambios).length) {
      return NextResponse.json({ error: "No hay nada que cambiar" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("ht_vacancies")
      .update(cambios)
      .eq("id", params.vacancyId)
      .select("id, title, owner_recruiter_id, support_recruiter_id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ vacante: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "No se pudo asignar" }, { status: 500 });
  }
}
