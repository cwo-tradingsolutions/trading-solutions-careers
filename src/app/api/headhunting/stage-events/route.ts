/**
 * GET /api/headhunting/stage-events?since=ISO&limit=200&vacancy_id=uuid
 *
 * Los mismos `candidate.stage_changed` que emite el webhook, reconstruidos
 * desde ht_candidate_stage_events. Es la vía de lectura para los agentes
 * (Samuel · Informes HM) cuando no hay webhook o para ponerse al día después
 * de una caída: el historial es la verdad, el webhook es solo el aviso.
 *
 * Auth: sesión HR (cookie con email) o WXM_SERVICE_SECRET.
 * Orden ascendente por changed_at; paginar pasando el occurred_at del último
 * como `since` (exclusivo).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { requireWxm } from "@/lib/wxm-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { buildStageChangedEvent, ownersDeVacante } from "@/lib/ats-events";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminErr = requireAdmin(req);
  if (adminErr && requireWxm(req)) return adminErr;

  const sp = req.nextUrl.searchParams;
  const since = sp.get("since") || new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "200", 10) || 200, 1), 1000);
  const vacancyId = sp.get("vacancy_id");

  let q = supabaseAdmin
    .from("ht_candidate_stage_events")
    .select("candidate_id, vacancy_id, from_stage, to_stage, changed_at, source, note")
    .gt("changed_at", since)
    .order("changed_at", { ascending: true })
    .limit(limit);
  if (vacancyId) q = q.eq("vacancy_id", vacancyId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Una consulta de dueños por vacante, no una por evento.
  const owners = new Map<string, Awaited<ReturnType<typeof ownersDeVacante>>>();
  for (const vid of Array.from(new Set((data ?? []).map((r: any) => r.vacancy_id).filter(Boolean)))) {
    owners.set(vid as string, await ownersDeVacante(vid as string));
  }
  const sinDuenos = { hiring_lead_email: null, owner_recruiter_id: null, owner_recruiter_email: null };

  const events = (data ?? []).map((r: any) =>
    buildStageChangedEvent({
      candidateId: r.candidate_id,
      vacancyId: r.vacancy_id ?? null,
      toStage: r.to_stage,
      fromStage: r.from_stage ?? null,
      occurredAt: r.changed_at,
      source: r.source ?? "system",
      note: r.note,
      owners: (r.vacancy_id && owners.get(r.vacancy_id)) || sinDuenos,
    }),
  );

  return NextResponse.json(
    { events, next_since: events.length ? events[events.length - 1].occurred_at : since },
    { headers: { "Cache-Control": "no-store" } },
  );
}
