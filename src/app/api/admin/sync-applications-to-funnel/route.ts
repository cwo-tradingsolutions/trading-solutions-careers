/**
 * POST /api/admin/sync-applications-to-funnel
 *
 * Sincroniza nuevas aplicaciones del formulario público (Neon · applications)
 * hacia el funnel del ATS (Supabase · ht_candidates).
 *
 * Idempotente · usa email como clave única. Si ya existe en ht_candidates
 * actualiza el campo updated_at sin pisar el stage.
 *
 * Body opcional:
 *   { since?: string }   // ISO date · default: hace 7 días
 *
 * Llamar desde el HR Admin:
 *   fetch('/api/admin/sync-applications-to-funnel', { method: 'POST' }).then(r=>r.json()).then(console.log)
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { recordStageEvents } from "@/lib/stage-events";
// El mapa job_id → vacancy_id es compartido con /api/applications · esta copia
// se había quedado con solo los ids 2-5 y descartaba las vacantes nuevas.
import { resolverVacante } from "@/lib/vacancy-map";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const since: string = body.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Leer aplicaciones recientes de Neon
    const apps = await sql`
      SELECT id, job_id, job_title, full_name, email, phone, linkedin,
             cv_filename, why_ts, status, score, prefilter_data,
             created_at
      FROM applications
      WHERE created_at >= ${since}::timestamptz
      ORDER BY created_at DESC
    `;

    if (!Array.isArray(apps) || apps.length === 0) {
      return NextResponse.json({ message: "No hay aplicaciones nuevas desde " + since, inserted: 0, updated: 0 });
    }

    // 2. Get existing emails en ht_candidates (case-insensitive dedup)
    // La llave es correo + vacante, no el correo solo: la misma persona puede
    // estar en dos procesos, y su postulación nueva tiene que entrar al cargo
    // al que aplicó, no quedarse en la ficha del cargo anterior.
    const emails = apps.map((a: any) => String(a.email || "").toLowerCase().trim()).filter(Boolean);
    const orFilter = emails.map(e => `email.ilike.${e}`).join(",");
    const { data: existing } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, email, vacancy_id")
      .or(orFilter);
    const llave = (email: string, vacancyId: string) => `${email}|${vacancyId}`;
    const existingMap = new Map(
      (existing || []).map((c: any) => [
        llave(String(c.email || "").toLowerCase().trim(), String(c.vacancy_id || "")),
        c.id,
      ]),
    );

    // Lo que hay que mirar aunque la sincronización "salga bien": una vacante
    // del mapa que ya está cerrada significa que el cargo se volvió a abrir
    // con otro id y nadie actualizó el mapa.
    const avisos: string[] = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const details: Array<{ email: string; action: string; reason?: string }> = [];
    // Eventos de entrada al funnel · se acumulan y se insertan de una sola vez
    // al final para no pagar un round-trip por candidato.
    const entryEvents: Array<{ candidateId: string; toStage: string; fromStage: null; vacancyId: string }> = [];

    for (const app of apps as any[]) {
      const email = String(app.email || "").toLowerCase().trim();
      if (!email) {
        skipped++;
        continue;
      }
      const resuelta = await resolverVacante(app.job_id, app.job_title);
      const vacancyId = resuelta?.id ?? null;
      if (!vacancyId) {
        skipped++;
        details.push({ email, action: "skipped", reason: `job_id ${app.job_id} no mapeado` });
        continue;
      }
      if (resuelta?.aviso && !avisos.includes(resuelta.aviso)) avisos.push(resuelta.aviso);

      if (existingMap.has(llave(email, vacancyId))) {
        // Ya existe · solo touch updated_at
        await supabaseAdmin
          .from("ht_candidates")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", existingMap.get(llave(email, vacancyId)));
        updated++;
        details.push({ email, action: "updated" });
      } else {
        // Nuevo · insert
        const { data: created, error: insertErr } = await supabaseAdmin
          .from("ht_candidates")
          .insert({
            client_id: TS_CLIENT_ID,
            vacancy_id: vacancyId,
            name: app.full_name,
            email,
            phone: app.phone || null,
            stage: "aplico",
            source: "public_form",
            notes: app.why_ts ? `[Public form] ${app.why_ts}` : `[Public form] · application_id=${app.id}`,
            created_at: app.created_at,
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .maybeSingle();
        if (insertErr) {
          skipped++;
          details.push({ email, action: "skipped", reason: insertErr.message });
        } else {
          inserted++;
          details.push({ email, action: "inserted" });
          if (created?.id) existingMap.set(llave(email, vacancyId), created.id);
          if (created?.id) {
            entryEvents.push({ candidateId: created.id, toStage: "aplico", fromStage: null, vacancyId });
          }
        }
      }
    }

    // La entrada al funnel es el primer evento del candidato: sin él no hay
    // desde cuándo contar los días en "Aplicó".
    await recordStageEvents(entryEvents.map((e) => ({ ...e, source: "system" as const })));

    return NextResponse.json({
      success: true,
      since,
      total_apps_found: apps.length,
      inserted,
      updated,
      skipped,
      avisos,
      details: details.slice(0, 50),
    });
  } catch (err: any) {
    console.error("sync-applications-to-funnel error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
