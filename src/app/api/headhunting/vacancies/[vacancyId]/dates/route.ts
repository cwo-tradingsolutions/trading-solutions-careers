/**
 * PATCH /api/headhunting/vacancies/[vacancyId]/dates
 * Body: { fecha_apertura, fecha_objetivo }
 *
 * Edita las fechas de una vacante que ya existe. Ver la vacante no exige
 * fechas; guardarlas sí. Fecha de apertura = hr_request_date. Fecha objetivo
 * = target_fill_date.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { guardarFechasVacante, validarFechasAts } from "@/lib/vacancy-dates-store";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { vacancyId: string } },
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { vacancyId } = params;
    const body = await req.json().catch(() => ({}));
    const fechas = await validarFechasAts(
      body.fecha_apertura ?? body.hr_request_date,
      body.fecha_objetivo ?? body.target_fill_date,
    );
    if (!fechas.ok) {
      return NextResponse.json({ error: fechas.error }, { status: 400 });
    }

    const { data: vacancy, error } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title")
      .eq("id", vacancyId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!vacancy) return NextResponse.json({ error: "Vacante no encontrada" }, { status: 404 });

    const guardadas = await guardarFechasVacante(vacancyId, fechas.apertura, fechas.objetivo);
    if (!guardadas.ok) {
      return NextResponse.json({ error: guardadas.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      vacancy_id: vacancyId,
      hr_request_date: fechas.apertura,
      target_fill_date: fechas.objetivo,
      aviso_fechas: guardadas.aviso,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
