"use client";

/**
 * Presentación del command center.
 *
 * La estructura sigue el mockup Universe × Power BI (slicer, fichas,
 * dos columnas, tres columnas, matriz). Otro archivo puede reemplazar
 * este sin tocar las métricas. Los colores son los tokens --ts-* y la
 * lima de marca. El estado de SLA lleva ícono y texto: En SLA, En riesgo,
 * Fuera de SLA. No usa semáforo rojo / amarillo / verde.
 */

import { Fragment, type ReactNode } from "react";
import { AlertOctagon, AlertTriangle, Check, Minus } from "lucide-react";
import type { CurrencyCost, DashboardPayload, DrillRow, SlaBar, VacancyCost, VacancyRow } from "@/lib/funnel-dashboard/metrics";
import { MUESTRA, SIN_CODIGO, SIN_HITO } from "@/lib/funnel-dashboard/metrics";

const INK = "var(--ts-ink)";
const ACCENT = "var(--ts-accent)";
const LIME = "var(--ts-highlight)";

export type DashFilterState = {
  vacancy: string;
  area: string;
  country: string;
  recruiter: string;
  source: string;
  stage: string;
  from: string;
  to: string;
};

type DrillPayload = {
  vacancy: { title: string } | null;
  rows: DrillRow[];
};

type EstadoId = "en_sla" | "en_riesgo" | "fuera" | "sin_hito" | "sin_target" | "otro";

function num(n: number, digits = 1): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(n);
}

function fmtDays(n: number | null): string {
  if (n == null) return "sin dato";
  return `${num(n, 1)} d`;
}

function fmtPct(n: number | null): string {
  if (n == null) return "sin dato";
  return `${num(n, 1)} %`;
}

function fmtMoney(n: number, currency: "COP" | "USD"): string {
  const amount = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(n));
  return `${amount} ${currency}`;
}

function fmtDelta(d: number | null, unit: "days" | "pct"): string {
  if (d == null) return "sin periodo anterior";
  const sign = d > 0 ? "+" : "";
  return `${sign}${num(d, 1)}${unit === "days" ? " d" : " pp"}`;
}

function estadoDe(semaforo: string | null): EstadoId {
  if (semaforo === "ok") return "en_sla";
  if (semaforo === "warning") return "en_riesgo";
  if (semaforo === "serious" || semaforo === "critical") return "fuera";
  if (semaforo === "sin_hito") return "sin_hito";
  if (semaforo === "sin_target") return "sin_target";
  return "otro";
}

