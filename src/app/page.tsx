"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLanguage } from "@/i18n/context";
import { countLabel } from "@/i18n/translations";
import { fetchOpenJobs, type Job } from "@/lib/vacancies-adapter";
import { AREA_KEYS, areaOf, countByArea, type AreaKey } from "@/lib/careers-areas";
import { ArrowRight, ArrowUpRight, Search, MapPin, Route, Anchor, Ear, BookOpen, Globe, Heart, Eye } from "lucide-react";

const AREA_IMAGES: Record<AreaKey, string> = {
  operations: "/careers/area-operations.webp",
  corporate: "/careers/area-corporate.webp",
  commercial: "/careers/area-commercial.webp",
};

const PILLAR_ICONS = [Route, Anchor, Ear];
const BENEFIT_ICONS = [BookOpen, Globe, Heart, Eye];

export default function HomePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");

  useEffect(() => {
    let active = true;
    setLoadError(false);
    fetchOpenJobs().then((list) => active && setJobs(list)).catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, [attempt]);

  const counts = useMemo(() => (jobs ? countByArea(jobs) : null), [jobs]);
  const latest = useMemo(() => (jobs ? jobs.slice(0, 3) : []), [jobs]);
  const deptName = (d: string) => t.deptNames[d] || t.areas.items[areaOf(d)].title;
  const modeName = (m: string) => t.modeNames[m] || m;

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const s = q.trim();
    router.push(s ? `/vacantes?q=${encodeURIComponent(s)}` : "/vacantes");
  };

  return (
    <>
      <Navbar />

      <main className="bg-ts-canvas">
        {/* ── HERO · cinematic rounded inset on canvas ── */}
        <section className="px-4 sm:px-6 lg:px-10 pt-4 md:pt-8">
          <div className="max-w-[1320px] mx-auto">
            <div className="relative md:overflow-hidden md:rounded-[28px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/careers/hero-miami-port.webp"
                alt={t.hero.imageAlt}
                className="w-full h-[300px] sm:h-[380px] md:h-[min(76vh,700px)] object-cover rounded-ts-lg md:rounded-none"
                fetchPriority="high"
              />
              <div className="hidden md:block absolute inset-0 hero-scrim" aria-hidden />
              <div className="pt-7 pb-2 md:p-12 lg:p-16 md:absolute md:inset-0 md:flex md:flex-col md:justify-end md:text-white">
                <div className="max-w-[700px]">
                  <p className="ts-kicker md:text-white/85 mb-5">{t.hero.eyebrow}</p>
                  <h1 className="hero-text mb-6">{t.hero.title}</h1>
                  <p className="text-base md:text-lg text-ts-secondary md:text-white/90 leading-relaxed max-w-[620px] mb-8">{t.hero.body}</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Link href="/vacantes" className="pill-btn pill-btn-primary justify-center text-base">
                      {t.hero.ctaPrimary}
                      <ArrowRight size={16} strokeWidth={2.25} />
                    </Link>
                    <a href="#how-we-hire" className="pill-btn justify-center text-base bg-white text-ts-ink md:bg-white/15 md:text-white border border-[color:var(--ts-line)] md:border-white/40 hover:bg-ts-canvas md:hover:bg-white/25">
                      {t.hero.ctaSecondary}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── STATS + quick role search ── */}
        <section className="px-4 sm:px-6 lg:px-10 pt-6 md:pt-8">
          <div className="max-w-ts mx-auto bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] p-6 md:p-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-6">
              {t.stats.map((s) => (
                <div key={s.label}>
                  <p className="stat-number ts-tabular">{s.value}</p>
                  <p className="text-sm text-ts-muted mt-2">{s.label}</p>
                </div>
              ))}
            </div>
            <form onSubmit={onSearch} className="mt-8 md:mt-10 pt-6 md:pt-8 border-t border-[color:var(--ts-line)] flex flex-col sm:flex-row gap-3" role="search">
              <label htmlFor="home-search" className="sr-only">{t.jobs.searchLabel}</label>
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ts-muted" size={18} aria-hidden />
                <input
                  id="home-search"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t.jobs.searchPlaceholder}
                  className="input-field pl-11"
                />
              </div>
              <button type="submit" className="pill-btn pill-btn-primary justify-center">
                {t.nav.cta}
              </button>
            </form>
          </div>
        </section>

        {/* ── WHY ── */}
        <section id="why" className="scroll-mt-20 py-20 md:py-28 px-4 sm:px-6 lg:px-10">
          <div className="max-w-ts mx-auto">
            <div className="max-w-3xl mb-12 md:mb-14">
              <p className="ts-kicker mb-4">{t.why.eyebrow}</p>
              <h2 className="section-title mb-6">{t.why.title}</h2>
              <p className="text-lg text-ts-secondary leading-relaxed">{t.why.lead}</p>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {t.why.pillars.map((p, i) => {
                const Icon = PILLAR_ICONS[i];
                return (
                  <div key={p.title} className="bg-ts-surface rounded-ts-lg p-7 md:p-8 border border-[color:var(--ts-line)] h-full">
                    <div className="w-11 h-11 rounded-ts-sm bg-[var(--ts-blue-bg)] text-ts-accent flex items-center justify-center mb-6">
                      <Icon size={20} aria-hidden />
                    </div>
                    <h3 className="text-xl font-light tracking-ts-tight mb-3">{p.title}</h3>
                    <p className="text-[15px] text-ts-secondary leading-relaxed">{p.body}</p>
                  </div>
                );
              })}
            </div>

            {/* Pull-quote close */}
            <figure className="mt-5 bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] p-8 md:p-14 grid md:grid-cols-12 gap-10">
              <div className="md:col-span-7">
                <blockquote className="pull-quote">{t.why.closeTitle}</blockquote>
                <figcaption className="mt-6 text-base text-ts-secondary leading-relaxed max-w-xl">{t.why.closeBody}</figcaption>
              </div>
              <div className="md:col-span-5 md:pl-10 md:border-l border-[color:var(--ts-line)] flex flex-col justify-between gap-8">
                <ul className="flex flex-wrap gap-2" aria-label="Services">
                  {t.why.tags.map((tag) => (
                    <li key={tag} className="service-chip">{tag}</li>
                  ))}
                </ul>
                <dl className="grid grid-cols-3 gap-4">
                  {t.why.miniStats.map((s) => (
                    <div key={s.label}>
                      <dt className="sr-only">{s.label}</dt>
                      <dd className="text-3xl font-light tracking-ts-tight ts-tabular">{s.value}</dd>
                      <dd className="text-xs text-ts-muted mt-1 leading-snug">{s.label}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </figure>
          </div>
        </section>

        {/* ── AREAS / OPEN ROLES ── */}
        <section id="roles" className="scroll-mt-20 py-20 md:py-28 px-4 sm:px-6 lg:px-10 bg-ts-surface">
          <div className="max-w-ts mx-auto">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
              <div className="max-w-2xl">
                <p className="ts-kicker mb-4">{t.areas.eyebrow}</p>
                <h2 className="section-title mb-5">{t.areas.title}</h2>
                <p className="text-lg text-ts-secondary leading-relaxed">{t.areas.lead}</p>
              </div>
              <Link href="/vacantes" className="pill-btn pill-btn-outline self-start md:self-auto shrink-0">
                {t.nav.cta}
                <ArrowRight size={16} />
              </Link>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {AREA_KEYS.map((key) => {
                const a = t.areas.items[key];
                const n = counts?.[key];
                return (
                  <Link
                    key={key}
                    href={`/vacantes?area=${key}`}
                    className="group flex flex-col bg-ts-canvas rounded-ts-lg overflow-hidden border border-[color:var(--ts-line)] hover:border-ts-accent transition-colors"
                  >
                    <div className="aspect-[16/10] overflow-hidden m-2 rounded-[18px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={AREA_IMAGES[key]}
                        alt={a.imageAlt}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                      />
                    </div>
                    <div className="p-6 pt-4 flex flex-col flex-1">
                      <h3 className="text-xl font-light tracking-ts-tight mb-2">{a.title}</h3>
                      <p className="text-[15px] text-ts-secondary leading-relaxed mb-6">{a.desc}</p>
                      <div className="mt-auto flex items-center justify-between">
                        <span className={`text-sm font-medium ${n ? "text-ts-ink" : "text-ts-muted"}`}>
                          {n === undefined ? " " : countLabel(n, t.counts)}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ts-accent">
                          {t.areas.cardCta}
                          <ArrowUpRight size={15} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {loadError && (
              <div role="alert" className="mt-10 bg-ts-canvas rounded-ts-lg p-6">
                <p>{t.jobs.loadError}</p>
                <button onClick={() => setAttempt((n) => n + 1)} className="pill-btn pill-btn-outline mt-4">{t.jobs.retry}</button>
              </div>
            )}

            {/* Latest roles — discovery stays visible on the home page */}
            {jobs && (
              <div className="mt-10 rounded-ts-lg border border-[color:var(--ts-line)] overflow-hidden">
                {latest.length > 0 ? (
                  <ul className="divide-y divide-[color:var(--ts-line)]">
                    {latest.map((job) => (
                      <li key={job.id}>
                        <Link href={`/vacantes/${job.id}`} className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 px-6 py-5 hover:bg-ts-canvas transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-lg font-medium text-ts-ink truncate">{job.title.en}</p>
                            <p className="text-sm text-ts-muted mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>{deptName(job.dept)}</span>
                              <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden />{job.location}</span>
                              <span>{modeName(job.mode)}</span>
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ts-accent">
                            {t.jobs.cardCta}
                            <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-6 py-10 text-center">
                    <p className="text-lg font-medium">{t.empty.allTitle}</p>
                    <p className="text-ts-muted mt-2">{t.empty.allBody}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── HOW WE HIRE ── */}
        <section id="how-we-hire" className="scroll-mt-20 py-20 md:py-28 px-4 sm:px-6 lg:px-10">
          <div className="max-w-ts mx-auto">
            <div className="max-w-2xl mb-12">
              <p className="ts-kicker mb-4">{t.process.eyebrow}</p>
              <h2 className="section-title mb-5">{t.process.title}</h2>
              <p className="text-lg text-ts-secondary leading-relaxed">{t.process.lead}</p>
            </div>
            <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
              {t.process.steps.map((s) => (
                <li key={s.label} className="h-full bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] p-7 flex flex-col">
                  <p className="text-sm font-medium text-ts-accent mb-8">{s.label}</p>
                  <h3 className="text-xl font-light tracking-ts-tight mb-3">{s.title}</h3>
                  <p className="text-[15px] text-ts-secondary leading-relaxed">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── LIFE HERE ── */}
        <section id="life" className="scroll-mt-20 py-20 md:py-28 px-4 sm:px-6 lg:px-10 bg-ts-surface">
          <div className="max-w-ts mx-auto">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
              <div className="lg:col-span-5 lg:sticky lg:top-28">
                <p className="ts-kicker mb-4">{t.benefits.eyebrow}</p>
                <h2 className="section-title mb-8">{t.benefits.title}</h2>
                <div className="rounded-ts-lg overflow-hidden aspect-[4/3]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/careers/life-ground.webp" alt={t.benefits.imageAlt} loading="lazy" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="lg:col-span-7 grid sm:grid-cols-2 gap-5">
                {t.benefits.items.map((b, i) => {
                  const Icon = BENEFIT_ICONS[i];
                  return (
                    <div key={b.title} className="h-full bg-ts-canvas rounded-ts-lg p-7">
                      <div className="w-11 h-11 rounded-ts-sm bg-ts-surface text-ts-accent flex items-center justify-center mb-6 border border-[color:var(--ts-line)]">
                        <Icon size={20} aria-hidden />
                      </div>
                      <h3 className="text-xl font-light tracking-ts-tight mb-3">{b.title}</h3>
                      <p className="text-[15px] text-ts-secondary leading-relaxed">{b.body}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ── FINAL CTA · the one ink band ── */}
        <section className="px-4 sm:px-6 lg:px-10 py-16 md:py-24">
          <div className="max-w-ts mx-auto bg-ts-ink text-white rounded-ts-lg md:rounded-[28px] px-7 py-14 md:p-20 text-center">
            <h2 className="section-title mb-5 flex items-center justify-center gap-3">
              <span className="ts-mark hidden sm:inline-block" aria-hidden />
              {t.cta.title}
            </h2>
            <p className="text-lg text-white/75 max-w-xl mx-auto mb-10 leading-relaxed">{t.cta.body}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/vacantes" className="pill-btn pill-btn-primary justify-center text-base">
                {t.cta.primary}
                <ArrowRight size={16} strokeWidth={2.25} />
              </Link>
              <a href={t.cta.secondaryUrl} target="_blank" rel="noopener noreferrer" className="pill-btn pill-btn-glass justify-center text-base">
                {t.cta.secondary}
                <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
