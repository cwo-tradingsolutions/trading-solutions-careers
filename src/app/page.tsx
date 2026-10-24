"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLanguage } from "@/i18n/context";
import { fetchOpenJobs, type Job } from "@/lib/vacancies-adapter";

function blurb(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 160) return clean;
  return `${clean.slice(0, 157).trimEnd()}…`;
}

function withPeriod(title: string) {
  const t = title.trim();
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export default function HomePage() {
  const { t, locale } = useLanguage();
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    let active = true;
    fetchOpenJobs()
      .then((list) => {
        if (active) setJobs(list);
      })
      .catch(() => {
        if (active) setJobs([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const preview = jobs.slice(0, 3);
  const deptName = (d: string) => (t.deptNames as Record<string, string>)[d] || d;
  const modeName = (m: string) => (t.modeNames as Record<string, string>)[m] || m;

  return (
    <>
      <Navbar />
      <main>
        <section className="max-w-ts mx-auto px-6 lg:px-8 pt-16 pb-12 md:pt-20">
          <p className="text-[13px] text-ts-accent mb-4">{t.hero.tag}</p>
          <h1 className="hero-text font-light max-w-[16ch] mb-5 whitespace-pre-line">{t.hero.title}</h1>
          <p className="text-[17px] text-ts-secondary max-w-[42ch] mb-8 leading-relaxed">{t.hero.subtitle}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/vacantes" className="pill-btn pill-btn-primary">
              {t.hero.cta}
            </Link>
            <a href="#process" className="pill-btn pill-btn-outline">
              {t.hero.ctaSecondary}
            </a>
          </div>
        </section>

        <section id="roles" className="max-w-ts mx-auto px-6 lg:px-8 pb-16">
          <div className="flex items-end justify-between gap-4 mb-6 pb-4 border-b border-ts-hairline">
            <h2 className="ts-heading text-[28px]">{t.jobs.pageTitle}</h2>
            <span className="text-[13px] text-ts-muted">
              {jobs.length} {jobs.length === 1 ? t.jobs.resultsSingular : t.jobs.resultsPlural}
            </span>
          </div>
          {preview.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {preview.map((job) => (
                <Link
                  key={job.id}
                  href={`/vacantes/${job.id}`}
                  className="flex flex-col min-h-[260px] bg-ts-surface border border-ts-hairline rounded-ts-lg p-7 shadow-[var(--ts-shadow)] hover:-translate-y-0.5 transition-transform"
                  style={{ transitionDuration: "var(--ts-dur)", transitionTimingFunction: "var(--ts-ease)" }}
                >
                  <div className="flex flex-wrap gap-2 mb-5">
                    <span className="ts-pill ts-pill-accent">{deptName(job.dept)}</span>
                    <span className="ts-pill">{modeName(job.mode)}</span>
                  </div>
                  <h3 className="ts-heading text-[22px] mb-2.5">{withPeriod(job.title[locale])}</h3>
                  <p className="text-sm text-ts-muted flex-1">{blurb(job.description[locale])}</p>
                  <div className="mt-6 flex items-center justify-between text-[13px]">
                    <span className="text-ts-secondary">{job.level}</span>
                    <span className="text-ts-accent">{t.jobs.applyShort}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ts-muted py-8">{t.jobs.noResults}</p>
          )}
        </section>

        <section id="life" className="bg-ts-surface border-y border-ts-hairline">
          <div className="max-w-ts mx-auto px-6 lg:px-8 py-16 md:py-20">
            <p className="text-[13px] text-ts-accent mb-3">{t.culture.tag}</p>
            <h2 className="section-title max-w-3xl mb-4 whitespace-pre-line">{t.culture.title}</h2>
            <p className="text-ts-secondary max-w-2xl mb-10">{t.culture.subtitle}</p>
            <div className="grid md:grid-cols-3 gap-4">
              {t.culture.cards.map((card) => (
                <article key={card.title} className="rounded-ts-lg border border-ts-hairline bg-ts-canvas p-6">
                  <h3 className="text-base mb-2">{card.title}</h3>
                  <p className="text-sm text-ts-muted leading-relaxed">{card.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="process" className="max-w-ts mx-auto px-6 lg:px-8 py-16 md:py-20">
          <p className="text-[13px] text-ts-accent mb-3">{t.experience.tag}</p>
          <h2 className="section-title max-w-3xl mb-10">{t.experience.title}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {t.experience.steps.map((step) => (
              <article key={step.num} className="rounded-ts-lg border border-ts-hairline bg-ts-surface p-6">
                <p className="text-[13px] text-ts-muted mb-2">{step.num} — {step.label}</p>
                <h3 className="ts-heading text-xl mb-2">{step.title}</h3>
                <p className="text-sm text-ts-muted leading-relaxed">{step.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="max-w-ts mx-auto px-6 lg:px-8 pb-16">
          <div className="bg-ts-ink text-white rounded-ts-xl px-8 py-10 md:px-10 flex flex-wrap items-center justify-between gap-6">
            <div>
              <h2 className="ts-heading text-[28px] flex items-center gap-3">
                <span className="ts-mark" aria-hidden />
                {t.cta.title}
              </h2>
              <p className="mt-2 text-sm text-white/65 max-w-md">{t.cta.subtitle}</p>
            </div>
            <Link href="/recomendar-hoja-de-vida" className="pill-btn pill-btn-primary">
              {t.cta.button}
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
