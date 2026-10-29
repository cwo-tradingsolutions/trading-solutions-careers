"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardPayload, DrillRow, SlaBar } from "@/lib/funnel-dashboard/metrics";
import { MUESTRA, SIN_CODIGO, SIN_HITO } from "@/lib/funnel-dashboard/metrics";

const INK = "#081420";
const MUTED = "#8b939c";
const GREEN = "#1a7d3e";
const AMBER = "#b45309";
const RED = "#c41818";

type DrillPayload = {
  example?: boolean;
  vacancy: { title: string } | null;
  rows: DrillRow[];
};

function num(n: number, digits = 1): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(n);
}

function fmtDays(n: number | null): string {
  if (n == null) return "—";
  return `${num(n)} d`;
}

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${num(n)} %`;
}

function fmtDelta(d: number | null, unit: "days" | "pct" | "count"): string {
  if (d == null) return "sin periodo anterior";
  const sign = d > 0 ? "+" : "";
  const suffix = unit === "days" ? " d" : unit === "pct" ? " pp" : "";
  return `${sign}${num(d)}${suffix}`;
}

export default function FunnelDashboard({
  onOpenCandidate,
}: {
  onOpenCandidate?: (id: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [example, setExample] = useState(false);
  const [filters, setFilters] = useState({
    vacancy: "",
    area: "",
    country: "",
    recruiter: "",
    source: "",
    stage: "",
    from: "",
    to: "",
  });
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openVac, setOpenVac] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillPayload | null>(null);
  const [drillError, setDrillError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setExample(q.get("example") === "1");
    setReady(true);
  }, []);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (example) sp.set("example", "1");
    for (const [k, v] of Object.entries(filters)) {
      if (v) sp.set(k, v);
    }
    return sp.toString();
  }, [example, filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/headhunting/funnel-dashboard?${query}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  async function openDrill(id: string) {
    if (openVac === id) {
      setOpenVac(null);
      setDrill(null);
      return;
    }
    setOpenVac(id);
    setDrill(null);
    setDrillError(null);
    const sp = new URLSearchParams(query);
    sp.set("vacancy", id);
    try {
      const r = await fetch(`/api/headhunting/funnel-dashboard/drill?${sp}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setDrill(j);
    } catch (e) {
      setDrillError(e instanceof Error ? e.message : "No se pudo abrir");
    }
  }

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setOpenVac(null);
    setDrill(null);
  }

  const maxReached = Math.max(1, ...(data?.funnel.map((g) => g.reached) ?? [1]));
  const maxSla = Math.max(1, ...(data?.slaBars.map((g) => g.avgDays ?? g.sla ?? 0) ?? [1]));

  return (
    <div className="pb-8">
      <p className="text-[13px] text-[var(--ts-muted)] max-w-[720px] mb-4">
        Cohorte de aplicación para conversión y canal. TTH por fecha de contratación. Offer por fecha de oferta.
        TTF usa <span className="text-[var(--ts-ink)]">hire_date</span>.
        El filtro de etapa no mueve el embudo: solo el SLA, la tabla y el drill.
      </p>

      {data?.example && (
        <div className="mb-4 rounded-2xl border border-[color:var(--ts-line)] bg-white px-4 py-3 text-[13px]">
          <b>Datos de ejemplo.</b> No son cifras del ATS. Sirven para revisar la forma del tablero.
        </div>
      )}

      <section className="bg-white rounded-2xl border border-[color:var(--ts-line)] p-3 mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Select label="Vacante" value={filters.vacancy} onChange={(v) => setFilter("vacancy", v)}>
            <option value="">Todas</option>
            {data?.options.vacancies.map((v) => (
              <option key={v.id} value={v.id}>{v.title}</option>
            ))}
          </Select>
          <Select label="Área" value={filters.area} onChange={(v) => setFilter("area", v)}>
            <option value="">Todas</option>
            {data?.options.areas.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select label="País" value={filters.country} onChange={(v) => setFilter("country", v)}>
            <option value="">Todos</option>
            {data?.options.countries.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select label="Recruiter" value={filters.recruiter} onChange={(v) => setFilter("recruiter", v)}>
            <option value="">Todos</option>
            {data?.options.recruiters.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </Select>
          <Select label="Canal" value={filters.source} onChange={(v) => setFilter("source", v)}>
            <option value="">Todos</option>
            {data?.options.sources.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select label="Etapa" value={filters.stage} onChange={(v) => setFilter("stage", v)}>
            <option value="">Todas</option>
            {data?.options.stages.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </Select>
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--ts-muted)]">
            Desde
            <input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} className={chipCls} />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--ts-muted)]">
            Hasta
            <input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} className={chipCls} />
          </label>
          <button
            type="button"
            onClick={() => {
              setFilters({ vacancy: "", area: "", country: "", recruiter: "", source: "", stage: "", from: "", to: "" });
              setOpenVac(null);
              setDrill(null);
            }}
            className="rounded-full bg-[var(--ts-ink)] text-white text-[13px] font-medium px-4 py-1.5"
          >
            Limpiar
          </button>
        </div>
      </section>

      {loading && !data && <p className="text-[13px] text-[var(--ts-muted)]">Cargando dashboard…</p>}
      {error && (
        <div className="mb-4 rounded-2xl border border-[color:var(--ts-red-border)] bg-[var(--ts-red-bg)] px-4 py-3 text-[13px] flex justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={load} className="underline font-medium">Reintentar</button>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-3">
            <Kpi label="Time to fill" hint="mediana · hire_date − hr_request_date" value={data.kpis.ttf.insufficient ? MUESTRA : fmtDays(data.kpis.ttf.value)} n={data.kpis.ttf.n} delta={fmtDelta(data.kpis.ttf.delta, "days")} />
            <Kpi label="Time to hire" hint="mediana · contratado − created_at" value={data.kpis.tth.insufficient ? MUESTRA : fmtDays(data.kpis.tth.value)} n={data.kpis.tth.n} delta={fmtDelta(data.kpis.tth.delta, "days")} />
            <Kpi label="% fuera de SLA" hint={`${data.kpis.sla.over} de ${data.kpis.sla.n} evaluables · ${data.kpis.sla.approx} aprox. fuera`} value={data.kpis.sla.insufficient ? MUESTRA : fmtPct(data.kpis.sla.value)} n={data.kpis.sla.n} delta={fmtDelta(data.kpis.sla.delta, "pct")} />
            <Kpi label="Offer accept" hint={`${data.kpis.offer.accepted} contratados / ${data.kpis.offer.resolved} resueltos · ${data.kpis.offer.pending} pendientes`} value={data.kpis.offer.insufficient ? MUESTRA : fmtPct(data.kpis.offer.value)} n={data.kpis.offer.n} delta={fmtDelta(data.kpis.offer.delta, "pct")} />
            <Kpi
              label="Vacantes abiertas"
              hint={data.kpis.open.agingInsufficient
                ? `aging ${MUESTRA} (n=${data.kpis.open.agingN}) · ${data.kpis.open.sinHito} ${SIN_HITO}`
                : `aging mediana ${fmtDays(data.kpis.open.agingMedian)} · target ${data.kpis.open.target ?? "sin target"} d · ${data.kpis.open.sinHito} ${SIN_HITO}`}
              value={String(data.kpis.open.value ?? 0)}
              n={data.kpis.open.n}
              delta={fmtDelta(data.kpis.open.delta, "count")}
            />
            <Kpi label="Aplicó → contratado" hint={`${data.kpis.conversion.num} / ${data.kpis.conversion.den}`} value={data.kpis.conversion.insufficient ? MUESTRA : fmtPct(data.kpis.conversion.value)} n={data.kpis.conversion.n} delta={fmtDelta(data.kpis.conversion.delta, "pct")} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <Placeholder title="Calidad hire @90d" note={data.kpis.quality90.note} />
            <Placeholder title="Costo por vacante" note={data.kpis.cost.note} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-3 mb-4">
            <section className="xl:col-span-3 bg-white rounded-2xl border border-[color:var(--ts-line)] p-4">
              <h2 className="text-[15px] font-medium mb-1">Funnel por gate</h2>
              <p className="text-[12px] text-[var(--ts-muted)] mb-3">Alcanzó el gate o uno posterior. 6 y 8 no entran a la conversión.</p>
              <ul className="space-y-1.5">
                {data.funnel.map((g) => (
                  <li key={g.gateId} className={g.empty && g.n >= 9 && g.n <= 11 ? "opacity-60" : ""}>
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="w-6 tabular-nums text-[var(--ts-muted)]">{g.n}</span>
                      <span className="w-[132px] shrink-0">{g.label}</span>
                      <span className="flex-1 h-2.5 rounded-full bg-[var(--ts-canvas)] overflow-hidden">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(g.reached > 0 ? 4 : 0, (g.reached / maxReached) * 100)}%`,
                            background: g.sinCodigo ? MUTED : INK,
                          }}
                        />
                      </span>
                      <span className="w-16 text-right tabular-nums">n={g.reached}</span>
                    </div>
                    {g.sinCodigo && <div className="pl-8 text-[11px] text-[var(--ts-muted)]">{SIN_CODIGO}</div>}
                    {g.conversionToNext && (
                      <div className="pl-8 text-[11px] text-[var(--ts-muted)]">
                        → {g.conversionToNext.toLabel}:{" "}
                        {g.conversionToNext.insufficient
                          ? `${MUESTRA} (n=${g.conversionToNext.den})`
                          : `${fmtPct(g.conversionToNext.rate)} · ${g.conversionToNext.num}/${g.conversionToNext.den}`}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="xl:col-span-2 bg-white rounded-2xl border border-[color:var(--ts-line)] p-4">
              <h2 className="text-[15px] font-medium mb-1">Tiempo en etapa vs SLA</h2>
              <p className="text-[12px] text-[var(--ts-muted)] mb-3">Por código. Prefiltro y Médicos no suman sus SLA.</p>
              <ul className="space-y-2">
                {data.slaBars.map((g) => (
                  <SlaRow key={g.gateId} g={g} max={maxSla} />
                ))}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-4">
            <section className="bg-white rounded-2xl border border-[color:var(--ts-line)] p-4">
              <h2 className="text-[15px] font-medium mb-1">TTF y TTH por mes</h2>
              <p className="text-[12px] text-[var(--ts-muted)] mb-2">Un punto solo entra si ese mes tiene n≥5.</p>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.monthly}>
                    <CartesianGrid stroke="rgba(8,20,32,0.08)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 11 }} />
                    <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="ttf" name="TTF (d)" stroke={INK} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                    <Line type="monotone" dataKey="tth" name="TTH (d)" stroke={GREEN} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 text-[11px] text-[var(--ts-muted)] flex flex-wrap gap-x-3">
                {data.monthly.map((m) => (
                  <li key={m.month}>n TTF {m.ttfN} · n TTH {m.tthN} · {m.month}</li>
                ))}
                {data.monthly.length === 0 && <li>Sin meses en el periodo.</li>}
              </ul>
            </section>

            <section className="bg-white rounded-2xl border border-[color:var(--ts-line)] p-4">
              <h2 className="text-[15px] font-medium mb-1">Canal</h2>
              <p className="text-[12px] text-[var(--ts-muted)] mb-2">Sin canal es una categoría. % solo con n≥5.</p>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.channels}>
                    <CartesianGrid stroke="rgba(8,20,32,0.08)" vertical={false} />
                    <XAxis dataKey="source" tick={{ fill: MUTED, fontSize: 11 }} interval={0} />
                    <YAxis tick={{ fill: MUTED, fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="notTerna" name="No llegó a terna" stackId="c" fill="#d5d8dc" />
                    <Bar dataKey="ternaNotHired" name="Terna" stackId="c" fill={MUTED} />
                    <Bar dataKey="hired" name="Contratado" stackId="c" fill={GREEN} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="w-full text-[12px] mt-2">
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
          </div>

          <section className="bg-white rounded-2xl border border-[color:var(--ts-line)] overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-[color:var(--ts-line)]">
              <h2 className="text-[15px] font-medium">Vacantes</h2>
              <p className="text-[12px] text-[var(--ts-muted)]">Aging contra el target de configuración. Clic para ver estancados.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] text-[var(--ts-muted)]">
                    <th className="px-4 py-2 font-medium">Vacante</th>
                    <th className="px-2 py-2 font-medium">País</th>
                    <th className="px-2 py-2 font-medium">Dueño</th>
                    <th className="px-2 py-2 font-medium">Aging</th>
                    <th className="px-2 py-2 font-medium">Cuello</th>
                    <th className="px-4 py-2 font-medium text-right">Candidatos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vacancies.map((v) => (
                    <Fragment key={v.id}>
                      <tr
                        onClick={() => openDrill(v.id)}
                        className="border-t border-[color:var(--ts-line)] cursor-pointer hover:bg-[var(--ts-canvas)]"
                      >
                        <td className="px-4 py-2">
                          <div className="font-medium">{v.title}</div>
                          <div className="text-[11px] text-[var(--ts-muted)]">{v.area}{v.open ? "" : " · cerrada"}</div>
                        </td>
                        <td className="px-2 py-2">{v.country}</td>
                        <td className="px-2 py-2">{v.owner}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <Dot tone={v.semaforo} />
                            <span className="tabular-nums">{v.agingLabel}</span>
                          </div>
                          {v.agingDays != null && v.target != null && (
                            <div className="mt-1 h-1.5 w-24 rounded-full bg-[var(--ts-canvas)] overflow-hidden">
                              <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (v.agingDays / (v.target * 2)) * 100)}%`, background: toneColor(v.semaforo) }} />
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">{v.bottleneck ?? "—"}{v.overSla > 0 ? ` · ${v.overSla} fuera` : ""}</td>
                        <td className="px-4 py-2 text-right tabular-nums">n={v.candidates}</td>
                      </tr>
                      {openVac === v.id && (
                        <tr className="bg-[var(--ts-canvas)]">
                          <td colSpan={6} className="px-4 py-3">
                            {drillError && <p className="text-[12px]">{drillError}</p>}
                            {!drill && !drillError && <p className="text-[12px] text-[var(--ts-muted)]">Cargando estancados…</p>}
                            {drill && drill.rows.length === 0 && <p className="text-[12px]">Nadie fuera de SLA en esta vacante con el filtro actual.</p>}
                            {drill && drill.rows.length > 0 && (
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
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--ts-line)] bg-white px-4 py-3 text-[13px]">
            <h2 className="font-medium mb-1">Calidad de datos</h2>
            <p>
              Sin canal: {data.quality.withoutSource}/{data.quality.candidates}
              {data.quality.withoutSourcePct == null ? ` · ${MUESTRA}` : ` · ${fmtPct(data.quality.withoutSourcePct)}`}
              {" · "}
              Sin historial de etapa: {data.quality.withoutHistory}/{data.quality.candidates}
              {data.quality.withoutHistoryPct == null ? ` · ${MUESTRA}` : ` · ${fmtPct(data.quality.withoutHistoryPct)}`}
              {" · "}
              Vacantes sin milestones: {data.quality.withoutMilestones} de {data.quality.vacancies}
            </p>
            <ul className="mt-2 text-[12px] text-[var(--ts-muted)] list-disc pl-4">
              {data.gaps.map((g) => <li key={g}>{g}</li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

const chipCls = "rounded-full border border-[color:var(--ts-line)] bg-white px-3 py-1 text-[13px] text-[var(--ts-ink)]";

function Select({
  label, value, onChange, children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-[var(--ts-muted)]">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={chipCls}>
        {children}
      </select>
    </label>
  );
}

function Kpi({ label, hint, value, n, delta }: { label: string; hint: string; value: string; n: number; delta: string }) {
  return (
    <article className="bg-white rounded-2xl border border-[color:var(--ts-line)] p-3 min-h-[128px]">
      <div className="text-[12px] text-[var(--ts-muted)]">{label}</div>
      <div className={`mt-1 text-[22px] font-light tracking-tight leading-tight ${value === MUESTRA ? "text-[15px] font-medium" : ""}`}>{value}</div>
      <div className="mt-2 text-[11px] text-[var(--ts-muted)]">n={n} · {delta}</div>
      <div className="mt-1 text-[11px] text-[var(--ts-muted)] leading-snug">{hint}</div>
    </article>
  );
}

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <article className="rounded-2xl border border-dashed border-[color:var(--ts-line)] bg-white/70 p-4 text-[var(--ts-muted)]">
      <div className="text-[12px]">{title}</div>
      <div className="text-[22px] font-light text-[var(--ts-ink)] mt-1">Próximamente</div>
      <p className="text-[12px] mt-1">{note}</p>
    </article>
  );
}

function SlaRow({ g, max }: { g: SlaBar; max: number }) {
  const days = g.avgDays ?? 0;
  return (
    <li className={g.sinCodigo || (g.n >= 9 && g.n <= 11 && g.evaluable === 0) ? "opacity-70" : ""}>
      <div className="flex justify-between text-[12px] gap-2">
        <span>{g.n}. {g.label}{g.sinCodigo ? ` · ${SIN_CODIGO}` : ""}</span>
        <span className="tabular-nums text-[var(--ts-muted)]">
          {g.insufficient ? `${MUESTRA} (n=${g.evaluable})` : `${fmtDays(g.avgDays)} · máx ${fmtDays(g.maxDays)} · ${g.over} fuera`}
        </span>
      </div>
      <div className="relative h-2 mt-1 rounded-full bg-[var(--ts-canvas)]">
        {!g.insufficient && g.avgDays != null && (
          <span className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${(days / max) * 100}%`, background: toneColor(g.status ?? "ok") }} />
        )}
        {g.sla != null && (
          <span className="absolute top-[-2px] w-px h-3 bg-[var(--ts-ink)]" style={{ left: `${Math.min(100, (g.sla / max) * 100)}%` }} title={`SLA ${g.sla} d`} />
        )}
      </div>
      {g.codes.length > 1 && (
        <div className="text-[11px] text-[var(--ts-muted)] mt-0.5">
          SLA por código: {g.codes.map((c) => `${c.label} ${c.sla}d`).join(" · ")}. No se suman.
        </div>
      )}
    </li>
  );
}

function Dot({ tone }: { tone: string }) {
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: toneColor(tone) }} />;
}

function toneColor(tone: string | null): string {
  if (tone === "critical") return RED;
  if (tone === "serious") return AMBER;
  if (tone === "warning") return AMBER;
  if (tone === "ok") return GREEN;
  if (tone === "sin_hito" || tone === "sin_target") return MUTED;
  return MUTED;
}
