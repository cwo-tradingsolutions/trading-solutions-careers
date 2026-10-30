/**
 * POST /api/headhunting/candidates/[candidateId]/schedule-interview
 *
 * Cerrado. No crea filas en ts_interviews ni envía correo.
 * GET sigue listando citas que ya existían.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "Agendar entrevista está cerrado. No se crea la cita ni se envía correo." },
    { status: 410 },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from("ts_interviews")
    .select("*")
    .eq("candidate_id", params.candidateId)
    .order("scheduled_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interviews: data || [] });
}
