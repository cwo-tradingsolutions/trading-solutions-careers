"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CommandCenterLayout, { type DashFilterState } from "@/components/dashboard-layouts/CommandCenterLayout";
import type { DashboardPayload, DrillRow } from "@/lib/funnel-dashboard/metrics";

const EMPTY: DashFilterState = {
  vacancy: "",
  area: "",
  country: "",
  recruiter: "",
  source: "",
  stage: "",
  from: "",
  to: "",
};

type DrillPayload = {
  example?: boolean;
  vacancy: { title: string } | null;
  rows: DrillRow[];
};

export default function FunnelDashboard({
  onOpenCandidate,
}: {
  onOpenCandidate?: (id: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [example, setExample] = useState(false);
  const [filters, setFilters] = useState<DashFilterState>(EMPTY);
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

  function setFilter(key: keyof DashFilterState, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setOpenVac(null);
    setDrill(null);
  }

  return (
    <CommandCenterLayout
      data={data}
      loading={loading}
      error={error}
      onRetry={load}
      filters={filters}
      onFilter={setFilter}
      onClear={() => {
        setFilters(EMPTY);
        setOpenVac(null);
        setDrill(null);
      }}
      openVac={openVac}
      drill={drill}
      drillError={drillError}
      onOpenVac={openDrill}
      onOpenCandidate={onOpenCandidate}
    />
  );
}
