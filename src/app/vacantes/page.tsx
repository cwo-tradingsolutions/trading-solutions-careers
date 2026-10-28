"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PublicPage from "@/components/PublicPage";
import { useLanguage } from "@/i18n/context";
import { fill } from "@/i18n/translations";
import { fetchOpenJobs, deriveModes, type Job } from "@/lib/vacancies-adapter";
import { AREAS, areaOf, isAreaKey, type AreaKey } from "@/lib/areas";
import { Search, MapPin, Briefcase } from "lucide-react";

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

  // El buscador ⌘K del shell navega a /vacantes?q=…; si ya estamos aquí,
  // el parámetro cambia sin remontar la página.
  const qParam = searchParams.get("q");
  useEffect(() => {
    if (qParam !== null) setSearch(qParam);
  }, [qParam]);

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
      <Link className="back" href="/">‹ {t.shell.about}</Link>

      <div className="detail-head">
        <p className="eyebrow">{t.jobs.pageEyebrow}</p>
        <h1>{t.jobs.pageTitle}</h1>
        <p className="sec sub" style={{ marginBottom: 0 }}>{t.jobs.pageSubtitle}</p>
      </div>

      {/* Search + filtros · patrón Events del clon */}
      <div className="jobs-search">
        <Search aria-hidden />
        <input
          type="search"
          aria-label={t.jobs.searchLabel}
          placeholder={t.jobs.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="jobs-filters">
        <div className="filters" role="group" aria-label={t.jobs.areaLabel}>
          <span className="lab">{t.jobs.areaLabel}</span>
          <button className={areaFilter === "all" ? "is-on" : ""} aria-pressed={areaFilter === "all"} onClick={() => setAreaFilter("all")}>
            {t.jobs.all}
          </button>
          {AREAS.map((a) => (
            <button key={a} className={areaFilter === a ? "is-on" : ""} aria-pressed={areaFilter === a} onClick={() => setAreaFilter(a)}>
              {t.areas[a].title}
            </button>
          ))}
        </div>
        {modes.length > 1 && (
          <div className="filters" role="group" aria-label={t.jobs.modeLabel}>
            <span className="lab">{t.jobs.modeLabel}</span>
            <button className={modeFilter === "all" ? "is-on" : ""} aria-pressed={modeFilter === "all"} onClick={() => setModeFilter("all")}>
              {t.jobs.all}
            </button>
            {modes.map((m) => (
              <button key={m} className={modeFilter === m ? "is-on" : ""} aria-pressed={modeFilter === m} onClick={() => setModeFilter(m)}>
                {modeName(m)}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="events-grid" aria-busy="true" aria-label={t.jobs.loading}>
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState title={t.jobs.allEmptyTitle} body={t.jobs.allEmptyBody} />
      ) : (
        <>
          <p className="count" aria-live="polite">
            {filtered.length === 1 ? t.jobs.resultsOne : fill(t.jobs.resultsMany, { n: filtered.length })}
          </p>

          {filtered.length > 0 ? (
            <div className="events-grid">
              {filtered.map((job) => (
                <Link key={job.id} href={`/vacantes/${job.id}`} className="job-card">
                  <div className="area-l">
                    {t.areas[areaOf(job.dept)].title}
                    {deptName(job.dept) !== t.areas[areaOf(job.dept)].title && ` · ${deptName(job.dept)}`}
                  </div>
                  <h2>{job.title[locale]}</h2>
                  <p>{job.description[locale]}</p>
                  <div className="foot">
                    <div className="ev-pills">
                      {job.location && (
                        <span><MapPin size={12} aria-hidden />{job.location}</span>
                      )}
                      <span><Briefcase size={12} aria-hidden />{modeName(job.mode)}</span>
                      {job.level && <span>{job.level}</span>}
                    </div>
                    <span className="go">{t.jobs.cardCta} →</span>
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
    </PublicPage>
  );
}

/** Estado vacío · "soon-state" del clon. */
function EmptyState({ title, body, cta, onCta }: { title: string; body?: string; cta?: string; onCta?: () => void }) {
  const { t } = useLanguage();
  const label = t.nav.roles;
  return (
    <div className="soon-state">
      <div className="badge">{label}</div>
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {cta && onCta && (
        <div className="cta-row">
          <button onClick={onCta} className="btn-ghost">{cta}</button>
        </div>
      )}
    </div>
  );
}

export default function VacantesPage() {
  return (
    <Suspense fallback={<div className="uv" />}>
      <VacantesContent />
    </Suspense>
  );
}
