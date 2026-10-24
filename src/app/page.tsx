"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLanguage } from "@/i18n/context";
import { ArrowUpRight, Activity, Globe, Layers, BookOpen, Heart, Star } from "lucide-react";

const EXPERIENCE_IMAGES = [
  "photo-1522071820081-009f0129c71c",
  "photo-1573497019940-1c28c88b4f3e",
  "photo-1552664730-d307ca884978",
  "photo-1543269865-cbf427effbad",
];

const BENEFIT_ICONS = [BookOpen, Globe, Heart, Star];

export default function HomePage() {
  const { t, locale } = useLanguage();

  return (
    <>
      <Navbar />

      {/* HERO */}
      <section className="relative min-h-screen bg-ts-ink text-white flex items-end overflow-hidden">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1920&q=80"
            alt=""
            className="w-full h-full object-cover opacity-40"
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(var(--ts-ink-rgb),0.2) 0%, rgba(var(--ts-ink-rgb),0.82) 78%)" }}
          />
        </div>
        <div className="relative z-10 max-w-ts mx-auto px-6 lg:px-10 pb-20 pt-40 w-full">
          <p className="ts-kicker ts-kicker-on-dark mb-6">
            <span className="ts-mark" aria-hidden />
            {t.hero.tag}
          </p>
          <h1 className="hero-text max-w-4xl mb-8 whitespace-pre-line">
            {t.hero.title}
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-2xl mb-10 leading-relaxed font-medium">
            {t.hero.subtitle}
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/vacantes" className="pill-btn pill-btn-primary text-base">
              {t.hero.cta}
              <ArrowUpRight size={16} strokeWidth={2.5} />
            </Link>
            <a href="#culture" className="pill-btn text-base text-white border border-white/30 hover:border-white">
              {t.hero.ctaSecondary}
            </a>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="bg-ts-surface py-16 md:py-20">
        <div className="max-w-ts mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {(["countries", "clients", "teus", "tons"] as const).map((key) => (
              <div key={key}>
                <p className="stat-number">{t.stats[key].value}</p>
                <p className="text-sm text-ts-muted mt-2 font-medium">{t.stats[key].label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GROWTH MINDSET */}
      <section id="culture" className="py-20 md:py-28 bg-ts-canvas">
        <div className="max-w-ts mx-auto px-6 lg:px-10">
          <div className="max-w-3xl mb-16">
            <p className="ts-kicker mb-4">{t.culture.tag}</p>
            <h2 className="section-title mb-6 whitespace-pre-line">{t.culture.title}</h2>
            <p className="text-lg text-ts-secondary leading-relaxed font-medium">
              {t.culture.subtitle}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[Activity, Globe, Layers].map((Icon, i) => (
              <div key={i} className="bg-ts-surface rounded-ts-lg p-8 border border-[color:var(--ts-line)] hover:-translate-y-1.5 transition-transform duration-500">
                <div className="relative w-12 h-12 bg-ts-ink rounded-ts-sm flex items-center justify-center mb-6">
                  <span className="ts-mark absolute -top-1 -right-1 ring-2 ring-white" aria-hidden />
                  <Icon size={22} className="text-white" />
                </div>
                <h3 className="text-lg font-medium mb-3">{t.culture.cards[i].title}</h3>
                <p className="text-ts-secondary text-sm leading-relaxed">{t.culture.cards[i].desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 bg-ts-ink rounded-ts-lg p-10 md:p-14 text-white">
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <h3 className="text-2xl md:text-3xl font-light mb-4 tracking-tight flex items-center gap-3">
                  <span className="ts-mark" aria-hidden />
                  {t.culture.blackBlock.title}
                </h3>
                <p className="text-white/70 leading-relaxed font-medium">{t.culture.blackBlock.desc}</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-3xl font-light">{t.culture.blackBlock.maritime}</p>
                  <p className="text-sm text-white/60 mt-1">{t.culture.blackBlock.maritimeSub}</p>
                </div>
                <div>
                  <p className="text-3xl font-light">+10</p>
                  <p className="text-sm text-white/60 mt-1">{t.culture.blackBlock.countriesLabel}</p>
                </div>
                <div>
                  <p className="text-3xl font-light">+52k</p>
                  <p className="text-sm text-white/60 mt-1">{t.culture.blackBlock.teusLabel}</p>
                </div>
                <div>
                  <p className="text-3xl font-light">+500</p>
                  <p className="text-sm text-white/60 mt-1">{t.culture.blackBlock.tonsLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DEPARTMENTS */}
      <section id="departments" className="py-20 md:py-28 bg-ts-surface">
        <div className="max-w-ts mx-auto px-6 lg:px-10">
          <div className="mb-14">
            <p className="ts-kicker mb-4">{t.departments.tag}</p>
            <h2 className="section-title">{t.departments.title}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {([
              { key: "ops" as const, dept: "Operaciones", img: "photo-1578575437130-527eed3abbec", alt: locale === "es" ? "Operaciones marítimas" : "Maritime operations" },
              { key: "corporate" as const, dept: "Corporate", img: "photo-1497366216548-37526070297c", alt: "Corporate" },
              { key: "commercial" as const, dept: "Comercial", img: "photo-1600880292203-757bb62b4baf", alt: locale === "es" ? "Comercial" : "Commercial" },
            ]).map((d) => (
              <Link key={d.dept} href={`/vacantes?dept=${d.dept}`} className="group bg-ts-ink text-white rounded-ts-lg overflow-hidden hover:-translate-y-1.5 transition-transform duration-500">
                <div className="aspect-[4/3] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://images.unsplash.com/${d.img}?w=600&q=80`}
                    alt={d.alt}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-6 flex items-end justify-between">
                  <div>
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <span className="ts-mark" aria-hidden />
                      {t.departments[d.key].name}
                    </h3>
                    <p className="text-sm text-white/60 mt-1">{t.departments[d.key].count}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-ts-surface text-ts-ink flex items-center justify-center group-hover:rotate-45 transition-transform">
                    <ArrowUpRight size={16} strokeWidth={2.5} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* EXPERIENCE */}
      <section id="experience" className="py-20 md:py-28 bg-ts-ink text-white">
        <div className="max-w-ts mx-auto px-6 lg:px-10">
          <div className="mb-16">
            <p className="ts-kicker ts-kicker-on-dark mb-4">
              <span className="ts-mark" aria-hidden />
              {t.experience.tag}
            </p>
            <h2 className="section-title max-w-3xl">{t.experience.title}</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {t.experience.steps.map((exp, i) => (
              <div
                key={exp.num}
                className="relative rounded-ts-lg overflow-hidden min-h-[280px] flex flex-col justify-end p-10"
                style={{
                  background: `linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.9) 100%), url('https://images.unsplash.com/${EXPERIENCE_IMAGES[i]}?w=600&q=80') center/cover`,
                }}
              >
                <p className="text-xs font-medium text-white/70 mb-3">
                  {exp.num} — {exp.label}
                </p>
                <h3 className="text-xl font-light mb-2">{exp.title}</h3>
                <p className="text-sm text-gray-300 leading-relaxed">{exp.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link href="/vacantes" className="pill-btn pill-btn-primary text-base">
              {t.experience.cta}
              <ArrowUpRight size={16} strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="py-20 md:py-28 bg-ts-surface">
        <div className="max-w-ts mx-auto px-6 lg:px-10">
          <div className="mb-14">
            <p className="ts-kicker mb-4">{t.benefits.tag}</p>
            <h2 className="section-title">{t.benefits.title}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {t.benefits.items.map((b, i) => {
              const Icon = BENEFIT_ICONS[i];
              return (
                <div key={b.title} className="bg-ts-canvas rounded-ts-lg p-6 hover:-translate-y-1.5 transition-transform duration-500">
                  <div className="relative w-10 h-10 bg-ts-ink rounded-ts-sm flex items-center justify-center mb-4">
                    <span className="ts-mark absolute -top-1 -right-1 ring-2 ring-[var(--ts-canvas)]" aria-hidden />
                    <Icon size={18} className="text-white" />
                  </div>
                  <h4 className="font-medium text-sm mb-1">{b.title}</h4>
                  <p className="text-xs text-ts-muted">{b.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28 bg-ts-ink text-white">
        <div className="max-w-ts mx-auto px-6 lg:px-10 text-center">
          <h2 className="section-title mb-6">{t.cta.title}</h2>
          <p className="text-lg text-white/70 max-w-2xl mx-auto mb-10 font-medium">{t.cta.subtitle}</p>
          <Link href="/vacantes" className="pill-btn pill-btn-primary text-base">
            {t.cta.button}
            <ArrowUpRight size={16} strokeWidth={2.5} />
          </Link>
        </div>
      </section>

      <Footer />
    </>
  );
}
