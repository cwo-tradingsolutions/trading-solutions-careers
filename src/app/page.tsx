"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PublicPage from "@/components/PublicPage";
import { useLanguage } from "@/i18n/context";
import { fill } from "@/i18n/translations";
import { fetchOpenJobs, type Job } from "@/lib/vacancies-adapter";
import { AREAS, areaOf, type AreaKey } from "@/lib/areas";

/**
 * Home pública · Careers en el shell Universe About (pack rev F).
 *
 * Misma estructura del panel About del clon de Clara — intro con cifra
 * gigante, hero cinematográfico redondeado, tarjetas de pilares, tarjeta de
 * cobertura con globo — con el copy de Bernabé en los espacios de Careers.
 * Fotos propias de Trading Solutions en /public/careers (nada de Unsplash).
 *
 * Del clon quedan fuera las piezas internas de Universe (Policies con
 * códigos SIG, merch "Free for our team", eventos internos, FAQ de la
 * plataforma): no son contenido para candidatos.
 */

const AREA_IMAGES: Record<AreaKey, string> = {
  operations: "/careers/area-operations.jpg",
  corporate: "/careers/area-corporate.jpg",
  commercial: "/careers/area-commercial.jpg",
};

const GLOBE_DOTS = [
  [32, 38], [40, 55], [48, 62], [55, 48], [70, 40], [62, 58],
];

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
      <a className="back" href={t.cta.secondaryUrl} target="_blank" rel="noopener">
        ‹ {t.shell.backToCompany}
      </a>

      {/* INTRO · como "About Trading Solutions" del clon */}
      <div className="about-intro">
        <div>
          <p className="eyebrow">{t.hero.eyebrow}</p>
          <h1>{t.hero.title}</h1>
          <p className="lead">{t.hero.body}</p>
          <div className="cta-row">
            <Link href="/vacantes" className="btn-reg lg">
              {t.hero.ctaPrimary} →
            </Link>
            <a href="#how-we-hire" className="btn-ghost">
              {t.hero.ctaSecondary}
            </a>
          </div>
        </div>
        <div className="stat">
          <div className="n">{t.stats[0].value}</div>
          <div className="l">{t.stats[0].label}</div>
        </div>
      </div>

      {/* HERO STORY · cinematográfico redondeado, foto TS */}
      <div className="hero-story">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/careers/hero-miami-port.jpg" alt={t.hero.imageAlt} fetchPriority="high" />
        <div className="overlay" />
        <div className="copy">
          <div className="kicker">{t.hero.eyebrow}</div>
          <div className="ht">{t.cta.title}</div>
          <p className="hb">{t.cta.body}</p>
          <Link href="/vacantes" className="pill">
            ▸ {t.cta.primary}
          </Link>
        </div>
      </div>

      {/* STATS · los 4 números LOCK */}
      <div className="sec">
        <div className="pillars cols-4 stats">
          {t.stats.map((s) => (
            <div key={s.label} className="pillar stat-card">
              <div className="v">{s.value}</div>
              <div className="t">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* WHY */}
      <section id="why" className="sec">
        <p className="eyebrow">{t.why.eyebrow}</p>
        <h2>{t.why.title}</h2>
        <p className="sub">{t.why.lead}</p>
        <div className="pillars cols-3" style={{ marginBottom: 18 }}>
          {t.why.pillars.map((p, i) => (
            <div key={p.title} className="pillar">
              <div className="num">{String(i + 1).padStart(2, "0")}</div>
              <div className="t">{p.title}</div>
              <p className="b">{p.body}</p>
            </div>
          ))}
        </div>

        {/* Cierre · pull-quote */}
        <figure className="cov-card">
          <div className="cov-top">
            <div style={{ display: "flex", flexDirection: "column" }}>
              <blockquote className="quote">{t.why.closeTitle}</blockquote>
              <p className="quote-body">{t.why.closeBody}</p>
              <ul className="chip-row" aria-label="Services" style={{ listStyle: "none", padding: 0, marginTop: 22 }}>
                {t.why.tags.map((tag) => (
                  <li key={tag} className="chip blue">{tag}</li>
                ))}
              </ul>
              <div className="mini-stats">
                {t.why.miniStats.map((s) => (
                  <div key={s.label}>
                    <div className="v">{s.value}</div>
                    <div className="l">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="cov-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/careers/why-ground.jpg" alt={t.why.imageAlt} loading="lazy" />
            </div>
          </div>
        </figure>
      </section>

      {/* COVERAGE · del clon */}
      <section className="sec">
        <h2>{t.coverage.title}</h2>
        <p className="sub">{t.coverage.sub}</p>
        <div className="cov-card">
          <div className="cov-top">
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div className="cov-label">{t.coverage.label}</div>
              <div className="cov-title">
                {t.coverage.country}
                <span>{t.coverage.role}</span>
              </div>
              <div className="cov-meta">
                <div className="row"><span className="k">{t.coverage.foundedK}</span> {t.coverage.founded}</div>
                <div className="row"><span className="k">{t.coverage.officeK}</span> {t.coverage.office}</div>
                <a href={t.coverage.mapsUrl} target="_blank" rel="noopener">{t.coverage.maps} ↗</a>
              </div>
            </div>
            <div className="cov-right">
              <div className="globe" aria-hidden>
                {GLOBE_DOTS.map(([x, y]) => (
                  <span key={`${x}-${y}`} className="dot" style={{ left: `${x}%`, top: `${y}%` }} />
                ))}
                <div className="pin">
                  <div className="flag">🇺🇸</div>
                  <div className="chip">{t.coverage.pin}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="chip-col">
          <div className="lab"><i /> {t.coverage.countriesLabel}</div>
          <div className="chip-row">
            {t.coverage.countries.map((c, i) => (
              <span key={c} className={`chip blue${i === 0 ? " on" : ""}`}>{c}</span>
            ))}
          </div>
        </div>
      </section>

      {/* AREAS · conteos desde las vacantes abiertas */}
      <section id="areas" className="sec">
        <p className="eyebrow">{t.areas.eyebrow}</p>
        <h2>{t.areas.title}</h2>
        <p className="sub">{t.areas.lead}</p>
        <div className="areas">
          {AREAS.map((key) => (
            <Link key={key} href={`/vacantes?area=${key}`} className="area">
              <div className="pol-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={AREA_IMAGES[key]} alt={t.areas[key].imageAlt} loading="lazy" />
                {jobs !== null && <span className="badge">{countLabel(counts[key])}</span>}
              </div>
              <div className="pol-info">
                <h3>{t.areas[key].title}</h3>
                <p>{t.areas[key].desc}</p>
                <div className="code">{t.areas.cardCta} →</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* PROCESS · 4 tarjetas de igual altura */}
      <section id="how-we-hire" className="sec">
        <p className="eyebrow">{t.process.eyebrow}</p>
        <h2>{t.process.title}</h2>
        <p className="sub">{t.process.lead}</p>
        <ol className="pillars cols-4" style={{ listStyle: "none", padding: 0 }}>
          {t.process.steps.map((s) => (
            <li key={s.label} className="pillar">
              <div className="num">{s.label}</div>
              <div className="t">{s.title}</div>
              <p className="b">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* BENEFITS */}
      <section id="life-here" className="sec" style={{ marginBottom: 24 }}>
        <p className="eyebrow">{t.benefits.eyebrow}</p>
        <h2>{t.benefits.title}</h2>
        <div className="pillars cols-4" style={{ marginTop: 22 }}>
          {t.benefits.items.map((b, i) => (
            <div key={b.title} className="pillar">
              <div className="num">{String(i + 1).padStart(2, "0")}</div>
              <div className="t">{b.title}</div>
              <p className="b">{b.body}</p>
            </div>
          ))}
        </div>
        <div className="cta-row" style={{ marginTop: 28 }}>
          <Link href="/vacantes" className="btn-reg lg">{t.cta.primary} →</Link>
          <a href={t.cta.secondaryUrl} target="_blank" rel="noopener" className="btn-ghost">{t.cta.secondary} ↗</a>
        </div>
      </section>
    </PublicPage>
  );
}
