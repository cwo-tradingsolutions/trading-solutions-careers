"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLanguage } from "@/i18n/context";
import { fetchOpenJobs, deriveDepartments, deriveModes, type Job } from "@/lib/vacancies-adapter";
import { Search, MapPin, Briefcase, ArrowUpRight, ArrowLeft } from "lucide-react";

function VacantesContent() {
  const searchParams = useSearchParams();
  const initialDept = searchParams.get("dept") || "all";
  const { t, locale } = useLanguage();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState(initialDept);
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

  const departments = useMemo(() => deriveDepartments(jobs), [jobs]);
  const modes = useMemo(() => deriveModes(jobs), [jobs]);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (deptFilter !== "all" && j.dept !== deptFilter) return false;
      if (modeFilter !== "all" && j.mode !== modeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const searchable = `${j.title[locale]} ${j.dept} ${j.location} ${j.tags.join(" ")} ${j.description[locale]}`.toLowerCase();
        if (!searchable.includes(s)) return false;
      }
      return true;
    });
  }, [jobs, search, deptFilter, modeFilter, locale]);

  const resetFilters = () => {
    setSearch("");
    setDeptFilter("all");
    setModeFilter("all");
  };

  const deptName = (d: string) => (t.deptNames as Record<string, string>)[d] || d;
  const modeName = (m: string) => (t.modeNames as Record<string, string>)[m] || m;

  return (
    <>
      <Navbar />
      <div className="pt-28">
        <section className="py-12 md:py-16 bg-ts-canvas min-h-screen">
          <div className="max-w-ts mx-auto px-6 lg:px-10">
            {/* Header */}
            <div className="mb-10">
              <Link
                href="/"
                className="flex items-center gap-2 text-sm text-ts-muted hover:text-ts-accent mb-6 transition-colors"
              >
                <ArrowLeft size={16} />
                {t.jobs.backHome}
              </Link>
              <h1 className="section-title mb-2">{t.jobs.pageTitle}</h1>
              <p className="text-ts-secondary">{t.jobs.pageSubtitle}</p>
            </div>

            {/* Search */}
            <div className="mb-8">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder={t.jobs.searchPlaceholder}
                  className="input-field pl-12"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Filters */}
            <div className="mb-10 space-y-4">
              <div className="flex flex-wrap gap-3">
                <span className="text-sm font-medium text-ts-muted self-center mr-2">
                  {t.jobs.deptLabel}
                </span>
                <button
                  className={`filter-chip ${deptFilter === "all" ? "active" : ""}`}
                  onClick={() => setDeptFilter("all")}
                >
                  {t.jobs.all}
                </button>
                {departments.map((d) => (
                  <button
                    key={d}
                    className={`filter-chip ${deptFilter === d ? "active" : ""}`}
                    onClick={() => setDeptFilter(d)}
                  >
                    {deptName(d)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="text-sm font-medium text-ts-muted self-center mr-2">
                  {t.jobs.modeLabel}
                </span>
                <button
                  className={`filter-chip ${modeFilter === "all" ? "active" : ""}`}
                  onClick={() => setModeFilter("all")}
                >
                  {t.jobs.allFem}
                </button>
                {modes.map((m) => (
                  <button
                    key={m}
                    className={`filter-chip ${modeFilter === m ? "active" : ""}`}
                    onClick={() => setModeFilter(m)}
                  >
                    {modeName(m)}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading */}
            {loading ? (
              <div className="text-center py-16">
                <p className="text-gray-400 text-lg">{locale === "es" ? "Cargando vacantes..." : "Loading positions..."}</p>
              </div>
            ) : (
            <>
            {/* Count */}
            <p className="text-sm text-gray-500 mb-6">
              {filtered.length} {filtered.length === 1 ? t.jobs.resultsSingular : t.jobs.resultsPlural}
            </p>

            {/* Grid */}
            {filtered.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-5">
                {filtered.map((job) => (
                  <Link
                    key={job.id}
                    href={`/vacantes/${job.id}`}
                    className="bg-ts-surface rounded-ts-lg p-7 border border-[color:var(--ts-line)] hover:border-ts-accent hover:-translate-y-1 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-medium text-lg mb-1">{job.title[locale]}</h3>
                        <p className="text-sm text-ts-muted">{deptName(job.dept)}</p>
                      </div>
                      <span className="tag">{job.level}</span>
                    </div>
                    <p className="text-sm text-ts-secondary mb-5 leading-relaxed">
                      {job.description[locale].substring(0, 120)}...
                    </p>
                    <div className="flex flex-wrap gap-2 mb-5">
                      {job.tags.map((tag) => (
                        <span key={tag} className="tag">{tag}</span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                          <MapPin size={13} />
                          {job.location}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Briefcase size={13} />
                          {modeName(job.mode)}
                        </span>
                      </div>
                      <ArrowUpRight size={16} className="text-ts-accent" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-gray-400 text-lg">{t.jobs.noResults}</p>
                <button onClick={resetFilters} className="pill-btn pill-btn-outline mt-4 text-sm">
                  {t.jobs.clearFilters}
                </button>
              </div>
            )}
            </>
            )}
          </div>
        </section>
      </div>
      <Footer />
    </>
  );
}

export default function VacantesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <VacantesContent />
    </Suspense>
  );
}
