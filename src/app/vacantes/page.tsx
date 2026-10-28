"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLanguage } from "@/i18n/context";
import { countLabel } from "@/i18n/translations";
import { fetchOpenJobs, deriveModes, type Job } from "@/lib/vacancies-adapter";
import { AREA_KEYS, areaOf, countByArea, isAreaKey, type AreaKey } from "@/lib/careers-areas";
import { Search, MapPin, Briefcase, ArrowRight, X } from "lucide-react";

function VacantesContent() {
  const params = useSearchParams();
  const { t } = useLanguage();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get("q") || "");
  const initialArea = params.get("area");
  const [area, setArea] = useState<AreaKey | "all">(isAreaKey(initialArea) ? initialArea : "all");
  const [mode, setMode] = useState(params.get("mode") || "all");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    fetchOpenJobs()
      .then((list) => active && setJobs(list))
      .catch(() => active && setLoadError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [attempt]);

  // Keep ?area / ?q shareable without a navigation.
  useEffect(() => {
    const u = new URL(window.location.href);
    area === "all" ? u.searchParams.delete("area") : u.searchParams.set("area", area);
    search.trim() ? u.searchParams.set("q", search.trim()) : u.searchParams.delete("q");
    mode === "all" ? u.searchParams.delete("mode") : u.searchParams.set("mode", mode);
    window.history.replaceState(null, "", u.toString());
  }, [area, search, mode]);

  const counts = useMemo(() => countByArea(jobs), [jobs]);
  const modes = useMemo(() => (jobs.length ? deriveModes(jobs) : []), [jobs]);
  const deptName = (d: string) => t.deptNames[d] || t.areas.items[areaOf(d)].title;
  const modeName = (m: string) => t.modeNames[m] || m;

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (area !== "all" && areaOf(j.dept) !== area) return false;
      if (mode !== "all" && j.mode !== mode) return false;
      if (s) {
        const hay = `${j.title.en} ${j.dept} ${deptName(j.dept)} ${j.location} ${j.tags.join(" ")} ${j.description.en}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, search, area, mode]);

  const hasFilters = area !== "all" || mode !== "all" || search.trim() !== "";
  const reset = () => {
    setSearch("");
    setArea("all");
    setMode("all");
  };

  const areaTitle = area !== "all" ? t.areas.items[area].title : "";

  return (
    <>
      <Navbar />
      <main className="bg-ts-canvas min-h-[70vh]">
        {/* Header + search */}
        <section className="px-4 sm:px-6 lg:px-10 pt-10 md:pt-16 pb-8">
          <div className="max-w-ts mx-auto">
            <p className="ts-kicker mb-4">{t.jobs.eyebrow}</p>
            <h1 className="section-title mb-4 max-w-3xl">{t.jobs.pageTitle}</h1>
            <p className="text-lg text-ts-secondary max-w-2xl leading-relaxed">{t.jobs.pageSubtitle}</p>

            <div className="mt-8 bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] p-4 md:p-5">
              <label htmlFor="jobs-search" className="sr-only">{t.jobs.searchLabel}</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ts-muted" size={18} aria-hidden />
                <input
                  id="jobs-search"
                  type="search"
                  placeholder={t.jobs.searchPlaceholder}
                  className="input-field pl-11 pr-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ts-muted hover:text-ts-ink"
                    aria-label={t.jobs.clear}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="mt-4 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.jobs.teamLabel}>
                  <span className="text-sm text-ts-muted mr-1">{t.jobs.teamLabel}</span>
                  <button className={`filter-chip ${area === "all" ? "active" : ""}`} aria-pressed={area === "all"} onClick={() => setArea("all")}>
                    {t.jobs.all}
                    {!loading && <span className="chip-count">{jobs.length}</span>}
                  </button>
                  {AREA_KEYS.map((k) => (
                    <button key={k} className={`filter-chip ${area === k ? "active" : ""}`} aria-pressed={area === k} onClick={() => setArea(k)}>
                      {t.areas.items[k].title}
                      {!loading && <span className="chip-count">{counts[k]}</span>}
                    </button>
                  ))}
                </div>
                {modes.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.jobs.modeLabel}>
                    <span className="text-sm text-ts-muted mr-1">{t.jobs.modeLabel}</span>
                    <button className={`filter-chip ${mode === "all" ? "active" : ""}`} aria-pressed={mode === "all"} onClick={() => setMode("all")}>
                      {t.jobs.all}
                    </button>
                    {modes.map((m) => (
                      <button key={m} className={`filter-chip ${mode === m ? "active" : ""}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
                        {modeName(m)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Results */}
        <section className="px-4 sm:px-6 lg:px-10 pb-20 md:pb-28">
          <div className="max-w-ts mx-auto">
            {loading ? (
              <div className="grid md:grid-cols-2 gap-5" aria-busy="true" aria-label={t.jobs.loading}>
                {[0, 1].map((i) => (
                  <div key={i} className="h-[220px] rounded-ts-lg bg-ts-surface border border-[color:var(--ts-line)] animate-pulse" />
                ))}
              </div>
            ) : loadError ? (
              <EmptyState title={t.jobs.loadError} body="" action={<button onClick={() => setAttempt((n) => n + 1)} className="pill-btn pill-btn-primary">{t.jobs.retry}</button>} />
            ) : jobs.length === 0 ? (
              <EmptyState title={t.empty.allTitle} body={t.empty.allBody} />
            ) : filtered.length === 0 ? (
              area !== "all" && counts[area] === 0 && !search.trim() && mode === "all" ? (
                <EmptyState
                  title={t.empty.areaTitle.replace("{Area}", areaTitle)}
                  body={t.empty.areaBody}
                  action={
                    <button onClick={reset} className="pill-btn pill-btn-primary">
                      {t.empty.areaCta}
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  title={t.jobs.noMatchTitle}
                  body={t.jobs.noMatchBody}
                  action={
                    <button onClick={reset} className="pill-btn pill-btn-outline">
                      {t.jobs.clear}
                    </button>
                  }
                />
              )
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <p className="text-sm text-ts-muted" aria-live="polite">
                    {countLabel(filtered.length, { one: t.jobs.resultsOne, many: t.jobs.resultsMany, zero: t.counts.zero })}
                  </p>
                  {hasFilters && (
                    <button onClick={reset} className="text-sm font-medium text-ts-accent hover:underline">
                      {t.jobs.clear}
                    </button>
                  )}
                </div>
                <ul className="grid md:grid-cols-2 gap-5">
                  {filtered.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={`/vacantes/${job.id}`}
                        className="group h-full flex flex-col bg-ts-surface rounded-ts-lg p-7 border border-[color:var(--ts-line)] hover:border-ts-accent transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <p className="text-sm text-ts-muted mb-1.5">
                              {t.areas.items[areaOf(job.dept)].title} · {deptName(job.dept)}
                            </p>
                            <h2 className="text-xl font-light tracking-ts-tight text-ts-ink">{job.title.en}</h2>
                          </div>
                          {job.level && <span className="tag shrink-0">{job.level}</span>}
                        </div>
                        {job.description.en && (
                          <p className="text-[15px] text-ts-secondary leading-relaxed mb-5 line-clamp-3">{job.description.en}</p>
                        )}
                        <div className="mt-auto pt-4 border-t border-[color:var(--ts-line)] flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ts-muted">
                            {job.location && (
                              <span className="inline-flex items-center gap-1.5"><MapPin size={14} aria-hidden />{job.location}</span>
                            )}
                            <span className="inline-flex items-center gap-1.5"><Briefcase size={14} aria-hidden />{modeName(job.mode)}</span>
                          </div>
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ts-accent">
                            {t.jobs.cardCta}
                            <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] px-6 py-16 md:py-20 text-center">
      <div className="w-12 h-12 mx-auto mb-6 rounded-full bg-[var(--ts-blue-bg)] text-ts-accent flex items-center justify-center">
        <Briefcase size={20} aria-hidden />
      </div>
      <h2 className="text-2xl font-light tracking-ts-tight mb-3">{title}</h2>
      <p className="text-ts-secondary max-w-md mx-auto leading-relaxed">{body}</p>
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

export default function VacantesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ts-canvas" />}>
      <VacantesContent />
    </Suspense>
  );
}
