"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Frame from "@/components/careers/Frame";
import JobRow from "@/components/careers/JobRow";
import { useOpenJobs } from "@/components/careers/useOpenJobs";
import { CareerPicture, departmentsFrom, deptMatches, jobString, siteLinks } from "@/components/careers/shared";
import { deriveModes } from "@/lib/vacancies-adapter";
import { useLanguage } from "@/i18n/context";

function VacantesContent() {
  const searchParams = useSearchParams();
  const { t, locale } = useLanguage();
  const { jobs, loading } = useOpenJobs();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState(searchParams.get("dept") || "all");
  const [modeFilter, setModeFilter] = useState("all");

  const deptName = (d: string) => (t.deptNames as Record<string, string>)[d] || d;
  const modeName = (m: string) => (t.modeNames as Record<string, string>)[m] || m;
  const departments = useMemo(() => departmentsFrom(jobs), [jobs]);
  const modes = useMemo(() => deriveModes(jobs), [jobs]);

  useEffect(() => {
    const initial = searchParams.get("dept");
    if (!initial) return;
    const match = jobs.find((j) => deptMatches(j.dept, initial, deptName));
    if (match) setDeptFilter(match.dept);
  }, [jobs, searchParams, locale]); // deptName changes with locale

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (!deptMatches(j.dept, deptFilter, deptName)) return false;
      if (modeFilter !== "all" && j.mode !== modeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const searchable = `${jobString(j.title, locale)} ${j.dept} ${deptName(j.dept)} ${j.location} ${j.tags.join(" ")} ${jobString(j.description, locale)}`.toLowerCase();
        if (!searchable.includes(s)) return false;
      }
      return true;
    });
  }, [jobs, search, deptFilter, modeFilter, locale]);

  return (
    <Frame>
      <section className="wrap cr-page-head">
        <span className="kick">
          <Link href="/">{t.ui.careersCrumb}</Link> / {t.jobs.pageTitle}
        </span>
        <h1>{t.jobs.pageTitle}</h1>
        <p className="lede">{t.jobs.pageSubtitle}</p>
      </section>

      <section className="wrap cr-sec">
        <h2 className="sr-only">{t.ui.listHeading}</h2>
        <div className="cr-filters">
          <div className="cr-search">
            <input
              type="search"
              value={search}
              placeholder={t.jobs.searchPlaceholder}
              aria-label={t.jobs.searchPlaceholder}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="cr-filter">
            <span>{t.ui.deptFilter}</span>
            <div className="chips" role="group" aria-label={t.ui.deptFilter}>
              <button type="button" className="chip" aria-pressed={deptFilter === "all"} onClick={() => setDeptFilter("all")}>
                {t.jobs.all}
              </button>
              {departments.map((d) => (
                <button type="button" className="chip" key={d} aria-pressed={deptFilter === d} onClick={() => setDeptFilter(d)}>
                  {deptName(d)}
                </button>
              ))}
            </div>
          </div>
          <div className="cr-filter">
            <span>{t.ui.modeFilter}</span>
            <div className="chips" role="group" aria-label={t.ui.modeFilter}>
              <button type="button" className="chip" aria-pressed={modeFilter === "all"} onClick={() => setModeFilter("all")}>
                {t.jobs.allFem}
              </button>
              {modes.map((m) => (
                <button type="button" className="chip" key={m} aria-pressed={modeFilter === m} onClick={() => setModeFilter(m)}>
                  {modeName(m)}
                </button>
              ))}
            </div>
          </div>
          <span className="cr-count" aria-live="polite">
            {loading
              ? t.ui.loadingJobs
              : `${filtered.length} ${filtered.length === 1 ? t.jobs.resultsSingular : t.jobs.resultsPlural}`}
          </span>
        </div>
        <div className="cr-jobs">
          {!loading && filtered.length === 0 ? (
            <p className="cr-empty">
              {t.jobs.noResults}{" "}
              <button type="button" className="v3-link" style={{ marginTop: 0 }} onClick={() => { setSearch(""); setDeptFilter("all"); setModeFilter("all"); }}>
                {t.jobs.clearFilters}
              </button>
            </p>
          ) : (
            filtered.map((job) => <JobRow key={job.id} job={job} />)
          )}
        </div>
      </section>

      <section className="v3-chapter cr-chapter">
        <div className="bg" data-par="0.12">
          <CareerPicture base="careers-team" widths={[800, 1600, 2400]} sizes="100vw" alt={t.ui.teamAlt} />
        </div>
        <div className="wrap v3-chapter-in rv">
          <h2>
            {t.ui.dontSeeTitle} {t.ui.talentPool}
          </h2>
          <p>{t.ui.dontSeeBody}</p>
          <Link href="/vacantes/pool" className="btn btn-blue">
            {t.ui.leaveCv}
          </Link>
          <a href={siteLinks.linkedinJobs} target="_blank" rel="noopener" className="btn btn-light">
            {t.ui.followLinkedIn}
          </a>
        </div>
      </section>
      <div style={{ height: "clamp(40px,5vw,72px)" }} />
    </Frame>
  );
}

export default function VacantesPage() {
  return (
    <Suspense fallback={<div className="ts-x" style={{ minHeight: "100vh" }} />}>
      <VacantesContent />
    </Suspense>
  );
}
