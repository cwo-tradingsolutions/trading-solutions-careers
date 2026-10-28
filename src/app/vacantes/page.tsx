"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PublicPage from "@/components/PublicPage";
import { useLanguage } from "@/i18n/context";
import { fill } from "@/i18n/translations";
import { fetchOpenJobs, deriveModes, type Job } from "@/lib/vacancies-adapter";
import { AREAS, areaOf, isAreaKey, type AreaKey } from "@/lib/areas";
import { Search, MapPin, Briefcase, ArrowRight } from "lucide-react";

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
      <Link className="back" href="/">‹ {t.shell.home}</Link>

      <div className="sec-head">
        <div className="left">
          <div className="eyebrow">{t.shell.roles}</div>
          <h1 className="page-title">{t.jobs.pageTitle}</h1>
          <p className="sub">
            {t.jobs.pageSubtitle} <Link href="/#unete">{t.pool.cta} →</Link>
          </p>
        </div>
      </div>

      <div className="jobs-toolbar">
        <div className="search-jobs">
          <Search aria-hidden />
          <input
            type="search"
            aria-label={t.jobs.searchLabel}
            placeholder={t.jobs.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="filters">
          <div className="group" role="group" aria-label={t.jobs.areaLabel}>
            <span className="lab">{t.jobs.areaLabel}</span>
            <button type="button" className={areaFilter === "all" ? "is-on" : ""} aria-pressed={areaFilter === "all"} onClick={() => setAreaFilter("all")}>
              {t.jobs.all}
            </button>
            {AREAS.map((a) => (
              <button key={a} type="button" className={areaFilter === a ? "is-on" : ""} aria-pressed={areaFilter === a} onClick={() => setAreaFilter(a)}>
                {t.areas[a].title}
              </button>
            ))}
          </div>
          {modes.length > 1 && (
            <div className="group" role="group" aria-label={t.jobs.modeLabel}>
              <span className="lab">{t.jobs.modeLabel}</span>
              <button type="button" className={modeFilter === "all" ? "is-on" : ""} aria-pressed={modeFilter === "all"} onClick={() => setModeFilter("all")}>
                {t.jobs.all}
              </button>
              {modes.map((m) => (
                <button key={m} type="button" className={modeFilter === m ? "is-on" : ""} aria-pressed={modeFilter === m} onClick={() => setModeFilter(m)}>
                  {modeName(m)}
                </button>
              ))}
            </div>
          )}
        </div>
        {!loading && (
          <div className="jobs-count" aria-live="polite">
            {filtered.length === 1 ? t.jobs.resultsOne : fill(t.jobs.resultsMany, { n: filtered.length })}
          </div>
        )}
      </div>

      <div className="jobs-grid">
        {loading ? (
          <>
            <div className="skeleton" aria-busy="true" aria-label={t.jobs.loading} />
            <div className="skeleton" />
          </>
        ) : jobs.length === 0 ? (
          <EmptyState title={t.jobs.allEmptyTitle} body={t.jobs.allEmptyBody} />
        ) : filtered.length > 0 ? (
          filtered.map((job) => (
            <Link key={job.id} href={`/vacantes/${job.id}`} className="job">
              <div className="top">
                <span className="cat">
                  {t.areas[areaOf(job.dept)].title}
                  {deptName(job.dept) !== t.areas[areaOf(job.dept)].title && ` · ${deptName(job.dept)}`}
                </span>
                {job.level && <span className="lvl">{job.level}</span>}
              </div>
              <h2 style={{ font: "700 17px/1.25 var(--font)", letterSpacing: "-.015em" }}>{job.title[locale]}</h2>
              <p className="desc">{job.description[locale]}</p>
              <div className="foot">
                <div className="meta">
                  {job.location && <span><MapPin size={12} aria-hidden />{job.location}</span>}
                  <span><Briefcase size={12} aria-hidden />{modeName(job.mode)}</span>
                </div>
                <span className="arrow" aria-label={t.jobs.cardCta}>
                  <ArrowRight aria-hidden />
                </span>
              </div>
            </Link>
          ))
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
      </div>
    </PublicPage>
  );
}

/** Estado vacío del preview: siempre deja la salida al talent pool. */
function EmptyState({ title, body, cta, onCta }: { title: string; body?: string; cta?: string; onCta?: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="jobs-empty">
      <h3>{title}</h3>
      <p>
        {body ? `${body} ` : ""}
        <Link className="inline-link" href="/#unete">{t.pool.cta} →</Link>
      </p>
      {cta && onCta && (
        <button type="button" onClick={onCta} className="btn-ghost-text">{cta}</button>
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
