/**
 * POST /api/onboarding/from-candidate
 * body: { candidate_id, start_date?, manager_email?, buddy_email? }
 *
 * Crea (o reusa) un registro en ts_people enlazado al candidate, y un onboarding
 * plan con tasks default según role_level. Idempotente: si ya existe person + onboarding
 * para ese candidate, devuelve el existente.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { defaultOnboardingTasks } from "@/lib/onboarding-tasks";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const candidateId = body.candidate_id;
    if (!candidateId) {
      return NextResponse.json({ error: "Falta candidate_id" }, { status: 400 });
    }

    // 1. Get candidate
    const { data: cand, error: cErr } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, vacancy_id, stage")
      .eq("id", candidateId)
      .single();
    if (cErr || !cand) {
      return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
    }

    // 2. Get vacancy
    const { data: vac } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, area, role_level")
      .eq("id", cand.vacancy_id)
      .maybeSingle();

    // 3. Find or create person (linked_candidate_id)
    let personId: string;
    const { data: existingPerson } = await supabaseAdmin
      .from("ts_people")
      .select("id")
      .eq("linked_candidate_id", candidateId)
      .maybeSingle();

    if (existingPerson) {
      personId = existingPerson.id;
    } else {
      const { data: newPerson, error: pErr } = await supabaseAdmin
        .from("ts_people")
        .insert({
          name: cand.name,
          email: cand.email,
          role: vac?.title || 'Pendiente',
          area: vac?.area || null,
          role_level: vac?.role_level || 'entry',
          start_date: body.start_date || new Date().toISOString().slice(0, 10),
          status: 'onboarding',
          manager_email: body.manager_email || null,
          buddy_email: body.buddy_email || null,
          linked_candidate_id: candidateId,
          linked_vacancy_id: vac?.id || null,
          location: 'Barranquilla',
          is_top_performer: false,
        })
        .select("id")
        .single();
      if (pErr || !newPerson) {
        return NextResponse.json({ error: pErr?.message || "Error creando person" }, { status: 500 });
      }
      personId = newPerson.id;
    }

    // 4. Find or create onboarding for this person
    const { data: existingOnb } = await supabaseAdmin
      .from("ts_onboarding")
      .select("id")
      .eq("person_id", personId)
      .maybeSingle();

    let onboardingId: string;
    if (existingOnb) {
      onboardingId = existingOnb.id;
    } else {
      const tasks = defaultOnboardingTasks(vac?.role_level || 'entry');
      const { data: newOnb, error: oErr } = await supabaseAdmin
        .from("ts_onboarding")
        .insert({
          person_id: personId,
          start_date: body.start_date || new Date().toISOString().slice(0, 10),
          status: 'in_progress',
          tasks,
        })
        .select("id")
        .single();
      if (oErr || !newOnb) {
        return NextResponse.json({ error: oErr?.message || "Error creando onboarding" }, { status: 500 });
      }
      onboardingId = newOnb.id;
    }

    return NextResponse.json({
      success: true,
      person_id: personId,
      onboarding_id: onboardingId,
    });
  } catch (err: any) {
    console.error("from-candidate error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
