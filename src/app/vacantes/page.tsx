"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PublicPage from "@/components/PublicPage";
import { useLanguage } from "@/i18n/context";
import { fill } from "@/i18n/translations";
import { fetchOpenJobs, deriveModes, type Job } from "@/lib/vacancies-adapter";
import { AREAS, areaOf, isAreaKey, type AreaKey } from "@/lib/areas";
import { Search, MapPin, Briefcase, ArrowUpRight } from "lucide-react";

function VacantesContent() {
  const searchParams = useSearchParams();
  // ?area=operations|corporate|commercial (home). ?dept=Operaciones sigue
  // funcionando para enlaces viejos (newsletter, LinkedIn).
  const areaParam = searchParams.get("area");
  const deptParam = searchParams.get("dept");
  const initialArea: AreaKey | "all" = isAreaKey(areaParam) ? areaParam : deptParam ? areaOf(deptParam) : "all";
  const { t, locale } = useLanguage();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [areaFilter, setAreaFilter] = useState<AreaKey | "all">(initialArea);
  const [modeFilter, setModeFilter] = useState("all");

  useEffect(() => {
    let active = true;
    fetchOpenJobs()
      .then((list) => {
        if (active) setJobs(list);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const modes = useMemo(() => deriveModes(jobs), [jobs]);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (areaFilter !== "all" && areaOf(j.dept) !== areaFilter) return false;
      if (modeFilter !== "all" && j.mode !== modeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const searchable = `${j.title[locale]} ${j.dept} ${j.location} ${j.tags.join(" ")} ${j.description[locale]}`.toLowerCase();
        if (!searchable.includes(s)) return false;
      }
      return true;
    });
  }, [jobs, search, areaFilter, modeFilter, locale]);

  const resetFilters = () => {
    setSearch("");
    setAreaFilter("all");
    setModeFilter("all");
  };

  const deptName = (d: string) => (t.deptNames as Record<string, string>)[d] || d;
  const modeName = (m: string) => (t.modeNames as Record<string, string>)[m] || m;
  // Solo el filtro de equipo explica el vacío: mostrar el estado de área.
  const soloArea = areaFilter !== "all" && !search && modeFilter === "all";

  return (
    <PublicPage>
      <section className="py-12 md:py-20">
        <div className="max-w-ts mx-auto px-5 md:px-6 lg:px-10">
          {/* Header */}
          <div className="max-w-2xl mb-10">
            <p className="ts-kicker mb-4">{t.jobs.pageEyebrow}</p>
            <h1 className="section-title mb-4">{t.jobs.pageTitle}</h1>
            <p className="text-lg text-ts-muted leading-relaxed">{t.jobs.pageSubtitle}</p>
          </div>

          {/* Search + filters */}
          <div className="bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] p-4 md:p-5 mb-8">
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ts-muted" size={18} aria-hidden />
              <input
                type="search"
                aria-label={t.jobs.searchLabel}
                placeholder={t.jobs.searchPlaceholder}
                className="input-field pl-11"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.jobs.areaLabel}>
                <span className="text-xs font-medium text-ts-muted mr-1 w-full sm:w-auto">{t.jobs.areaLabel}</span>
                <button
                  className={`filter-chip ${areaFilter === "all" ? "active" : ""}`}
                  aria-pressed={areaFilter === "all"}
                  onClick={() => setAreaFilter("all")}
                >
                  {t.jobs.all}
                </button>
                {AREAS.map((a) => (
                  <button
                    key={a}
                    className={`filter-chip ${areaFilter === a ? "active" : ""}`}
                    aria-pressed={areaFilter === a}
                    onClick={() => setAreaFilter(a)}
                  >
                    {t.areas[a].title}
                  </button>
                ))}
              </div>
              {modes.length > 1 && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.jobs.modeLabel}>
                  <span className="text-xs font-medium text-ts-muted mr-1 w-full sm:w-auto">{t.jobs.modeLabel}</span>
                  <button
                    className={`filter-chip ${modeFilter === "all" ? "active" : ""}`}
                    aria-pressed={modeFilter === "all"}
                    onClick={() => setModeFilter("all")}
                  >
                    {t.jobs.all}
                  </button>
                  {modes.map((m) => (
                    <button
                      key={m}
                      className={`filter-chip ${modeFilter === m ? "active" : ""}`}
                      aria-pressed={modeFilter === m}
                      onClick={() => setModeFilter(m)}
                    >
                      {modeName(m)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid md:grid-cols-2 gap-5" aria-busy="true" aria-label={t.jobs.loading}>
              {[0, 1].map((i) => (
                <div key={i} className="bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] p-7 h-[248px] animate-pulse">
                  <div className="h-5 w-2/3 bg-ts-canvas rounded mb-3" />
                  <div className="h-4 w-1/3 bg-ts-canvas rounded mb-8" />
                  <div className="h-3 w-full bg-ts-canvas rounded mb-2" />
                  <div className="h-3 w-5/6 bg-ts-canvas rounded" />
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState title={t.jobs.allEmptyTitle} body={t.jobs.allEmptyBody} />
          ) : (
            <>
              <p className="text-sm text-ts-muted mb-5" aria-live="polite">
                {filtered.length === 1 ? t.jobs.resultsOne : fill(t.jobs.resultsMany, { n: filtered.length })}
              </p>

              {filtered.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-5">
                  {filtered.map((job) => (
                    <Link
                      key={job.id}
                      href={`/vacantes/${job.id}`}
                      className="group bg-ts-surface rounded-ts-lg p-7 border border-[color:var(--ts-line)] hover:border-ts-accent transition-colors flex flex-col"
                    >
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <p className="text-xs font-medium text-ts-muted mb-2">
                            {t.areas[areaOf(job.dept)].title}
                            {deptName(job.dept) !== t.areas[areaOf(job.dept)].title && ` · ${deptName(job.dept)}`}
                          </p>
                          <h2 className="text-xl font-normal tracking-ts-tight">{job.title[locale]}</h2>
                        </div>
                        {job.level && <span className="tag shrink-0">{job.level}</span>}
                      </div>
                      <p className="text-sm text-ts-muted mb-5 leading-relaxed line-clamp-3">{job.description[locale]}</p>
                      {job.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-5">
                          {job.tags.slice(0, 5).map((tag) => (
                            <span key={tag} className="tag">{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="mt-auto flex items-center justify-between pt-4 border-t border-[color:var(--ts-line)]">
                        <div className="flex flex-wrap items-center gap-4">
                          {job.location && (
                            <span className="flex items-center gap-1.5 text-xs text-ts-muted">
                              <MapPin size={13} aria-hidden />
                              {job.location}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 text-xs text-ts-muted">
                            <Briefcase size={13} aria-hidden />
                            {modeName(job.mode)}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-ts-accent flex items-center gap-1 shrink-0">
                          {t.jobs.cardCta}
                          <ArrowUpRight size={14} strokeWidth={2.5} />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : soloArea ? (
                <EmptyState
                  title={fill(t.jobs.areaEmptyTitle, { Area: t.areas[areaFilter as AreaKey].title })}
                  body={t.jobs.areaEmptyBody}
                  cta={t.jobs.areaEmptyCta}
                  onCta={resetFilters}
                />
              ) : (
                <EmptyState title={t.jobs.noResults} cta={t.jobs.clearFilters} onCta={resetFilters} />
              )}
            </>
          )}
        </div>
      </section>
    </PublicPage>
  );
}

function EmptyState({ title, body, cta, onCta }: { title: string; body?: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] px-6 py-16 md:py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-ts-canvas flex items-center justify-center mx-auto mb-6">
        <Briefcase size={20} className="text-ts-muted" aria-hidden />
      </div>
      <h2 className="text-2xl font-light tracking-ts-tight mb-3">{title}</h2>
      {body && <p className="text-ts-muted max-w-md mx-auto leading-relaxed">{body}</p>}
      {cta && onCta && (
        <button onClick={onCta} className="pill-btn pill-btn-outline text-sm mt-8">
          {cta}
        </button>
      )}
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
