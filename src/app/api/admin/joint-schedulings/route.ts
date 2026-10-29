/**
 * POST /api/admin/joint-schedulings · crea una sesión de agendamiento conjunta
 *
 * Body: {
 *   candidate_id: string,
 *   interviewer_emails: string[],
 *   interviewer_names?: string[],
 *   duration_minutes?: number (default 45),
 *   window_days?: number (default 7 · busca slots en los próximos N días),
 *   business_hours_start?: number (default 8),
 *   business_hours_end?: number (default 18),
 *   timezone?: string (default 'America/Bogota'),
 *   description?: string
 * }
 *
 * Devuelve: { token, link, expires_at, candidate_name, ... }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const candidateId = body.candidate_id;
    const interviewerEmails: string[] = Array.isArray(body.interviewer_emails) ? body.interviewer_emails : [];
    const interviewerNames: string[] = Array.isArray(body.interviewer_names) ? body.interviewer_names : [];

    if (!candidateId) return NextResponse.json({ error: "Falta candidate_id" }, { status: 400 });
    if (interviewerEmails.length === 0) return NextResponse.json({ error: "Falta interviewer_emails (al menos 1)" }, { status: 400 });

    // Pull candidato
    const { data: cand, error: cErr } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, vacancy_id, ht_vacancies(title)")
      .eq("id", candidateId)
      .single();
    if (cErr || !cand) return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });

    const windowDays = body.window_days || 7;
    const now = new Date();
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + windowDays);

    const token = crypto.randomBytes(20).toString("hex");

    const payload: Record<string, unknown> = {
      token,
      created_by_email: body.created_by_email || "jointheteam@tradingsolutions.com",
      candidate_id: cand.id,
      candidate_name: cand.name,
      candidate_email: cand.email,
      vacancy_id: cand.vacancy_id,
      // @ts-expect-error supabase relation
      vacancy_title: cand.ht_vacancies?.title || null,
      interviewer_emails: interviewerEmails,
      interviewer_names: interviewerNames,
      duration_minutes: body.duration_minutes || 45,
      window_start: now.toISOString(),
      window_end: windowEnd.toISOString(),
      business_hours_start: body.business_hours_start ?? 8,
      business_hours_end: body.business_hours_end ?? 18,
      buffer_minutes: body.buffer_minutes ?? 15,
      timezone: body.timezone || "America/Bogota",
      description: body.description || null,
      status: "pending",
    };

    const { data, error } = await supabaseAdmin
      .from("ts_joint_schedulings")
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      id: data.id,
      token: data.token,
      link: `${APP_URL}/agenda-conjunta/${data.token}`,
      candidate_name: data.candidate_name,
      interviewer_emails: data.interviewer_emails,
      expires_at: data.expires_at,
    });
  } catch (err: any) {
    console.error("joint-schedulings POST error:", err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
