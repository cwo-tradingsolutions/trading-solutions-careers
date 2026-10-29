/**
 * POST /api/joint-schedulings/[token]/book
 *
 * Candidato confirma slot · crea Google Calendar event con Meet auto-generado.
 * Invita a candidato + todos los interviewers.
 *
 * Body: { slot_start: ISO, slot_end: ISO }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createMeetEvent } from "@/lib/google-calendar";
import { isPreviewTestMode, previewTestJson } from "@/lib/preview-mode";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const body = await req.json();
    const slotStart = body.slot_start;
    const slotEnd = body.slot_end;
    if (!slotStart || !slotEnd) {
      return NextResponse.json({ error: "Falta slot_start o slot_end" }, { status: 400 });
    }

    const { data: session, error } = await supabaseAdmin
      .from("ts_joint_schedulings")
      .select("*")
      .eq("token", params.token)
      .maybeSingle();

    if (error || !session) return NextResponse.json({ error: "invalid_token" }, { status: 404 });
    if (session.status === "scheduled") return NextResponse.json({ error: "already_scheduled" }, { status: 409 });
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      return NextResponse.json({ error: "expired" }, { status: 410 });
    }

    if (isPreviewTestMode()) {
      return previewTestJson("POST /api/joint-schedulings/[token]/book", {
        slot_start: slotStart,
        slot_end: slotEnd,
      });
    }

    const interviewerNames: string[] = session.interviewer_names || [];
    const interviewerLabel = interviewerNames.length > 0
      ? interviewerNames.join(" + ")
      : session.interviewer_emails.join(" + ");

    const summary = `Entrevista ${session.candidate_name} · ${session.vacancy_title || "Trading Solutions"} · ${interviewerLabel}`;
    const description = `Entrevista con ${interviewerLabel}.\n\nCandidato: ${session.candidate_name} (${session.candidate_email})\nVacante: ${session.vacancy_title || "—"}\n\n${session.description || ""}\n\n— Trading Solutions · Talent Acquisition`;

    const attendees = [
      session.candidate_email,
      ...session.interviewer_emails,
    ].filter(Boolean);

    const eventResult = await createMeetEvent({
      summary,
      description,
      startISO: slotStart,
      endISO: slotEnd,
      attendees,
      timezone: session.timezone,
    });

    if (!eventResult.ok) {
      return NextResponse.json({ error: "calendar_create_failed", detail: eventResult.error }, { status: 500 });
    }

    // Actualizar sesión
    await supabaseAdmin
      .from("ts_joint_schedulings")
      .update({
        status: "scheduled",
        scheduled_at: new Date().toISOString(),
        scheduled_slot_start: slotStart,
        scheduled_slot_end: slotEnd,
        meet_url: eventResult.meet_url,
        google_event_id: eventResult.event_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    return NextResponse.json({
      success: true,
      meet_url: eventResult.meet_url,
      event_id: eventResult.event_id,
      html_link: eventResult.html_link,
      slot_start: slotStart,
      slot_end: slotEnd,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
