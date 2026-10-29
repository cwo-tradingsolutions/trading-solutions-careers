/**
 * PATCH /api/headhunting/vacancies/[vacancyId]/status
 * Body: { status: 'open' | 'closed' }
 *
 * Abre o cierra una vacante desde HR Admin.
 *
 * POR QUÉ EXISTE
 * Hasta ahora no había forma de cerrar una vacante desde ninguna pantalla.
 * El único criterio era `ht_vacancy_milestones.hire_date`, o sea que una
 * vacante solo se daba por cerrada si se registraba una contratación. Las que
 * se cancelaron, se congelaron o se cubrieron por movimiento interno se
 * quedaban abiertas para siempre — inflando el conteo de candidatos activos
 * del dashboard con gente de procesos terminados hace meses.
 *
 * Cerrar una vacante NO toca a sus candidatos: siguen en la base con su
 * historia intacta, solo dejan de contar en los indicadores.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

const VALID = ["open", "closed"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { vacancyId: string } },
) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { vacancyId } = params;
    const body = await req.json();
    const status = String(body.status || "");

    if (!VALID.includes(status as any)) {
      return NextResponse.json(
        { error: `status inválido. Válidos: ${VALID.join(", ")}` },
        { status: 400 },
      );
    }

    const { data: vacancy, error: fetchErr } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, status")
      .eq("id", vacancyId)
      .single();

    if (fetchErr || !vacancy) {
      return NextResponse.json({ error: "Vacante no encontrada" }, { status: 404 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("ht_vacancies")
      .update({ status })
      .eq("id", vacancyId);

    if (updateErr) {
      return NextResponse.json(
        { error: "save_failed", detail: updateErr.message },
        { status: 500 },
      );
    }

    // Cuántos candidatos vivos quedan en la vacante — para avisarle a quien
    // la cierra que esa gente deja de aparecer en el dashboard.
    const { count } = await supabaseAdmin
      .from("ht_candidates")
      .select("id", { count: "exact", head: true })
      .eq("vacancy_id", vacancyId)
      .not("status", "in", '("rejected","completed")');

    return NextResponse.json({
      success: true,
      vacancy: { id: vacancy.id, title: vacancy.title, status },
      affected_candidates: count ?? 0,
    });
  } catch (err: any) {
    console.error("[vacancy status]", err);
    return NextResponse.json(
      { error: "Error interno", detail: err?.message },
      { status: 500 },
    );
  }
}
