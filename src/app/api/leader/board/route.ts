/**
 * GET /api/leader/board  — el tablero que ve un líder en WXM
 *
 * Devuelve, por cada vacante donde la persona es el líder solicitante:
 *   - en qué estado está su requisición y hace cuántos días
 *   - cuántos candidatos hay en cada etapa (números, no personas)
 *   - los días promedio por etapa y cuál es el cuello de botella
 *   - qué necesita el proceso de él
 *
 * QUÉ NO DEVUELVE, Y POR QUÉ
 * Nombres, correos, teléfonos, hojas de vida ni resultados de pruebas. El
 * líder no opera el proceso: necesita saber si va bien y cuándo le toca. La
 * única excepción es la terna, porque para entrevistar hay que saber a quién.
 *
 * El recorte pasa acá, en el servidor. Mandar todo y esconderlo en la pantalla
 * de WXM no serviría: los datos viajarían igual y se leen desde la consola del
 * navegador.
 *
 * CERRAR O CONTRATAR
 * `ht_requisitions.status` se queda en `publicada` cuando la búsqueda termina:
 * esa columna solo modela la aprobación. Acá se deriva Closed o Hired a partir
 * de la vacante y de si hay alguien en `contratado`, y se apaga el reloj de
 * SLA. WXM pinta `status_label` y no necesita otro estado en su base.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWxm, correoDelLider } from "@/lib/wxm-auth";
import { STAGES, normalizeStage, slaStatus, type StageCode } from "@/lib/stage-labels";
import { diasEnEstado } from "@/lib/requisitions";
import { ETAPAS_CONTRATADO, esContratado, estadoTablero, relojSla } from "@/lib/requisition-board";

export const runtime = "nodejs";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

/** Meta de días desde que se aprueba la requisición hasta la oferta. */
const TTF_META_DIAS = 22;

