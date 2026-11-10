/**
 * POST /api/headhunting/vacancies/[vacancyId]/rediscover-cv/bring
 *
 * Trae un match del banco HT a ESA vacante, en la etapa canónica Nuevo
 * (`aplico`), con source `cv_proceso_anterior`.
 *
 * - Si ya hay una fila activa (stage distinto de rechazado/contratado) con
 *   el mismo correo en la vacante, no duplica: 409 y reviewed_decision
 *   already_processed.
 * - Si la fila existe pero está cerrada, se reabre por POST /stage (ese
 *   endpoint escribe la etapa y llama recordStageEvent). Acá no se toca
 *   `stage` a mano.
 * - Si no existe, se crea la fila ya en `aplico` y se registra el evento de
 *   entrada (from null). POST /stage no registraría ese evento: si el origen
 *   y el destino son la misma etapa, recordStageEvent no escribe.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { recordStageEvent } from "@/lib/stage-events";
import { POST as postStage } from "@/app/api/headhunting/candidates/[candidateId]/stage/route";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";
const CLOSED = new Set(["rechazado", "contratado"]);

async function markReviewed(
  vacancyId: string,
  sourceCandidateId: string,
  decision: "contact" | "already_processed",
) {
  await supabaseAdmin
    .from("ts_cv_bank_matches")
    .update({
      reviewed_decision: decision,
      reviewed_by: "hr-admin",
      reviewed_at: new Date().toISOString(),
    })
    .eq("vacancy_id", vacancyId)
    .eq("candidate_id", sourceCandidateId);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { vacancyId: string } },
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { vacancyId } = params;
    const body = await req.json().catch(() => ({}));
    const sourceId = String(body.candidate_id || "");
    if (!sourceId) {
      return NextResponse.json({ error: "candidate_id requerido" }, { status: 400 });
    }

    const { data: vacancy } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title")
      .eq("id", vacancyId)
      .maybeSingle();
    if (!vacancy) {
      return NextResponse.json({ error: "Vacante no encontrada" }, { status: 404 });
    }

    const { data: source, error: srcErr } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, client_id, name, email, phone, cv_url, linkedin_url, notes, headline, current_job_role, current_company, location, salary_aspiration_cop, english_level, years_experience, seniority_level, skills, preferred_language, stage, vacancy_id")
      .eq("id", sourceId)
      .maybeSingle();
    if (srcErr || !source?.email) {
      return NextResponse.json({ error: srcErr?.message || "Candidato del banco no encontrado" }, { status: 404 });
    }

    const email = String(source.email).trim().toLowerCase();
    const { data: onVacancy } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, email, stage")
      .eq("vacancy_id", vacancyId);

    const same = (onVacancy || []).find(
      (row) => String(row.email || "").trim().toLowerCase() === email,
    );

    if (same && !CLOSED.has(String(same.stage || ""))) {
      await markReviewed(vacancyId, sourceId, "already_processed");
      return NextResponse.json(
        {
          error: "already_active",
          message: "Ya está activo en esta vacante",
          candidate_id: same.id,
        },
        { status: 409 },
      );
    }

    if (same) {
      const { error: metaErr } = await supabaseAdmin
        .from("ht_candidates")
        .update({
          source: "cv_proceso_anterior",
          status: "new",
          updated_at: new Date().toISOString(),
        })
        .eq("id", same.id);
      if (metaErr) {
        return NextResponse.json({ error: metaErr.message }, { status: 500 });
      }

      const stageHeaders = new Headers({ "content-type": "application/json" });
      const cookie = req.headers.get("cookie");
      const authorization = req.headers.get("authorization");
      if (cookie) stageHeaders.set("cookie", cookie);
      if (authorization) stageHeaders.set("authorization", authorization);
      const stageReq = new NextRequest(new URL(`/api/headhunting/candidates/${same.id}/stage`, req.url), {
        method: "POST",
        headers: stageHeaders,
        body: JSON.stringify({ stage: "aplico", create_rejection_draft: false, auto_bateria: false }),
      });
      const stageRes = await postStage(stageReq, { params: { candidateId: same.id } });
      const stageBody = await stageRes.json().catch(() => ({}));
      if (!stageRes.ok) {
        return NextResponse.json(
          { error: stageBody.error || "No se pudo reabrir en el Funnel", detail: stageBody.detail },
          { status: stageRes.status },
        );
      }
      await markReviewed(vacancyId, sourceId, "contact");
      return NextResponse.json({
        success: true,
        reopened: true,
        candidate_id: same.id,
        stage: "aplico",
        source: "cv_proceso_anterior",
      });
    }

    const note = `[Rediscovery] traído al funnel de «${vacancy.title}» desde candidato ${source.id}`;
    const { data: created, error: insErr } = await supabaseAdmin
      .from("ht_candidates")
      .insert({
        client_id: source.client_id || TS_CLIENT_ID,
        vacancy_id: vacancyId,
        name: source.name,
        email,
        phone: source.phone || null,
        cv_url: source.cv_url || null,
        linkedin_url: source.linkedin_url || null,
        notes: source.notes ? `${source.notes}\n${note}` : note,
        headline: source.headline || null,
        current_job_role: source.current_job_role || null,
        current_company: source.current_company || null,
        location: source.location || null,
        salary_aspiration_cop: source.salary_aspiration_cop || null,
        english_level: source.english_level || null,
        years_experience: source.years_experience || null,
        seniority_level: source.seniority_level || null,
        skills: source.skills || null,
        preferred_language: source.preferred_language || null,
        source: "cv_proceso_anterior",
        stage: "aplico",
        status: "new",
      })
      .select("id")
      .single();

    if (insErr || !created) {
      return NextResponse.json({ error: insErr?.message || "No se pudo crear el candidato" }, { status: 500 });
    }

    await recordStageEvent({
      candidateId: created.id,
      fromStage: null,
      toStage: "aplico",
      vacancyId,
      source: "ui",
      note: "cv_proceso_anterior · rediscovery",
    });
    await markReviewed(vacancyId, sourceId, "contact");

    return NextResponse.json({
      success: true,
      created: true,
      candidate_id: created.id,
      stage: "aplico",
      source: "cv_proceso_anterior",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("bring-to-funnel error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
