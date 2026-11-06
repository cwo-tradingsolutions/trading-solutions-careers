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
 * Esa excepción no aplica cuando la búsqueda ya terminó.
 *
 * El recorte pasa acá, en el servidor. Mandar todo y esconderlo en la pantalla
 * de WXM no serviría: los datos viajarían igual y se leen desde la consola del
 * navegador.
 *
 * CERRAR O CONTRATAR
 * `ht_requisitions.status` se queda como está: esa columna solo modela la
 * aprobación y no se reescribe al leer. Encima se agregan `estado_final`,
 * `sla_activo`, `candidatos_total` y `hitos_fechas`. Las etapas de una
 * vacante cerrada dejan de ir en cero. Nada de esto escribe en la base.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWxm, correoDelLider } from "@/lib/wxm-auth";
import { STAGES, slaStatus, type StageCode } from "@/lib/stage-labels";
import { STATUS_LABEL, STATUS_HINT, diasEnEstado, type RequisitionStatus } from "@/lib/requisitions";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import {
  camposBoard,
  cuentaEnTablero,
  esVivo,
  etapaCanon,
  type CandidatoBoard,
  type EventoEtapa,
} from "@/lib/requisition-board";

export const runtime = "nodejs";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

/** Meta de días desde que se aprueba la requisición hasta la oferta. */
const TTF_META_DIAS = 22;

const LOTE = 100;