function barColor(id: EstadoId): string {
  if (id === "en_sla") return ACCENT;
  if (id === "en_riesgo") return "rgba(8, 20, 32, 0.35)";
  return INK;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export default function CommandCenterLayout({
  data,
  loading,
  error,
  onRetry,
  filters,
  onFilter,
  onClear,
  openVac,
  drill,
  drillError,
  onOpenVac,
  onOpenCandidate,
}: {
  data: DashboardPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  filters: DashFilterState;
  onFilter: (key: keyof DashFilterState, value: string) => void;
  onClear: () => void;
  openVac: string | null;
  drill: DrillPayload | null;
  drillError: string | null;
  onOpenVac: (id: string) => void;
  onOpenCandidate?: (id: string) => void;
}) {
  const asOf = data?.asOf ?? "";
  const abiertas = (data?.vacancies ?? []).filter((v) => v.open && v.inCostScope);
  const cuello = cuelloPrincipal(data?.slaBars ?? []);
  const maxSla = Math.max(1, ...(data?.slaBars.map((g) => Math.max(g.avgDays ?? 0, g.sla ?? 0)) ?? [1]));
  const maxFunnel = Math.max(1, ...(data?.funnel.map((g) => g.reached) ?? [1]));

  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-4">
      <aside className="mb-4 lg:mb-0 lg:border-r lg:border-[color:var(--ts-line)] lg:pr-4">
        <SlicerTitle>Filtros</SlicerTitle>
        <SlicerSelect label="Vacante" value={filters.vacancy} onChange={(v) => onFilter("vacancy", v)}>
          <option value="">Todas</option>
          {data?.options.vacancies.map((v) => (
            <option key={v.id} value={v.id}>{v.title}</option>
          ))}
        </SlicerSelect>
        <SlicerSelect label="Área" value={filters.area} onChange={(v) => onFilter("area", v)}>
          <option value="">Todas</option>
          {data?.options.areas.map((v) => <option key={v} value={v}>{v}</option>)}
        </SlicerSelect>
        <SlicerSelect label="País" value={filters.country} onChange={(v) => onFilter("country", v)}>
          <option value="">Todos</option>
          {data?.options.countries.map((v) => <option key={v} value={v}>{v}</option>)}
        </SlicerSelect>
        <SlicerSelect label="Recruiter" value={filters.recruiter} onChange={(v) => onFilter("recruiter", v)}>
          <option value="">Todos</option>
          {data?.options.recruiters.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </SlicerSelect>
        <SlicerSelect label="Canal" value={filters.source} onChange={(v) => onFilter("source", v)}>
          <option value="">Todos</option>
          {data?.options.sources.map((v) => <option key={v} value={v}>{v}</option>)}
        </SlicerSelect>
        <SlicerSelect label="Etapa" value={filters.stage} onChange={(v) => onFilter("stage", v)}>
          <option value="">Todas</option>
          {data?.options.stages.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </SlicerSelect>

        <SlicerTitle>Periodo</SlicerTitle>
        <div className="flex flex-wrap gap-1.5 mb-2">
          <Periodo
            label="Todo"
            on={filters.from === "" && filters.to === ""}
            onClick={() => { onFilter("from", ""); onFilter("to", ""); }}
          />
          {asOf && (
            <>
              <Periodo
                label="Últimos 90d"
                on={filters.from === shiftDays(asOf, -90) && filters.to === dayKey(asOf)}
                onClick={() => { onFilter("from", shiftDays(asOf, -90)); onFilter("to", dayKey(asOf)); }}
              />
              <Periodo
                label="Este mes"
                on={filters.from === `${asOf.slice(0, 7)}-01` && filters.to === dayKey(asOf)}
                onClick={() => { onFilter("from", `${asOf.slice(0, 7)}-01`); onFilter("to", dayKey(asOf)); }}
              />
              <Periodo
                label={`YTD ${asOf.slice(0, 4)}`}
                on={filters.from === `${asOf.slice(0, 4)}-01-01` && filters.to === dayKey(asOf)}
                onClick={() => { onFilter("from", `${asOf.slice(0, 4)}-01-01`); onFilter("to", dayKey(asOf)); }}
              />
            </>
          )}
        </div>
        <label className="block text-[11px] text-[var(--ts-muted)] mb-1">
          Desde
          <input type="date" value={filters.from} onChange={(e) => onFilter("from", e.target.value)} className={fieldCls} />
        </label>
        <label className="block text-[11px] text-[var(--ts-muted)] mb-2">
          Hasta
          <input type="date" value={filters.to} onChange={(e) => onFilter("to", e.target.value)} className={fieldCls} />
        </label>
        <button type="button" onClick={onClear} className="text-[12px] underline text-[var(--ts-ink)]">
          Limpiar
        </button>

        <div className="mt-4 rounded-[14px] bg-[var(--ts-gray-10)] p-3 text-[11px] leading-relaxed text-[var(--ts-muted)]">
          <div className="font-semibold text-[var(--ts-ink)] mb-1">Estado del SLA</div>
          <div className="flex flex-col gap-1">
            <Estado id="en_sla" />
            <Estado id="en_riesgo" />
            <Estado id="fuera" />
          </div>
          <p className="mt-2">El ícono y el texto dicen el estado. El color no alcanza solo.</p>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight m-0">Careers Command</h1>
            <p className="text-[12px] text-[var(--ts-muted)] m-0 mt-0.5">
              {asOf ? asOf.slice(0, 10) : "—"} · foto del funnel y costo salarial base
            </p>
          </div>
        </div>

        {data?.example && (
          <div className="mb-3 rounded-[14px] border border-[color:var(--ts-line)] bg-white px-3 py-2 text-[13px]">
            <b>Datos de ejemplo.</b> No son cifras del ATS. Sirven para revisar la forma del tablero.
          </div>
        )}
        {(data?.kpis.salaryCost.sourceErrors ?? []).map((msg) => (
          <div key={msg} role="alert" className="mb-3 rounded-[14px] border border-[color:var(--ts-ink)] bg-white px-3 py-2 text-[13px] text-[var(--ts-ink)]">
            <AlertTriangle className="inline w-3.5 h-3.5 mr-1.5" aria-hidden />
            <b>{msg}</b>
          </div>
        ))}

        {loading && !data && <p className="text-[13px] text-[var(--ts-muted)]">Cargando dashboard…</p>}
        {error && (
          <div className="mb-3 rounded-[14px] border border-[color:var(--ts-line)] bg-white px-3 py-2 text-[13px] flex justify-between gap-3">
            <span>{error}</span>
            <button type="button" onClick={onRetry} className="underline font-medium">Reintentar</button>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5 mb-2.5">
              <Kpi
                label="Time to fill"
                value={data.kpis.ttf.insufficient ? MUESTRA : fmtDays(data.kpis.ttf.value)}
                detail={`n=${data.kpis.ttf.n} · ${fmtDelta(data.kpis.ttf.delta, "days")} · hire_date − hr_request_date`}
              />
              <Kpi
                label="Time to hire"
                value={data.kpis.tth.insufficient ? MUESTRA : fmtDays(data.kpis.tth.value)}
                detail={`n=${data.kpis.tth.n} · ${fmtDelta(data.kpis.tth.delta, "days")} · contratado − created_at`}
              />
              <Kpi
                label="% fuera de SLA"
                ink
                value={data.kpis.sla.insufficient ? MUESTRA : fmtPct(data.kpis.sla.value)}
                detail={`${data.kpis.sla.over} de ${data.kpis.sla.n} evaluables · ${data.kpis.sla.approx} aprox. fuera · ${fmtDelta(data.kpis.sla.delta, "pct")}`}
              />
              <Kpi
                label="Offer accept"
                value={data.kpis.offer.insufficient ? MUESTRA : fmtPct(data.kpis.offer.value)}
                detail={`${data.kpis.offer.accepted} contratados / ${data.kpis.offer.resolved} resueltos · ${data.kpis.offer.pending} pendientes`}
              />
              <Kpi
                label="Vacantes abiertas"
                value={String(data.kpis.open.value ?? 0)}
                detail={data.kpis.open.agingInsufficient
                  ? `aging ${MUESTRA} (n=${data.kpis.open.agingN}) · ${data.kpis.open.sinHito} ${SIN_HITO}`
                  : `aging mediana ${fmtDays(data.kpis.open.agingMedian)} · target ${data.kpis.open.target ?? "sin target"} d · ${data.kpis.open.sinHito} ${SIN_HITO}`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 mb-2.5">
              <Kpi
                label="Aplicó → contratado"
                value={data.kpis.conversion.insufficient ? MUESTRA : fmtPct(data.kpis.conversion.value)}
                detail={`${data.kpis.conversion.num} / ${data.kpis.conversion.den} · ${fmtDelta(data.kpis.conversion.delta, "pct")}`}
              />
              <SalaryKpi data={data} />
              <Kpi
                label="Cuello #1"
                value={cuello ? cuello.label : (data.slaBars.some((g) => g.evaluable > 0) ? MUESTRA : "sin dato")}
                detail={cuello
                  ? `${cuello.insufficient ? MUESTRA : fmtDays(cuello.avgDays)} · ${cuello.over} fuera de ${cuello.evaluable}`
                  : "Hace falta n suficiente en un gate para nombrar el cuello."}
              />
              <PorConstruir
                title="P0 en riesgo"
                why="Por construir. No hay criticidad del cargo en el ATS."
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-2.5 mb-2.5">
              <section className={vizCls}>
                <h2 className="text-[13px] font-semibold">Costo salarial base · vacantes abiertas</h2>
                <p className="text-[11px] text-[var(--ts-muted)] mb-2">
                  {data.kpis.salaryCost.formula}. {data.kpis.salaryCost.openWithSalary} de {data.kpis.salaryCost.openTotal} abiertas con salario.
                  Sin carga prestacional.
                </p>
                {data.kpis.salaryCost.partialCoverage && (
                  <p className="mb-2 flex items-start gap-1.5 text-[12px] text-[var(--ts-ink)]">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                    <span>Cobertura parcial: el total no cubre la mitad de las vacantes abiertas.</span>
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-left text-[11px] text-[var(--ts-muted)]">
                        <th className="py-1 font-medium">Antigüedad vacante</th>
                        <th className="font-medium">Vacante</th>
                        <th className="font-medium">Dueño</th>
                        <th className="font-medium">Días</th>
                        <th className="font-medium">Diario</th>
                        <th className="font-medium">Acumulado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abiertas.map((v) => (
                        <tr key={v.id} className="border-t border-[color:var(--ts-line)]">
                          <td className="py-1.5 pr-2 tabular-nums">{v.agingLabel === SIN_HITO ? "sin dato" : v.agingLabel}</td>
                          <td className="pr-2">
                            <div className="font-medium">{v.title}</div>
                            <div className="text-[10px] text-[var(--ts-muted)]">{fuente(v.cost.salarySource)}</div>
                          </td>
                          <td className="pr-2">{v.owner}</td>
                          <td className="tabular-nums pr-2">{v.cost.daysOpen == null ? "sin dato" : num(v.cost.daysOpen, 0)}</td>
                          <td className="tabular-nums pr-2">{peso(v.cost, "daily")}</td>
                          <td className="tabular-nums">{peso(v.cost, "toDate")}</td>
                        </tr>
                      ))}
                      {abiertas.length === 0 && (
                        <tr><td colSpan={6} className="py-2 text-[var(--ts-muted)]">Sin vacantes abiertas en este filtro.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Cerradas line={data.kpis.salaryCost.byCurrency} withoutHire={data.kpis.salaryCost.closedWithoutHire} />
                <p className="text-[11px] text-[var(--ts-muted)] mt-2">
                  La fila no muestra el salario, solo el costo diario y el acumulado. El reparto por dueño de la demora está por construir.
                </p>
              </section>
              <PorConstruir
                title="¿Quién demora?"
                why="Por construir. No hay dueño de la demora (Wellness, hiring manager, mercado)."
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 mb-2.5">
              <section className={vizCls}>
                <h2 className="text-[13px] font-semibold">Cuellos vs SLA</h2>
                <p className="text-[11px] text-[var(--ts-muted)] mb-2">Promedio en el código actual. La marca es el SLA de ese código.</p>
                <ul>
                  {data.slaBars.map((g) => (
                    <SlaRow key={g.gateId} g={g} max={maxSla} />
                  ))}
                </ul>
              </section>
              <PorConstruir title="Bajas · historia" why="Por construir. La rotación vive en Buk, no en el ATS." />
              <PorConstruir title="Market Scout" why="Por construir. No hay lectura de mercado por cargo." />
            </div>

            <section className={`${vizCls} mb-2.5`}>
              <h2 className="text-[13px] font-semibold">Matriz · vacantes abiertas</h2>
              <p className="text-[11px] text-[var(--ts-muted)] mb-2">
                Clic para ver quién está fuera de SLA. Las cerradas no se listan.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[11px] text-[var(--ts-muted)]">
                      <th className="py-1 font-medium">Antigüedad vacante</th>
                      <th className="font-medium">Vacante</th>
                      <th className="font-medium">Dueño</th>
                      <th className="font-medium">Días</th>
                      <th className="font-medium">Diario</th>
                      <th className="font-medium">Acumulado</th>
                      <th className="font-medium">Cuello</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abiertas.map((v) => (
                      <Fragment key={v.id}>
                        <tr
                          onClick={() => onOpenVac(v.id)}
                          className="border-t border-[color:var(--ts-line)] cursor-pointer hover:bg-[var(--ts-canvas)]"
                        >
                          <td className="py-1.5"><Estado id={estadoDe(v.semaforo)} plazo /></td>
                          <td>
                            <div className="font-medium">{v.title}</div>
                            <div className="text-[10px] text-[var(--ts-muted)]">{v.area}</div>
                          </td>
                          <td>{v.owner}</td>
                          <td className="tabular-nums">{v.agingLabel === SIN_HITO ? "sin dato" : v.agingLabel}</td>
                          <td className="tabular-nums">{peso(v.cost, "daily")}</td>
                          <td className="tabular-nums">{peso(v.cost, "toDate")}</td>
                          <td>{v.bottleneck ?? "—"}{v.overSla > 0 ? ` · ${v.overSla} fuera` : ""}</td>
                        </tr>
                        {openVac === v.id && (
                          <tr className="bg-[var(--ts-canvas)]">
                            <td colSpan={7} className="px-2 py-2">
                              <Drill
                                drill={drill}
                                error={drillError}
                                onOpenCandidate={onOpenCandidate}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mb-2.5">
              <section className={vizCls}>
                <h2 className="text-[13px] font-semibold">Funnel por gate</h2>
                <p className="text-[11px] text-[var(--ts-muted)] mb-2">Alcanzó el gate o uno posterior. 6 y 8 no entran a la conversión.</p>
                <ul className="space-y-1">
                  {data.funnel.map((g) => (
                    <li key={g.gateId} className="grid grid-cols-[28px_120px_1fr_auto] gap-2 items-center text-[12px]">
                      <span className="tabular-nums text-[var(--ts-muted)]">{g.n}</span>
                      <span>{g.label}</span>
                      <span className="h-2 rounded-full bg-[var(--ts-gray-10)] overflow-hidden">
                        <span className="block h-full rounded-full bg-[var(--ts-accent)]" style={{ width: `${(g.reached / maxFunnel) * 100}%` }} />
                      </span>
                      <span className="tabular-nums text-[var(--ts-muted)]">n={g.reached}{g.sinCodigo ? ` · ${SIN_CODIGO}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className={vizCls}>
                <h2 className="text-[13px] font-semibold">TTF y TTH por mes</h2>
                <p className="text-[11px] text-[var(--ts-muted)] mb-2">Un mes entra al gráfico solo con n suficiente.</p>
                <Monthly points={data.monthly} />
              </section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mb-2.5">
              <section className={vizCls}>
                <h2 className="text-[13px] font-semibold">Canal</h2>
                <p className="text-[11px] text-[var(--ts-muted)] mb-2">Sin canal es una categoría. El porcentaje pide n suficiente.</p>
                <table className="w-full text-[12px]">
                  <tbody>
                    {data.channels.map((c) => (
                      <tr key={c.source} className="border-t border-[color:var(--ts-line)]">
                        <td className="py-1">{c.source}</td>
                        <td className="text-right tabular-nums">n={c.applicants}</td>
                        <td className="text-right tabular-nums">{c.insufficient ? MUESTRA : `terna ${fmtPct(c.ternaPct)}`}</td>
                        <td className="text-right tabular-nums">{c.insufficient ? "" : `contratado ${fmtPct(c.hiredPct)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className={vizCls}>
                <h2 className="text-[13px] font-semibold">Calidad de datos</h2>
                <p className="text-[13px]">
                  Sin canal: {data.quality.withoutSource}/{data.quality.candidates}
                  {data.quality.withoutSourcePct == null ? ` · ${MUESTRA}` : ` · ${fmtPct(data.quality.withoutSourcePct)}`}
                  {" · "}
                  Sin historial: {data.quality.withoutHistory}/{data.quality.candidates}
                  {data.quality.withoutHistoryPct == null ? ` · ${MUESTRA}` : ` · ${fmtPct(data.quality.withoutHistoryPct)}`}
                  {" · "}
                  Vacantes sin milestones: {data.quality.withoutMilestones} de {data.quality.vacancies}
                </p>
                <ul className="mt-2 text-[11px] text-[var(--ts-muted)] list-disc pl-4">
                  {data.gaps.map((g) => <li key={g}>{g}</li>)}
                </ul>
              </section>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <PorConstruir title="Costo por vacante" why="Por construir. No hay un monto de reclutamiento por vacante. No es el costo salarial base." />
              <PorConstruir title="Calidad hire @90d" why="Por construir. La calidad después de la contratación vive en Buk, no en el ATS." />
              <PorConstruir
                title="Costo de demora"
                why="Por construir. La ineficiencia y el ingreso no facturado no están en el ATS. El costo salarial base es otra cuenta."
              />
              <PorConstruir title="Pipeline de cargo crítico" why="Por construir. No hay una señal de pipeline por cargo crítico." />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function cuelloPrincipal(bars: SlaBar[]): SlaBar | null {
  const ranked = bars
    .filter((g) => !g.insufficient && g.evaluable > 0 && g.over > 0)
    .sort((a, b) => b.over - a.over || (b.avgDays ?? 0) - (a.avgDays ?? 0));
  return ranked[0] ?? null;
}

function peso(cost: VacancyCost, which: "daily" | "toDate"): string {
  if (cost.salarySource === "sin_dato" || !cost.currency) return "sin dato";
  if (which === "daily") return cost.dailyCost == null ? "sin dato" : fmtMoney(cost.dailyCost, cost.currency);
  if (cost.sinDato != null || cost.costToDate == null) return "sin dato";
  return fmtMoney(cost.costToDate, cost.currency);
}

function fuente(source: VacancyCost["salarySource"]): string {
  if (source === "tope_interno") return "tope interno";
  if (source === "punto_medio_rango") return "punto medio";
  return "sin dato";
}

function SalaryKpi({ data }: { data: DashboardPayload }) {
  const cost = data.kpis.salaryCost;
  const blocks = cost.byCurrency.filter((b) => b.openWithDaily > 0 || b.openAvgDaily != null);
  const value = blocks.length === 0
    ? "sin dato"
    : blocks.map((b) => (b.openAvgDaily == null ? `${b.currency} sin dato` : fmtMoney(b.openAvgDaily, b.currency))).join(" · ");
  const detail = [
    "Costo diario promedio por vacante abierta",
    `${cost.openByCap} por tope · ${cost.openByMidpoint} por punto medio · ${cost.openSinDato} sin dato`,
    `${cost.openWithSalary} de ${cost.openTotal} abiertas con salario`,
    ...blocks.map((b) => b.openAccumulated == null ? "" : `acumulado ${fmtMoney(b.openAccumulated, b.currency)}`),
    "El tope es un techo y puede sobreestimar.",
    cost.formula,
    cost.partialCoverage ? "Cobertura parcial" : "",
  ].filter(Boolean).join(" · ");
  return <Kpi label="Costo salarial base" value={value} detail={detail} />;
}

function Cerradas({ line, withoutHire }: { line: CurrencyCost[]; withoutHire: number }) {
  const hired = line.filter((b) => b.hiredN > 0);
  if (hired.length === 0 && withoutHire === 0) return null;
  return (
    <ul className="mt-2 text-[12px] text-[var(--ts-muted)]">
      {hired.map((b) => (
        <li key={b.currency}>
          Cerradas con contratación {b.currency} · n={b.hiredN} · {b.hiredInsufficient || b.hiredAccumulated == null ? MUESTRA : fmtMoney(b.hiredAccumulated, b.currency)}
        </li>
      ))}
      {withoutHire > 0 && (
        <li>Cerradas sin contratación · n={withoutHire} · sin fecha de cierre, no se calcula</li>
      )}
    </ul>
  );
}

function Monthly({ points }: { points: DashboardPayload["monthly"] }) {
  if (points.length === 0) return <p className="text-[12px] text-[var(--ts-muted)]">sin dato</p>;
  const max = Math.max(1, ...points.flatMap((p) => [p.ttf ?? 0, p.tth ?? 0]));
  return (
    <div>
      <div className="flex items-end gap-2 h-28">
        {points.map((p) => (
          <div key={p.month} className="flex-1 flex items-end gap-0.5 h-full min-w-0">
            <span
              className="flex-1 rounded-t-[4px] bg-[var(--ts-accent)]"
              style={{ height: p.ttf == null ? 0 : `${(p.ttf / max) * 100}%` }}
              title={p.ttf == null ? MUESTRA : `TTF ${num(p.ttf, 1)}`}
            />
            <span
              className="flex-1 rounded-t-[4px]"
              style={{ height: p.tth == null ? 0 : `${(p.tth / max) * 100}%`, background: INK, opacity: 0.35 }}
              title={p.tth == null ? MUESTRA : `TTH ${num(p.tth, 1)}`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1">
        {points.map((p) => (
          <div key={p.month} className="flex-1 text-[9px] text-[var(--ts-muted)] truncate">{p.month.slice(5)}</div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[var(--ts-muted)] flex gap-3">
        <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-[var(--ts-accent)]" /> TTF</span>
        <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-[var(--ts-ink)] opacity-40" /> TTH</span>
      </p>
      <ul className="mt-1 text-[11px] text-[var(--ts-muted)]">
        {points.map((p) => (
          <li key={p.month}>
            {p.month} · n TTF {p.ttfN}{p.ttf == null ? ` · ${MUESTRA}` : ` · ${num(p.ttf, 1)} d`}
            {" · "}n TTH {p.tthN}{p.tth == null ? ` · ${MUESTRA}` : ` · ${num(p.tth, 1)} d`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SlaRow({ g, max }: { g: SlaBar; max: number }) {
  const id = g.insufficient || g.avgDays == null ? "otro" : estadoDe(g.status);
  return (
    <li className="mb-2">
      <div className="flex justify-between gap-2 text-[12px]">
        <span>{g.n}. {g.label}{g.sinCodigo ? ` · ${SIN_CODIGO}` : ""}</span>
        {g.insufficient ? (
          <span className="text-[var(--ts-muted)]">{MUESTRA}</span>
        ) : (
          <Estado id={id === "otro" ? "en_sla" : id} />
        )}
      </div>
      <div className="relative h-2.5 mt-1 rounded-full bg-[var(--ts-gray-10)]">
        {!g.insufficient && g.avgDays != null && (
          <span
            className="absolute left-0 top-0 h-full rounded-full"
            style={{ width: `${Math.min(100, (g.avgDays / max) * 100)}%`, background: barColor(id === "otro" ? "en_sla" : id) }}
          />
        )}
        {g.sla != null && (
          <span className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-[var(--ts-ink)]" style={{ left: `${Math.min(100, (g.sla / max) * 100)}%` }} />
        )}
      </div>
      <div className="text-[11px] text-[var(--ts-muted)] mt-0.5">
        {g.insufficient
          ? `n=${g.evaluable}`
          : `${fmtDays(g.avgDays)}${g.sla != null ? ` / SLA ${g.sla} d` : ""} · ${g.over} fuera`}
      </div>
    </li>
  );
}

function Drill({
  drill,
  error,
  onOpenCandidate,
}: {
  drill: DrillPayload | null;
  error: string | null;
  onOpenCandidate?: (id: string) => void;
}) {
  if (error) return <p className="text-[12px]">{error}</p>;
  if (!drill) return <p className="text-[12px] text-[var(--ts-muted)]">Cargando estancados…</p>;
  if (drill.rows.length === 0) return <p className="text-[12px]">Nadie fuera de SLA en esta vacante con el filtro actual.</p>;
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[var(--ts-muted)]">
          <th className="py-1 font-medium">Nombre</th>
          <th className="font-medium">Etapa</th>
          <th className="font-medium">Días</th>
          <th className="font-medium">SLA</th>
          <th className="font-medium">Canal</th>
          <th className="font-medium">Último evento</th>
        </tr>
      </thead>
      <tbody>
        {drill.rows.map((r) => (
          <tr key={r.id} className="border-t border-[color:var(--ts-line)]">
            <td className="py-1">
              {r.href ? (
                <a href={r.href} className="underline">{r.name}</a>
              ) : (
                <button type="button" className="underline" onClick={() => onOpenCandidate?.(r.id)}>{r.name}</button>
              )}
            </td>
            <td>{r.stageLabel}</td>
            <td className="tabular-nums">{r.days == null ? "aprox." : r.days}</td>
            <td className="tabular-nums">{r.sla == null ? SIN_CODIGO : `${r.sla} d`}</td>
            <td>{r.source}</td>
            <td>{r.lastEvent}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Estado({ id, plazo = false }: { id: EstadoId; plazo?: boolean }) {
  if (id === "en_sla") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ts-accent)]">
        <Check className="w-3.5 h-3.5" aria-hidden /> {plazo ? "En plazo" : "En SLA"}
      </span>
    );
  }
  if (id === "en_riesgo") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ts-ink)]">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: LIME }} aria-hidden />
        <AlertTriangle className="w-3.5 h-3.5" aria-hidden /> En riesgo
      </span>
    );
  }
  if (id === "fuera") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ts-ink)] text-white text-[11px] font-semibold px-2 py-0.5">
        <AlertOctagon className="w-3.5 h-3.5" aria-hidden /> {plazo ? "Fuera de plazo" : "Fuera de SLA"}
      </span>
    );
  }
  if (id === "sin_hito") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ts-muted)]">
        <Minus className="w-3.5 h-3.5" aria-hidden /> Sin hito
      </span>
    );
  }
  if (id === "sin_target") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ts-muted)]">
        <Minus className="w-3.5 h-3.5" aria-hidden /> Sin target
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ts-muted)]">
      <Minus className="w-3.5 h-3.5" aria-hidden /> Sin estado
    </span>
  );
}

const vizCls = "bg-white rounded-[18px] p-3.5 shadow-[0_0_0_0.5px_var(--ts-line)] min-w-0";
const fieldCls = "mt-0.5 block w-full rounded-[12px] bg-[var(--ts-gray-10)] px-2 py-1.5 text-[12px] text-[var(--ts-ink)]";

function Kpi({ label, value, detail, ink = false }: { label: string; value: string; detail: string; ink?: boolean }) {
  return (
    <article
      className={`relative overflow-hidden rounded-[18px] min-h-[102px] p-3.5 flex flex-col ${ink ? "bg-[var(--ts-ink)] text-white" : "bg-[var(--ts-gray-10)] text-[var(--ts-ink)]"}`}
    >
      {ink && <span className="absolute left-0 top-0 right-0 h-1" style={{ background: LIME }} aria-hidden />}
      {!ink && <span className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--ts-ink)] opacity-20" aria-hidden />}
      <div className={`text-[11px] font-medium ${ink ? "text-white/80" : "text-[var(--ts-muted)]"}`}>{label}</div>
      <div className={`mt-2 text-[22px] font-semibold tracking-tight leading-tight break-words ${value === MUESTRA || value === "sin dato" ? "text-[15px]" : ""}`}>{value}</div>
      <div className={`mt-auto pt-2 text-[11px] leading-snug ${ink ? "text-white/75" : "text-[var(--ts-muted)]"}`}>{detail}</div>
    </article>
  );
}

function PorConstruir({ title, why }: { title: string; why: string }) {
  return (
    <section className="rounded-[18px] border border-dashed border-[color:var(--ts-line)] bg-white p-3.5 min-h-[102px]">
      <div className="text-[11px] text-[var(--ts-muted)]">{title}</div>
      <div className="mt-2 text-[18px] font-semibold text-[var(--ts-ink)]">Por construir</div>
      <p className="mt-1 text-[11px] text-[var(--ts-muted)] leading-snug">{why}</p>
    </section>
  );
}

function SlicerTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ts-muted)] mt-3 mb-1.5 first:mt-0">{children}</h3>;
}

function SlicerSelect({
  label, value, onChange, children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const on = value !== "";
  return (
    <label className={`mb-1.5 flex items-center justify-between gap-2 rounded-[12px] px-2.5 py-1.5 text-[12px] ${on ? "bg-[var(--ts-ink)] text-white" : "bg-[var(--ts-gray-10)] text-[var(--ts-ink)]"}`}>
      <span className="shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`min-w-0 max-w-[120px] bg-transparent text-[12px] outline-none ${on ? "text-white" : "text-[var(--ts-ink)]"}`}
      >
        {children}
      </select>
    </label>
  );
}

function Periodo({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] ${on ? "bg-[var(--ts-ink)] text-white" : "bg-[var(--ts-gray-10)] text-[var(--ts-ink)]"}`}
    >
      {label}
    </button>
  );
}