function dias(dt?: string | null): number {
  if (!dt) return 0;
  const ms = Date.now() - new Date(dt).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export async function GET(req: NextRequest) {
  const authError = requireWxm(req);
  if (authError) return authError;

  const leadEmail = correoDelLider(req);
  if (!leadEmail) {
    return NextResponse.json({ error: "Falta el correo del líder" }, { status: 400 });
  }

  try {
    // ── 1) Sus requisiciones ────────────────────────────────────────────
    const { data: reqsRaw, error: reqErr } = await supabaseAdmin
      .from("ht_requisitions")
      .select(
        "id, title, area, requisition_type, status, reason, needed_by, " +
          "decision_note, approved_at, vacancy_id, created_at, updated_at",
      )
      .eq("client_id", TS_CLIENT_ID)
      .ilike("lead_email", leadEmail)
      .order("created_at", { ascending: false });

    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 });
    const reqs = (reqsRaw || []) as any[];

    // ── 2) Sus vacantes (abiertas y cerradas) ───────────────────────────
    // Las cerradas también hacen falta: de su status sale Closed / Hired.
    // El conteo de candidatos sigue usando solo las abiertas.
    const { data: vacs, error: vacErr } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, area, status, requisition_id, created_at")
      .eq("client_id", TS_CLIENT_ID)
      .ilike("hiring_lead_email", leadEmail);
    if (vacErr) return NextResponse.json({ error: vacErr.message }, { status: 500 });

    const porIdVacante = new Map<string, any>();
    for (const v of (vacs || []) as any[]) porIdVacante.set(v.id, v);

    // La requisición puede apuntar a una vacante cuyo líder no coincide con
    // el correo de esta consulta. Sin esa fila no se puede saber si está
    // cerrada y el tablero seguiría diciendo Posted.
    const faltan = reqs
      .map((r) => r.vacancy_id as string | null)
      .filter((id): id is string => !!id && !porIdVacante.has(id));
    if (faltan.length > 0) {
      const { data: extra, error: extraErr } = await supabaseAdmin
        .from("ht_vacancies")
        .select("id, title, area, status, requisition_id, created_at")
        .in("id", faltan);
      if (extraErr) return NextResponse.json({ error: extraErr.message }, { status: 500 });
      for (const v of (extra || []) as any[]) porIdVacante.set(v.id, v);
    }

    const vacantesContratadas = new Set<string>();
    const idsBusqueda = Array.from(porIdVacante.keys());
    if (idsBusqueda.length > 0) {
      const { data: hires, error: hireErr } = await supabaseAdmin
        .from("ht_candidates")
        .select("vacancy_id, stage, status")
        .in("vacancy_id", idsBusqueda)
        .in("stage", ETAPAS_CONTRATADO);
      // Sin esta lectura el tablero volvería a decir Posted en una
      // contratación que ya existe. Mejor fallar que mentir.
      if (hireErr) return NextResponse.json({ error: hireErr.message }, { status: 500 });
      for (const h of (hires || []) as any[]) {
        if (!h.vacancy_id || h.status === "rejected" || !esContratado(h.stage)) continue;
        vacantesContratadas.add(h.vacancy_id);
      }
    }

    const vacanteDe = (r: any): any | null => {
      if (r.vacancy_id && porIdVacante.has(r.vacancy_id)) return porIdVacante.get(r.vacancy_id);
      for (const v of porIdVacante.values()) {
        if (v.requisition_id === r.id) return v;
      }
      return null;
    };

    // Whitelist: una vacante pausada o con un estado nuevo no es una vacante
    // abierta. Se incluyen las que llegaron por el id de la requisición.
    const abiertas = Array.from(porIdVacante.values()).filter(
      (v) => v.status == null || v.status === "open",
    );
    const vacIds = abiertas.map((v: any) => v.id);

    // ── 3) Candidatos vivos de esas vacantes ────────────────────────────
    const porVacante = new Map<string, any[]>();
    let sinHistorial = 0;
    let totalVivos = 0;

    if (vacIds.length > 0) {
      const { data: cands } = await supabaseAdmin
        .from("ht_candidates")
        .select("id, vacancy_id, stage, status, name, updated_at")
        .in("vacancy_id", vacIds)
        .not("email", "ilike", "%@tradingsolutions.com");

      const vivos = (cands || []).filter(
        (c: any) => c.status !== "rejected" && normalizeStage(c.stage) !== "rechazado",
      );
      totalVivos = vivos.length;

      // Último evento de etapa, para saber desde cuándo está donde está.
      const ultimoEvento = new Map<string, { at: string; source: string }>();
      if (vivos.length > 0) {
        const porId = new Map<string, any>(vivos.map((c: any) => [c.id, c]));
        const { data: eventos } = await supabaseAdmin
          .from("ht_candidate_stage_events")
          .select("candidate_id, to_stage, changed_at, source")
          .in("candidate_id", Array.from(porId.keys()))
          .order("changed_at", { ascending: false });

        for (const ev of (eventos || []) as any[]) {
          const c = porId.get(ev.candidate_id);
          if (!c) continue;
          if (normalizeStage(ev.to_stage) !== normalizeStage(c.stage)) continue;
          if (!ultimoEvento.has(ev.candidate_id)) {
            ultimoEvento.set(ev.candidate_id, { at: ev.changed_at, source: ev.source });
          }
        }
      }

      for (const c of vivos) {
        const ev = ultimoEvento.get(c.id);
        // Un evento sembrado salió de updated_at: la fecha es reconstruida, no
        // registrada. Cuenta como aproximada igual que no tener evento.
        const aprox = !ev || ev.source === "backfill";
        if (aprox) sinHistorial++;
        const arr = porVacante.get(c.vacancy_id) || [];
        arr.push({
          id: c.id,
          name: c.name,
          stage: normalizeStage(c.stage),
          dias: dias(ev?.at || c.updated_at),
          aprox,
        });
        porVacante.set(c.vacancy_id, arr);
      }
    }

    // ── 4) Armar una tarjeta por requisición ────────────────────────────
    const tarjetas = reqs.map((r: any) => {
      const vacVinculada = vacanteDe(r);
      const vac = abiertas.find((v: any) => v.id === (vacVinculada?.id || r.vacancy_id));
      const candidatos = vac ? porVacante.get(vac.id) || [] : [];
      const estado = estadoTablero({
        reqStatus: r.status,
        vacancyStatus: vacVinculada?.status ?? null,
        tieneContratado: !!(vacVinculada && vacantesContratadas.has(vacVinculada.id)),
      });

      // Conteo por etapa. Se recorren las 13 etapas siempre, para que la
      // pantalla no cambie de forma según haya o no gente.
      const etapas = STAGES.map((s) => {
        const enEtapa = candidatos.filter((c: any) => c.stage === (s.id as StageCode));
        const n = enEtapa.length;
        const diasProm = n
          ? Math.round((enEtapa.reduce((a: number, c: any) => a + c.dias, 0) / n) * 10) / 10
          : null;
        return {
          id: s.id,
          label: s.label,
          phase: s.phase,
          count: n,
          dias_promedio: diasProm,
          sla: s.sla ?? null,
          sla_status: n && diasProm != null ? slaStatus(s.id, diasProm) : null,
        };
      });

      const conGente = etapas.filter((e) => e.count > 0);
      const cuello =
        conGente.length > 0
          ? conGente.reduce((peor, e) =>
              (e.dias_promedio ?? 0) > (peor.dias_promedio ?? 0) ? e : peor,
            )
          : null;

      // La terna es la única etapa donde el líder ve nombres: es cuando le
      // toca entrevistar.
      const enTerna = candidatos.filter((c: any) => c.stage === "terna");

      const diasDesdeAprobacion = r.approved_at ? dias(r.approved_at) : null;
      const reloj = relojSla(
        estado.terminal,
        diasDesdeAprobacion,
        TTF_META_DIAS,
        diasEnEstado(r.updated_at),
      );

      // Qué necesita el proceso de él. Sin esto el tablero es algo que se
      // mira una vez y nunca más. Una búsqueda ya cerrada o contratada no
      // le pide nada.
      let pendiente: string | null = null;
      if (!estado.terminal && r.status === "devuelta") {
        pendiente = "Wellness te devolvió la requisición: falta información para armar el perfil.";
      } else if (!estado.terminal && enTerna.length > 0) {
        const espera = Math.max(...enTerna.map((c: any) => c.dias));
        pendiente =
          `Tenés que entrevistar a ${enTerna.length} ` +
          `${enTerna.length === 1 ? "finalista" : "finalistas"}` +
          (espera > 0 ? `. Llevan ${espera} ${espera === 1 ? "día" : "días"} esperando.` : ".");
      }

      return {
        requisicion_id: r.id,
        vacancy_id: r.vacancy_id || vacVinculada?.id || null,
        title: r.title,
        area: r.area,
        tipo: r.requisition_type,
        status: estado.status,
        status_label: estado.status_label,
        status_label_es: estado.status_label_es,
        status_hint: estado.status_hint,
        status_hint_es: estado.status_hint_es,
        dias_en_estado: reloj.dias_en_estado,
        motivo_devolucion: !estado.terminal && r.status === "devuelta" ? r.decision_note : null,
        // La fecha en que se aprobó sigue siendo cierta. El reloj de SLA
        // (dias_desde_aprobacion / meta_dias) es el que se apaga.
        aprobada_el: r.approved_at,
        dias_desde_aprobacion: reloj.dias_desde_aprobacion,
        meta_dias: reloj.meta_dias,
        sla_activo: reloj.sla_activo,
        activos: candidatos.length,
        etapas,
        cuello_de_botella: cuello
          ? { etapa: cuello.label, dias_promedio: cuello.dias_promedio, count: cuello.count }
          : null,
        // Nombres solo acá.
        terna: enTerna.map((c: any) => ({ nombre: c.name, dias_esperando: c.dias })),
        pendiente_del_lider: pendiente,
      };
    });

    return NextResponse.json({
      lider: leadEmail,
      vacantes: tarjetas,
      // Cuánto de los días mostrados es estimación y no registro. La pantalla
      // tiene que poder advertirlo: decirle a un líder que algo lleva 12 días
      // cuando en realidad no se sabe es peor que no decirle nada.
      ratio_aproximado: totalVivos > 0 ? Math.round((sinHistorial / totalVivos) * 100) / 100 : 0,
    });
  } catch (err: any) {
    console.error("[leader/board]", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
