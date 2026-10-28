"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PublicPage from "@/components/PublicPage";
import { useLanguage } from "@/i18n/context";
import { fill } from "@/i18n/translations";
import { fetchOpenJobs, type Job } from "@/lib/vacancies-adapter";
import { AREAS, areaOf, type AreaKey } from "@/lib/areas";
import { ArrowUpRight, ArrowRight, Route, Ship, MessageCircle, BookOpen, Globe, Heart, Star } from "lucide-react";

/**
 * Home pública · Careers talla mundial (Clara + Bernabé, 27-oct).
 *
 * Light-first: canvas #f7f7f7 y blanco alternados, hero con la foto en un
 * contenedor redondeado (no a sangre), y una sola banda ink: el CTA final.
 * Fotos propias de Trading Solutions en /public/careers (nada de Unsplash).
 */

const AREA_IMAGES: Record<AreaKey, string> = {
  operations: "/careers/area-operations.jpg",
  corporate: "/careers/area-corporate.jpg",
  commercial: "/careers/area-commercial.jpg",
};

const PILLAR_ICONS = [Route, Ship, MessageCircle];
const BENEFIT_ICONS = [BookOpen, Globe, Heart, Star];

export default function HomePage() {
  const { t } = useLanguage();
  const [jobs, setJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchOpenJobs().then((list) => {
      if (active) setJobs(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<AreaKey, number> = { operations: 0, corporate: 0, commercial: 0 };
    for (const j of jobs ?? []) c[areaOf(j.dept)] += 1;
    return c;
  }, [jobs]);

  const countLabel = (n: number) =>
    n === 0 ? t.areas.countZero : n === 1 ? t.areas.countOne : fill(t.areas.countMany, { n });

  return (
    <PublicPage>
      {/* HERO · texto sobre canvas, foto en contenedor redondeado */}
      <section className="pt-12 md:pt-20 pb-6">
        <div className="max-w-ts mx-auto px-5 md:px-6 lg:px-10">
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-end mb-10 md:mb-14">
            <div className="lg:col-span-8">
              <p className="ts-kicker mb-6">{t.hero.eyebrow}</p>
              <h1 className="hero-text text-ts-ink max-w-[14ch] md:max-w-[16ch]">{t.hero.title}</h1>
            </div>
            <div className="lg:col-span-4">
              <p className="text-base md:text-lg text-ts-muted leading-relaxed mb-8">{t.hero.body}</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/vacantes" className="pill-btn pill-btn-primary text-base">
                  {t.hero.ctaPrimary}
                  <ArrowUpRight size={16} strokeWidth={2.5} />
                </Link>
                <a href="#how-we-hire" className="pill-btn pill-btn-white text-base border border-solid border-[color:var(--ts-line)] hover:border-ts-ink">
                  {t.hero.ctaSecondary}
                </a>
              </div>
            </div>
          </div>

          <div className="relative rounded-ts-lg md:rounded-ts-xl overflow-hidden bg-ts-ink aspect-[4/3] md:aspect-[21/9]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/careers/hero-miami-port.jpg"
              alt={t.hero.imageAlt}
              className="absolute inset-0 w-full h-full object-cover"
              fetchPriority="high"
            />
          </div>

          {/* STATS · mismos 4 números LOCK que el bloque Why */}
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-y-8 mt-10 md:mt-14 border-t border-[color:var(--ts-line)] pt-8 md:pt-10">
            {t.stats.map((s, i) => (
              <div key={s.label} className={`md:px-6 ${i > 0 ? "md:border-l md:border-[color:var(--ts-line)]" : "md:pl-0"}`}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="stat-number text-ts-ink ts-tabular">{s.value}</dd>
                <dd className="text-sm text-ts-muted mt-2">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* WHY */}
      <section id="why" className="scroll-mt-20 py-20 md:py-28 bg-ts-surface mt-14 md:mt-20">
        <div className="max-w-ts mx-auto px-5 md:px-6 lg:px-10">
          <div className="grid lg:grid-cols-12 gap-6 lg:gap-12 mb-14">
            <div className="lg:col-span-6">
              <p className="ts-kicker mb-4">{t.why.eyebrow}</p>
              <h2 className="section-title">{t.why.title}</h2>
            </div>
            <p className="lg:col-span-6 text-lg text-ts-muted leading-relaxed lg:pt-10">{t.why.lead}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {t.why.pillars.map((p, i) => {
              const Icon = PILLAR_ICONS[i];
              return (
                <div key={p.title} className="bg-ts-canvas rounded-ts-lg p-8 h-full">
                  <div className="w-11 h-11 rounded-ts-sm bg-ts-surface border border-[color:var(--ts-line)] flex items-center justify-center mb-8">
                    <Icon size={20} className="text-ts-ink" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-xl font-normal tracking-ts-tight mb-3">{p.title}</h3>
                  <p className="text-ts-muted text-[15px] leading-relaxed">{p.body}</p>
                </div>
              );
            })}
          </div>

          {/* Cierre · pull-quote */}
          <div className="grid lg:grid-cols-2 gap-5 mt-5">
            <div className="relative rounded-ts-lg overflow-hidden min-h-[280px] lg:min-h-full bg-ts-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/careers/why-ground.jpg" alt={t.why.imageAlt} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            </div>
            <figure className="bg-ts-canvas rounded-ts-lg p-8 md:p-12 flex flex-col">
              <blockquote className="border-l-2 border-ts-accent pl-6">
                <p className="text-2xl md:text-[2rem] font-light leading-[1.2] tracking-ts-tight text-ts-ink">
                  {t.why.closeTitle}
                </p>
              </blockquote>
              <p className="text-ts-muted leading-relaxed mt-6">{t.why.closeBody}</p>
              <ul className="flex flex-wrap gap-2 mt-8" aria-label="Services">
                {t.why.tags.map((tag) => (
                  <li key={tag} className="tag !bg-ts-surface">{tag}</li>
                ))}
              </ul>
              <dl className="grid grid-cols-3 gap-4 mt-auto pt-10">
                {t.why.miniStats.map((s) => (
                  <div key={s.label}>
                    <dt className="sr-only">{s.label}</dt>
                    <dd className="text-2xl md:text-3xl font-light tracking-ts-tight ts-tabular">{s.value}</dd>
                    <dd className="text-xs md:text-sm text-ts-muted mt-1 leading-snug">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </figure>
          </div>
        </div>
      </section>

      {/* AREAS · conteos desde las vacantes abiertas */}
      <section id="areas" className="scroll-mt-20 py-20 md:py-28">
        <div className="max-w-ts mx-auto px-5 md:px-6 lg:px-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
            <div className="max-w-2xl">
              <p className="ts-kicker mb-4">{t.areas.eyebrow}</p>
              <h2 className="section-title mb-5">{t.areas.title}</h2>
              <p className="text-lg text-ts-muted leading-relaxed">{t.areas.lead}</p>
            </div>
            <Link href="/vacantes" className="pill-btn pill-btn-outline text-sm self-start md:self-auto shrink-0">
              {t.nav.cta}
              <ArrowRight size={14} strokeWidth={2.5} />
            </Link>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {AREAS.map((key) => (
              <Link
                key={key}
                href={`/vacantes?area=${key}`}
                className="group bg-ts-surface rounded-ts-lg overflow-hidden border border-[color:var(--ts-line)] hover:border-ts-accent transition-colors flex flex-col"
              >
                <div className="aspect-[4/3] overflow-hidden m-2 rounded-ts-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={AREA_IMAGES[key]}
                    alt={t.areas[key].imageAlt}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                    loading="lazy"
                  />
                </div>
                <div className="p-6 pt-4 flex flex-col flex-1">
                  <h3 className="text-xl font-normal tracking-ts-tight mb-2">{t.areas[key].title}</h3>
                  <p className="text-sm text-ts-muted leading-relaxed mb-6">{t.areas[key].desc}</p>
                  <div className="mt-auto flex items-center justify-between pt-4 border-t border-[color:var(--ts-line)]">
                    <span className="text-sm text-ts-ink min-h-[1.25rem]">
                      {jobs === null ? "" : countLabel(counts[key])}
                    </span>
                    <span className="text-sm font-medium text-ts-accent flex items-center gap-1">
                      {t.areas.cardCta}
                      <ArrowUpRight size={14} strokeWidth={2.5} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* PROCESS · 4 tarjetas de igual altura */}
      <section id="how-we-hire" className="scroll-mt-20 py-20 md:py-28 bg-ts-surface">
        <div className="max-w-ts mx-auto px-5 md:px-6 lg:px-10">
          <div className="max-w-2xl mb-12">
            <p className="ts-kicker mb-4">{t.process.eyebrow}</p>
            <h2 className="section-title mb-5">{t.process.title}</h2>
            <p className="text-lg text-ts-muted leading-relaxed">{t.process.lead}</p>
          </div>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 auto-rows-fr">
            {t.process.steps.map((s) => (
              <li key={s.label} className="bg-ts-canvas rounded-ts-lg p-7 h-full flex flex-col">
                <p className="text-sm text-ts-accent font-medium mb-10">{s.label}</p>
                <h3 className="text-xl font-normal tracking-ts-tight mb-3">{s.title}</h3>
                <p className="text-[15px] text-ts-muted leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* BENEFITS */}
      <section id="life-here" className="scroll-mt-20 py-20 md:py-28">
        <div className="max-w-ts mx-auto px-5 md:px-6 lg:px-10">
          <div className="max-w-2xl mb-12">
            <p className="ts-kicker mb-4">{t.benefits.eyebrow}</p>
            <h2 className="section-title">{t.benefits.title}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {t.benefits.items.map((b, i) => {
              const Icon = BENEFIT_ICONS[i];
              return (
                <div key={b.title} className="bg-ts-surface rounded-ts-lg p-7 h-full border border-[color:var(--ts-line)]">
                  <Icon size={22} className="text-ts-accent mb-8" strokeWidth={1.75} />
                  <h3 className="text-lg font-normal tracking-ts-tight mb-2">{b.title}</h3>
                  <p className="text-sm text-ts-muted leading-relaxed">{b.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA · la única banda ink, redondeada sobre canvas */}
      <section className="pb-20 md:pb-28">
        <div className="max-w-ts mx-auto px-5 md:px-6 lg:px-10">
          <div className="bg-ts-ink text-white rounded-ts-lg md:rounded-ts-xl px-7 py-14 md:px-16 md:py-20">
            <p className="ts-kicker ts-kicker-on-dark mb-6">
              <span className="ts-mark" aria-hidden />
              {t.hero.eyebrow}
            </p>
            <h2 className="section-title max-w-2xl mb-5">{t.cta.title}</h2>
            <p className="text-lg text-white/70 max-w-xl mb-10 leading-relaxed">{t.cta.body}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/vacantes" className="pill-btn pill-btn-primary text-base">
                {t.cta.primary}
                <ArrowUpRight size={16} strokeWidth={2.5} />
              </Link>
              <a
                href={t.cta.secondaryUrl}
                target="_blank"
                rel="noopener"
                className="pill-btn text-base text-white border border-solid border-white/30 hover:border-white"
              >
                {t.cta.secondary}
              </a>
            </div>
          </div>
        </div>
      </section>
    </PublicPage>
  );
}
