/**
 * GET /api/dashboard/funnel-timing[?vacancy_id=&country=]
 *
 * Alimenta el bloque "Tiempos del funnel · foto de hoy" del Dashboard.
 *
 * Por cada una de las 13 etapas del proceso devuelve:
 *   - cuántos candidatos están ahí HOY
 *   - cuántos días llevan en promedio, y el peor caso
 *   - el SLA de la etapa y si lo pasó
 *   - la lista de candidatos, ordenada por más tiempo esperando
 *
 * DE DÓNDE SALEN LOS DÍAS
 * Del último evento en ht_candidate_stage_events (migración 20260818).
 * Si un candidato todavía no tiene evento — porque entró antes de que
 * existiera el historial — se cae a updated_at y el registro queda marcado
 * con `approx: true`. La respuesta trae `approx_ratio` para que la UI pueda
 * advertir cuánto de lo que muestra es aproximado.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { supabaseAdmin } from "@/lib/supabase";
import {
  STAGES,
  PHASE_LABEL,
  STAGE_BREAKDOWN,
  normalizeStage,
  slaStatus,
  type Phase,
} from "@/lib/stage-labels";

import { diasActivos, diasEnPausa, enPausa, inicioDelReloj, type Pausa } from "@/lib/reloj";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

function daysSince(dt?: string | null): number {
  if (!dt) return 0;
  const ms = Date.now() - new Date(dt).getTime();
  return Math.max(0, Math.round((ms / (1000 * 60 * 60 * 24)) * 10) / 10);
}

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const vacancyFilter = url.searchParams.get("vacancy_id");
    const countryFilter = url.searchParams.get("country");
    const byVacancy = vacancyFilter && vacancyFilter !== "all";

    // ── Vacantes de Trading Solutions, abiertas ──────────────────
    let vacQuery = supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, country, status, search_restarted_at")
      .eq("client_id", TS_CLIENT_ID);
    if (byVacancy) vacQuery = vacQuery.eq("id", vacancyFilter);
    if (countryFilter && countryFilter !== "all") {
      vacQuery = countryFilter === "Colombia"
        ? vacQuery.or("country.is.null,country.eq.Colombia")
        : vacQuery.eq("country", countryFilter);
    }
    const { data: vacs } = await vacQuery;

    // Whitelist, no blacklist: "paused" o cualquier estado nuevo NO debe
    // colarse como vacante abierta.
    const openVacs = (vacs || []).filter((v: any) => v.status == null || v.status === "open");
    const vacById = new Map(openVacs.map((v: any) => [v.id, v]));
    if (vacById.size === 0) {
      return NextResponse.json({ stages: [], phases: [], totals: emptyTotals(), approx_ratio: 0 });
    }

    // ── Pausas por vacante ───────────────────────────────────────
    // Los días de stand-by no son demora del equipo de Talento: los pidió el
    // área. Se descuentan del reloj y la vacante sale del semáforo mientras
    // dure la pausa, para que el rojo siga significando algo.
    const pausasPorVacante = new Map<string, Pausa[]>();
    {
      const { data: holds } = await supabaseAdmin
        .from("ht_vacancy_holds")
        .select("vacancy_id, started_at, ended_at, reason, requested_by")
        .in("vacancy_id", Array.from(vacById.keys()));
      for (const h of (holds || []) as any[]) {
        const arr = pausasPorVacante.get(h.vacancy_id) || [];
        arr.push(h as Pausa);
        pausasPorVacante.set(h.vacancy_id, arr);
      }
    }

    // ── Candidatos vivos ─────────────────────────────────────────
    const cands = await fetchAllRows(() => {
      let candQuery = supabaseAdmin
        .from("ht_candidates")
        .select("id, name, vacancy_id, stage, status, updated_at, created_at")
        .not("email", "ilike", "%@tradingsolutions.com");
      if (byVacancy) candQuery = candQuery.eq("vacancy_id", vacancyFilter);
      return candQuery;
    });

    const live = (cands || []).filter(
      (c: any) =>
        vacById.has(c.vacancy_id) &&
        c.status !== "rejected" &&
        normalizeStage(c.stage) !== "rechazado",
    );

    // ── Último evento de etapa por candidato ─────────────────────
    // Se pide ordenado descendente y nos quedamos con el primero de cada
    // candidato, que es el más reciente.
    const lastEvent = new Map<string, { at: string; source: string }>();
    if (live.length > 0) {
      // Índice por id: buscar con .find() dentro del loop era O(candidatos ×
      // eventos), y la siembra deja varios eventos por candidato.
      const byId = new Map<string, any>(live.map((c: any) => [c.id, c]));
      // Tandas de 150: un .in() con todos los ids vivos no cabe en la URL y,
      // repetido en cada página, un 414 tumbaría toda la sección.
      // changed_at desc dentro de cada tanda: el primero de cada candidato es
      // el más reciente. Esta tabla no tiene created_at; id desempata.
      const events: any[] = [];
      const liveIds = Array.from(byId.keys());
      for (let i = 0; i < liveIds.length; i += 150) {
        const slice = liveIds.slice(i, i + 150);
        events.push(...await fetchAllRows(() =>
          supabaseAdmin
            .from("ht_candidate_stage_events")
            .select("candidate_id, to_stage, changed_at, source")
            .in("candidate_id", slice),
          1000,
          [
            { column: "changed_at", ascending: false },
            { column: "id", ascending: true },
          ],
        ));
      }

      for (const ev of (events || []) as any[]) {
        const cand = byId.get(ev.candidate_id);
        if (!cand) continue;
        // Solo cuenta el evento que corresponde a la etapa donde está HOY.
        if (normalizeStage(ev.to_stage) !== normalizeStage(cand.stage)) continue;
        if (!lastEvent.has(ev.candidate_id)) {
          lastEvent.set(ev.candidate_id, { at: ev.changed_at, source: ev.source });
        }
      }
    }

    // ── Sub-pruebas pendientes ───────────────────────────────────
    const testsByCandidate = new Map<string, any[]>();
    if (live.length > 0) {
      const tests: any[] = [];
      const testIds = live.map((c: any) => c.id as string);
      for (let i = 0; i < testIds.length; i += 150) {
        const slice = testIds.slice(i, i + 150);
        tests.push(...await fetchAllRows(() =>
          supabaseAdmin
            .from("ht_candidate_tests")
            .select("candidate_id, test_id, status, sent_at, completed_at")
            .in("candidate_id", slice)
            .in("status", ["pendiente", "enviada"]),
        ));
      }
      for (const t of tests || []) {
        const arr = testsByCandidate.get((t as any).candidate_id) || [];
        arr.push(t);
        testsByCandidate.set((t as any).candidate_id, arr);
      }
    }

    // ── Agrupar por etapa canónica ───────────────────────────────
    let approxCount = 0;
    const enriched = live.map((c: any) => {
      const ev = lastEvent.get(c.id);
      // Un evento sembrado ('backfill') salió de updated_at o de un sello
      // suelto: la fecha es reconstruida, no registrada. Cuenta como
      // aproximado igual que no tener evento — si no, el aviso de la UI
      // desaparecería justo cuando los números son menos confiables.
      const approx = !ev || ev.source === "backfill";
      if (approx) approxCount++;
      const vac: any = vacById.get(c.vacancy_id);
      const pausas = pausasPorVacante.get(c.vacancy_id) || [];
      // Si el área cambió el perfil, quien entró antes pertenece a la
      // búsqueda anterior: su reloj arranca en el reinicio.
      const since = inicioDelReloj(ev?.at || c.updated_at || c.created_at, vac?.search_restarted_at);
      const pausado = !!enPausa(pausas);
      return {
        id: c.id,
        name: c.name,
        vacancy_id: c.vacancy_id,
        vacancy_title: vac?.title ?? "—",
        stage: normalizeStage(c.stage),
        raw_stage: c.stage,
        // El SLA se mide contra días activos. Los calendario van aparte
        // porque son los que esperó la persona, y eso no se borra.
        days: diasActivos(since, pausas),
        days_calendario: daysSince(since),
        days_pausa: diasEnPausa(pausas, since),
        pausado,
        approx,
        pending_tests: (testsByCandidate.get(c.id) || []).map((t: any) => t.test_id),
      };
    });

    const stages = STAGES.map((def) => {
      const inStage = enriched
        .filter((c) => c.stage === def.id)
        .sort((a, b) => b.days - a.days);

      const count = inStage.length;
      const avg = count ? inStage.reduce((s, c) => s + c.days, 0) / count : 0;
      const avgDays = Math.round(avg * 10) / 10;
      const maxDays = count ? inStage[0].days : 0;
      // Una vacante en stand-by no entra al semáforo: si entrara, todas las
      // pausadas se pintarían de rojo y el rojo dejaría de significar algo.
      const overSla = inStage.filter((c) => !c.pausado && c.days > def.sla).length;

      // Desglose de sub-pruebas, cuando la etapa lo tiene
      const subDefs = STAGE_BREAKDOWN[def.id];
      const breakdown = subDefs
        ? subDefs.map((t) => {
            const pending = inStage.filter((c) => c.pending_tests.includes(t.id));
            const tAvg = pending.length
              ? Math.round((pending.reduce((s, c) => s + c.days, 0) / pending.length) * 10) / 10
              : 0;
            return {
              id: t.id,
              label: t.label,
              owner: t.owner,
              sla: t.sla,
              count: pending.length,
              avg_days: tAvg,
              // Contra el SLA de la prueba (t.sla), no el de la etapa: si no,
              // la fila mostraría "Pasado de SLA" al lado de un SLA que no pasó.
              status: testSlaStatus(t.sla, tAvg),
            };
          })
        : null;

      return {
        id: def.id,
        order: def.order,
        phase: def.phase,
        phase_label: PHASE_LABEL[def.phase],
        label: def.label,
        label_long: def.labelLong,
        owner: def.owner,
        action: def.action,
        sla: def.sla,
        count,
        avg_days: avgDays,
        max_days: maxDays,
        over_sla_count: overSla,
        status: count ? slaStatus(def.id, avgDays) : "ok",
        breakdown,
        candidates: inStage.slice(0, 25).map((c) => ({
          id: c.id,
          name: c.name,
          vacancy_title: c.vacancy_title,
          days: c.days,
          approx: c.approx,
          pending_tests: c.pending_tests,
        })),
      };
    });

    // ── Resumen por fase y totales ───────────────────────────────
    const phases = (["seleccion", "contratacion"] as Phase[]).map((p) => {
      const ss = stages.filter((s) => s.phase === p);
      return {
        id: p,
        label: PHASE_LABEL[p],
        count: ss.reduce((s, x) => s + x.count, 0),
        total_days: Math.round(ss.reduce((s, x) => s + x.avg_days, 0) * 10) / 10,
      };
    });

    const active = stages.filter((s) => s.id !== "contratado");
    const totalActive = active.reduce((s, x) => s + x.count, 0);
    const totalStuck = active.reduce((s, x) => s + x.over_sla_count, 0);

    // Cuello de botella: la etapa que más gente retiene por más tiempo
    // relativo a su propio SLA. Sin candidatos no hay cuello de botella.
    const activeIds = new Set<string>(active.map((s) => String(s.id)));
    const mostStuck = enriched
      .filter((c) => activeIds.has(String(c.stage)))
      .sort((a, b) => b.days - a.days)[0] ?? null;

    const withPeople = active.filter((s) => s.count > 0);
    const bottleneck = withPeople.length
      ? withPeople.reduce((worst, s) =>
          s.count * (s.avg_days / s.sla) > worst.count * (worst.avg_days / worst.sla) ? s : worst,
        )
      : null;

    return NextResponse.json({
      stages,
      phases,
      totals: {
        active: totalActive,
        stuck: totalStuck,
        stuck_pct: totalActive ? Math.round((totalStuck / totalActive) * 100) : 0,
        // Suma de los promedios ACTUALES por etapa. No es time-to-hire:
        // baja cuando el funnel se vacía. Sirve para comparar el peso de
        // Selección contra el de Contratación, no para prometer una fecha.
        end_to_end_days: Math.round(phases.reduce((s, p) => s + p.total_days, 0) * 10) / 10,
        open_vacancies: openVacs.length,
        bottleneck: bottleneck
          ? {
              id: bottleneck.id,
              label: bottleneck.label,
              avg_days: bottleneck.avg_days,
              sla: bottleneck.sla,
              count: bottleneck.count,
              // Contexto para que la tarjeta no sea solo un nombre de etapa:
              // de quién depende y qué hay que hacer para destrabarla.
              owner: bottleneck.owner,
              action: bottleneck.action,
            }
          : null,
        // El candidato que lleva más tiempo parado en todo el pipeline.
        // Reemplaza al viejo "peso del proceso", que era una suma de
        // promedios sin significado operativo.
        most_stuck: mostStuck
          ? {
              id: mostStuck.id,
              name: mostStuck.name,
              days: mostStuck.days,
              stage_label: STAGES.find((st) => String(st.id) === String(mostStuck.stage))?.label ?? mostStuck.stage,
              vacancy_title: mostStuck.vacancy_title,
            }
          : null,
      },
      // Qué proporción de los días mostrados sale de updated_at y no del
      // historial real. La UI lo advierte cuando es alto.
      approx_ratio: live.length ? Math.round((approxCount / live.length) * 100) : 0,
    });
  } catch (e: any) {
    console.error("[funnel-timing]", e);
    return NextResponse.json({ error: "internal", detail: e?.message }, { status: 500 });
  }
}

/** Mismo criterio que slaStatus(), pero contra un SLA dado en vez del de la etapa */
function testSlaStatus(sla: number, days: number): "ok" | "warning" | "serious" | "critical" {
  if (!sla) return "ok";
  if (days >= sla * 2) return "critical";
  if (days > sla) return "serious";
  if (days >= sla) return "warning";
  return "ok";
}

function emptyTotals() {
  return {
    active: 0, stuck: 0, stuck_pct: 0, end_to_end_days: 0,
    open_vacancies: 0, bottleneck: null, most_stuck: null,
  };
}
