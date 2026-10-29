/**
 * POST /api/admin/apply-rys-data
 *
 * Runner que aplica los cambios de DATOS de la migration RYS Corporate Standard
 * que no requieren DDL (ALTER TABLE).
 *
 * Pre-requisito: las columnas `vacancy_type` deben existir ya en ht_vacancies y ts_targets.
 * Si no existen, este endpoint falla limpiamente y reporta qué falta.
 *
 * Lo que hace:
 *   1. Marca como 'reemplazo' todas las vacantes que ya tienen hire_date (cerradas)
 *   2. Resetea ts_targets con la matriz híbrida RYS+mercado
 *   3. Reporta el estado de cada vacante para que decidas cuáles marcar reemplazo manualmente
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

const TARGET_MATRIX = [
  { role_level: 'entry',   vacancy_type: 'reemplazo',   target_days_to_fill: 35 },
  { role_level: 'entry',   vacancy_type: 'incremental', target_days_to_fill: 50 },
  { role_level: 'lead',    vacancy_type: 'reemplazo',   target_days_to_fill: 35 },
  { role_level: 'lead',    vacancy_type: 'incremental', target_days_to_fill: 50 },
  { role_level: 'c_suite', vacancy_type: 'reemplazo',   target_days_to_fill: 60 },
  { role_level: 'c_suite', vacancy_type: 'incremental', target_days_to_fill: 80 },
];

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  const log: string[] = [];
  const errors: string[] = [];

  try {
    // ── 0. Verificar que las columnas existan (probe + insert dummy) ──
    const probe = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, vacancy_type")
      .limit(1);

    if (probe.error?.message?.includes('column') || probe.error?.message?.includes('vacancy_type')) {
      return NextResponse.json({
        ok: false,
        ddl_pending: true,
        error: "Falta columna vacancy_type. Antes de correr esto, pegá el SQL de DDL en Supabase SQL Editor (te lo paso aparte).",
        details: probe.error.message,
      }, { status: 400 });
    }
    log.push(`✓ Columna vacancy_type detectada en ht_vacancies`);

    const probeTargets = await supabaseAdmin.from("ts_targets").select("vacancy_type").limit(1);
    if (probeTargets.error?.message?.includes('column')) {
      return NextResponse.json({
        ok: false,
        ddl_pending: true,
        error: "Falta columna vacancy_type en ts_targets. Pegá DDL primero.",
        details: probeTargets.error.message,
      }, { status: 400 });
    }
    log.push(`✓ Columna vacancy_type detectada en ts_targets`);

    // ── 1. Marcar como 'reemplazo' las vacantes con hire_date ──
    const { data: closedMs } = await supabaseAdmin
      .from("ht_vacancy_milestones")
      .select("vacancy_id")
      .not("hire_date", "is", null);

    const closedIds = (closedMs || []).map((m: any) => m.vacancy_id);
    if (closedIds.length > 0) {
      const { error: updErr, count } = await supabaseAdmin
        .from("ht_vacancies")
        .update({ vacancy_type: 'reemplazo' }, { count: 'exact' })
        .in("id", closedIds);
      if (updErr) errors.push(`Update closed→reemplazo: ${updErr.message}`);
      else log.push(`✓ ${count ?? closedIds.length} vacantes cerradas → reemplazo`);
    } else {
      log.push(`(no hay vacantes cerradas para marcar)`);
    }

    // ── 2. Resetear ts_targets con la matriz híbrida ──
    // No usamos TRUNCATE (no disponible vía rest); hacemos delete + insert
    const { error: delErr } = await supabaseAdmin
      .from("ts_targets")
      .delete()
      .gte("target_days_to_fill", 0); // matchea todas las rows
    if (delErr) errors.push(`Delete ts_targets: ${delErr.message}`);
    else log.push(`✓ ts_targets vaciado`);

    const { error: insErr, data: inserted } = await supabaseAdmin
      .from("ts_targets")
      .insert(TARGET_MATRIX)
      .select();
    if (insErr) errors.push(`Insert ts_targets: ${insErr.message}`);
    else log.push(`✓ ${inserted?.length || 0} targets RYS-híbridos insertados`);

    // ── 3. Reportar estado actual de vacantes para decisiones manuales ──
    const { data: allVacs } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, role_level, vacancy_type")
      .eq("client_id", TS_CLIENT_ID)
      .order("title");

    const closedSet = new Set(closedIds);
    const vacancyState = (allVacs || []).map((v: any) => ({
      id: v.id,
      title: v.title,
      role_level: v.role_level,
      vacancy_type: v.vacancy_type,
      status: closedSet.has(v.id) ? 'cerrada' : 'abierta',
      auto_assigned: closedSet.has(v.id),
    }));

    return NextResponse.json({
      ok: errors.length === 0,
      log,
      errors,
      target_matrix_applied: TARGET_MATRIX,
      vacancy_state: vacancyState,
      next_step: "Revisá vacancy_state. Si alguna vacante abierta debería ser 'reemplazo', usá el endpoint /api/admin/set-vacancy-type",
    });
  } catch (err: any) {
    console.error("apply-rys-data error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Error", log, errors }, { status: 500 });
  }
}