function dias(dt?: string | null): number {
  if (!dt) return 0;
  const ms = Date.now() - new Date(dt).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function esquemaAusente(message: string): boolean {
  return /does not exist|schema cache|could not find the/i.test(message);
}

async function enLotes<T>(
  ids: string[],
  leer: (lote: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await leer(ids.slice(i, i + LOTE));
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}

/** Fechas auxiliares: si la tabla no está en este ambiente, el hito queda null. */
async function enLotesOpcional<T>(
  ids: string[],
  leer: (lote: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  try {
    return await enLotes(ids, leer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (esquemaAusente(message)) return [];
    throw err;
  }
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

    // ── 2) Sus vacantes, abiertas y cerradas ───────────────────────────
    // El status de la vacante es lo que dice si la búsqueda terminó. Si la
    // requisición apunta a una fila cuyo líder no coincide, igual hay que
    // leerla: si no, el tablero seguiría hablando solo de la aprobación.
    const { data: vacs, error: vacErr } = await supabaseAdmin
      .from("ht_vacancies")
      .select("id, title, area, status, requisition_id, created_at")
      .eq("client_id", TS_CLIENT_ID)
      .ilike("hiring_lead_email", leadEmail);
    if (vacErr) return NextResponse.json({ error: vacErr.message }, { status: 500 });

    const porIdVacante = new Map<string, any>();
    for (const v of (vacs || []) as any[]) porIdVacante.set(v.id, v);

    const faltan = reqs
      .map((r) => r.vacancy_id as string | null)
      .filter((id): id is string => !!id && !porIdVacante.has(id));
    if (faltan.length > 0) {
      const extra = await enLotes<any>(faltan, (lote) =>
        supabaseAdmin
          .from("ht_vacancies")
          .select("id, title, area, status, requisition_id, created_at")
          .eq("client_id", TS_CLIENT_ID)
          .in("id", lote),
      );
      for (const v of extra) porIdVacante.set(v.id, v);
    }

    const vacanteDe = (r: any): any | null => {
      if (r.vacancy_id && porIdVacante.has(r.vacancy_id)) return porIdVacante.get(r.vacancy_id);
      for (const v of porIdVacante.values()) {
        if (v.requisition_id === r.id) return v;
      }
      return null;
    };

    const vacIds = Array.from(
      new Set(
        reqs
          .map((r) => vacanteDe(r)?.id as string | undefined)
          .filter((id): id is string => !!id),
      ),
    );
    const reqIds = reqs.map((r) => r.id as string);

    // ── 3) Candidatos de esas vacantes, también si ya cerraron ─────────
    // Antes el conteo pedía solo las abiertas y una cerrada salía en cero.
    const candidatos = vacIds.length
      ? await (async () => {
          const out: CandidatoBoard[] = [];
          for (let i = 0; i < vacIds.length; i += LOTE) {
            const lote = vacIds.slice(i, i + LOTE);
            const rows = await fetchAllRows<CandidatoBoard>(() =>
              supabaseAdmin
                .from("ht_candidates")
                .select("id, vacancy_id, stage, status, name, email, created_at, updated_at")
                .in("vacancy_id", lote),
            );
            out.push(...rows);
          }
          return out;
        })()
      : [];

    const porVacante = new Map<string, CandidatoBoard[]>();
    for (const c of candidatos) {
      if (!c.vacancy_id) continue;
      const arr = porVacante.get(c.vacancy_id) || [];
      arr.push(c);
      porVacante.set(c.vacancy_id, arr);
    }

    const candidateIds = candidatos.map((c) => c.id);
    const eventos = candidateIds.length
      ? await (async () => {
          const out: EventoEtapa[] = [];
          for (let i = 0; i < candidateIds.length; i += LOTE) {
            const lote = candidateIds.slice(i, i + LOTE);
            const rows = await fetchAllRows<EventoEtapa>(
              () =>
                supabaseAdmin
                  .from("ht_candidate_stage_events")
                  .select("candidate_id, to_stage, changed_at, source")
                  .in("candidate_id", lote),
              1000,
              [
                { column: "changed_at", ascending: true },
                { column: "id", ascending: true },
              ],
            );
            out.push(...rows);
          }
          return out;
        })()
      : [];

    const [eventosReq, postings, milestones] = await Promise.all([
      reqIds.length
        ? enLotesOpcional<any>(reqIds, (lote) =>
            supabaseAdmin
              .from("ht_requisition_events")
              .select("requisition_id, to_status, changed_at")
              .in("requisition_id", lote)
              .eq("to_status", "publicada"),
          )
        : Promise.resolve([]),
      vacIds.length
        ? enLotesOpcional<any>(vacIds, (lote) =>
            supabaseAdmin
              .from("ht_vacancy_postings")
              .select("vacancy_id, posted_at")
              .in("vacancy_id", lote),
          )
        : Promise.resolve([]),
      vacIds.length
        ? enLotesOpcional<any>(vacIds, (lote) =>
            supabaseAdmin
              .from("ht_vacancy_milestones")
              .select("vacancy_id, hire_date")
              .in("vacancy_id", lote),
          )
        : Promise.resolve([]),
    ]);

    const publicadaPorReq = new Map<string, string[]>();
    for (const ev of eventosReq) {
      if (!ev.changed_at) continue;
      const arr = publicadaPorReq.get(ev.requisition_id) || [];
      arr.push(ev.changed_at);
      publicadaPorReq.set(ev.requisition_id, arr);
    }
    const postingPorVac = new Map<string, string[]>();
    for (const p of postings) {
      if (!p.posted_at) continue;
      const arr = postingPorVac.get(p.vacancy_id) || [];
      arr.push(p.posted_at);
      postingPorVac.set(p.vacancy_id, arr);
    }
    const hirePorVac = new Map<string, string | null>();
    for (const m of milestones) {
      if (!m.vacancy_id || !m.hire_date) continue;
      const previa = hirePorVac.get(m.vacancy_id);
      if (!previa || String(m.hire_date) < previa) hirePorVac.set(m.vacancy_id, String(m.hire_date));
    }

    // Último evento de etapa, para saber desde cuándo está donde está.
    const eventosDesc = [...eventos].sort((a, b) =>
      String(b.changed_at || "").localeCompare(String(a.changed_at || "")),
    );

    let sinHistorial = 0;
    let totalVivos = 0;

    // ── 4) Armar una tarjeta por requisición ────────────────────────────
    const tarjetas = reqs.map((r: any) => {
      const vac = vacanteDe(r);
      const filas = vac ? porVacante.get(vac.id) || [] : [];
      const campos = camposBoard({
        vacancyStatus: vac?.status ?? null,
        approvedAt: r.approved_at,
        publicadaEn: [...(publicadaPorReq.get(r.id) || []), ...(vac ? postingPorVac.get(vac.id) || [] : [])],
        candidatos: filas,
        eventos,
        hireDate: vac ? hirePorVac.get(vac.id) ?? null : null,
        // Cerrar la vacante solo escribe `status`. No hay closed_at fiable
        // y updated_at no se movió al cerrar: el hito queda null.
        closedAt: null,
      });

      const visibles = filas.filter(cuentaEnTablero);
      const vivos = visibles.filter(esVivo);
      const porId = new Map<string, CandidatoBoard>(vivos.map((c) => [c.id, c]));
      const ultimoEvento = new Map<string, { at: string; source: string }>();
      for (const ev of eventosDesc) {
        const c = porId.get(ev.candidate_id);
        if (!c) continue;
        if (etapaCanon(ev.to_stage) !== etapaCanon(c.stage)) continue;
        if (!ultimoEvento.has(ev.candidate_id)) {
          ultimoEvento.set(ev.candidate_id, { at: ev.changed_at || "", source: ev.source || "" });
        }
      }

      const conDias = vivos.map((c) => {
        const ev = ultimoEvento.get(c.id);
        const aprox = !ev || (ev.source || "").toLowerCase() === "backfill";
        if (aprox) sinHistorial++;
        totalVivos++;
        return {
          id: c.id,
          name: c.name,
          stage: etapaCanon(c.stage) as StageCode,
          dias: dias(ev?.at || c.updated_at),
          aprox,
        };
      });

      // Conteo por etapa. Se recorren las 13 etapas siempre, para que la
      // pantalla no cambie de forma según haya o no gente. El número sale
      // del mismo cálculo que `campos.conteos`, también en las cerradas.
      const etapas = STAGES.map((s) => {
        const enEtapa = conDias.filter((c) => c.stage === (s.id as StageCode));
        const n = campos.conteos[s.id] ?? 0;
        const diasProm =
          n > 0 && enEtapa.length > 0
            ? Math.round((enEtapa.reduce((a, c) => a + c.dias, 0) / enEtapa.length) * 10) / 10
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

      const busquedaAbierta = campos.estado_final == null;
      const enTerna = busquedaAbierta ? conDias.filter((c) => c.stage === "terna") : [];

      const diasDesdeAprobacion = r.approved_at ? dias(r.approved_at) : null;

      let pendiente: string | null = null;
      if (busquedaAbierta && r.status === "devuelta") {
        pendiente = "Wellness te devolvió la requisición: falta información para armar el perfil.";
      } else if (busquedaAbierta && enTerna.length > 0) {
        const espera = Math.max(...enTerna.map((c) => c.dias));
        pendiente =
          `Tenés que entrevistar a ${enTerna.length} ` +
          `${enTerna.length === 1 ? "finalista" : "finalistas"}` +
          (espera > 0 ? `. Llevan ${espera} ${espera === 1 ? "día" : "días"} esperando.` : ".");
      }

      return {
        requisicion_id: r.id,
        vacancy_id: r.vacancy_id,
        title: r.title,
        area: r.area,
        tipo: r.requisition_type,
        status: r.status as RequisitionStatus,
        status_label: STATUS_LABEL[r.status as RequisitionStatus] || r.status,
        status_hint: STATUS_HINT[r.status as RequisitionStatus] || null,
        estado_final: campos.estado_final,
        dias_en_estado: diasEnEstado(r.updated_at),
        motivo_devolucion: busquedaAbierta && r.status === "devuelta" ? r.decision_note : null,
        aprobada_el: r.approved_at,
        dias_desde_aprobacion: diasDesdeAprobacion,
        meta_dias: TTF_META_DIAS,
        sla_activo: campos.sla_activo,
        activos: conDias.length,
        candidatos_total: campos.candidatos_total,
        etapas,
        cuello_de_botella:
          busquedaAbierta && cuello
            ? { etapa: cuello.label, dias_promedio: cuello.dias_promedio, count: cuello.count }
            : null,
        terna: enTerna.map((c) => ({ nombre: c.name, dias_esperando: c.dias })),
        pendiente_del_lider: pendiente,
        hitos_fechas: campos.hitos_fechas,
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
