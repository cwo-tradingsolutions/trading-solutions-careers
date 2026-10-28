"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PublicPage from "@/components/PublicPage";
import TalentPoolForm from "@/components/TalentPoolForm";
import { useLanguage } from "@/i18n/context";
import { fill } from "@/i18n/translations";
import { fetchOpenJobs, deriveModes, type Job } from "@/lib/vacancies-adapter";
import { AREAS, areaOf, type AreaKey } from "@/lib/areas";

/**
 * Home pública · Careers en el shell Universe (preview AJUSTE de Clara,
 * pack rev J + cifras corp rev K).
 *
 * Orden del preview: hero con búsqueda (patrón SLB) · cifras · Gente ·
 * Cultura · Crecer · Áreas · Vacantes · Únete (talent pool) · CTA final.
 * Textos EN de Bernabé; las vacantes y los conteos salen de la base.
 *
 * Fotos de gente: el banco TS aún no tiene fotos de equipo, así que van las
 * de Clara (Unsplash) con la etiqueta "placeholder until TS photo bank",
 * como pide el DELTA. No son finales.
 */

const PH = (id: string, w: number, h: number) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&crop=faces&q=80`;

const HERO_IMG = PH("1522202176988-66273c2fd55f", 1400, 900);
const STORY_IMGS = [
  PH("1573496359142-b8d87734a5a2", 700, 500),
  PH("1560250097-0b93528c311a", 700, 500),
  PH("1580489944761-15a19d654956", 700, 500),
];
const STORY_AREAS: AreaKey[] = ["operations", "corporate", "commercial"];
const AREA_IMGS: Record<AreaKey, string> = {
  operations: PH("1552664730-d307ca884978", 600, 320),
  corporate: PH("1517245386807-bb43f82c33c4", 600, 320),
  commercial: PH("1600880292203-757bb62b4baf", 600, 320),
};

const ICONS = [
  <path key="a" d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z" />,
  <g key="b"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></g>,
  <path key="c" d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 000-7.8z" />,
  <path key="d" d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" />,
];

const Pin = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export default function HomePage() {
  const { t, locale } = useLanguage();
  const [jobs, setJobs] = useState<Job[] | null>(null);

  // Filtros de #vacantes; la búsqueda del hero escribe aquí.
  const [q, setQ] = useState("");
  const [area, setArea] = useState<AreaKey | "all">("all");
  const [mode, setMode] = useState("all");
  const [loc, setLoc] = useState("all");
  const [heroQ, setHeroQ] = useState("");
  const [heroArea, setHeroArea] = useState<AreaKey | "all">("all");
  const [heroLoc, setHeroLoc] = useState("all");

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
  const modes = useMemo(() => deriveModes(jobs ?? []), [jobs]);
  const locations = useMemo(
    () => Array.from(new Set((jobs ?? []).map((j) => j.location.trim()).filter(Boolean))).sort(),
    [jobs],
  );

  const filtered = useMemo(
    () =>
      (jobs ?? []).filter((j) => {
        if (area !== "all" && areaOf(j.dept) !== area) return false;
        if (mode !== "all" && j.mode !== mode) return false;
        if (loc !== "all" && j.location.trim() !== loc) return false;
        if (q) {
          const text = `${j.title[locale]} ${j.dept} ${j.location} ${j.tags.join(" ")}`.toLowerCase();
          if (!text.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [jobs, area, mode, loc, q, locale],
  );

  const countLabel = (n: number) =>
    n === 0 ? t.areas.countZero : n === 1 ? t.areas.countOne : fill(t.areas.countMany, { n });
  const modeName = (m: string) => (t.modeNames as Record<string, string>)[m] || m;
  const deptName = (d: string) => (t.deptNames as Record<string, string>)[d] || d;

  const heroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQ(heroQ.trim());
    setArea(heroArea);
    setLoc(heroLoc);
    document.getElementById("vacantes")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <PublicPage>
      {/* 1 · Hero + búsqueda */}
      <section className="hero-block" id="inicio">
        <div className="hero-kicker"><i aria-hidden /> {t.hero.eyebrow}</div>
        <div className="hero-top">
          <div>
            <h1>{t.hero.title}</h1>
            <p className="lead">{t.hero.body}</p>
            <div className="hero-ctas">
              <a className="btn-blue" href="#vacantes">{t.hero.ctaPrimary} <span aria-hidden>↗</span></a>
              <a className="btn-ghost-text" href="#unete">{t.pool.cta}</a>
            </div>
          </div>
          <div className="hero-stat">
            <div className="n">{t.stats[0].value}</div>
            <div className="l">{t.stats[0].label}</div>
          </div>
        </div>

        <div className="hero-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HERO_IMG} alt="" fetchPriority="high" />
          <div className="overlay" />
          <div className="copy">
            <div className="kicker">{t.heroSearch.cardKicker}</div>
            <div className="ht">{t.cta.body}</div>
          </div>
          <span className="cap">{t.shell.photoPlaceholder}</span>
        </div>

        <form className="hero-search" role="search" aria-label={t.heroSearch.label} onSubmit={heroSearch}>
          <div className="hs-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={heroQ}
              onChange={(e) => setHeroQ(e.target.value)}
              placeholder={t.heroSearch.keyword}
              aria-label={t.heroSearch.keyword}
              autoComplete="off"
            />
          </div>
          <div className="hs-field">
            <select value={heroArea} onChange={(e) => setHeroArea(e.target.value as AreaKey | "all")} aria-label={t.jobs.areaLabel}>
              <option value="all">{t.heroSearch.allTeams}</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>{t.areas[a].title}</option>
              ))}
            </select>
          </div>
          <div className="hs-field">
            <select value={heroLoc} onChange={(e) => setHeroLoc(e.target.value)} aria-label="Location">
              <option value="all">{t.heroSearch.anyLocation}</option>
              {locations.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-blue">{t.heroSearch.submit}</button>
        </form>
      </section>

      {/* 2 · Cifras corp (rev K) */}
      <div className="stats">
        {t.stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="v">{s.value}</div>
            <div className="l">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 3 · Gente · el bloque Why en tarjetas de historia */}
      <section className="sec" id="gente">
        <div className="sec-head">
          <div className="left">
            <div className="eyebrow">{t.why.eyebrow}</div>
            <h2>{t.why.title}</h2>
            <p className="sub">{t.why.lead}</p>
          </div>
        </div>
        <div className="cards-3">
          {t.why.pillars.map((p, i) => (
            <article key={p.title} className="story">
              <div className="photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={STORY_IMGS[i]} alt="" loading="lazy" />
                <span className="cap">{t.shell.photoPlaceholder}</span>
              </div>
              <div className="body">
                <span className="tag">{t.areas[STORY_AREAS[i]].title}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
                <div className="who">{t.people.storyPending}</div>
              </div>
            </article>
          ))}
        </div>

        {/* Cierre Why · pull-quote */}
        <figure className="quote-card">
          <div>
            <blockquote className="quote">{t.why.closeTitle}</blockquote>
            <p className="quote-body">{t.why.closeBody}</p>
          </div>
          <div>
            <ul className="chip-row" aria-label={t.footer.services}>
              {t.why.tags.map((tag) => (
                <li key={tag} className="chip">{tag}</li>
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
        </figure>
      </section>

      {/* 4 · Cultura · lo que el candidato puede esperar */}
      <section className="sec" id="cultura">
        <div className="sec-head">
          <div className="left">
            <div className="eyebrow">{t.benefits.eyebrow}</div>
            <h2>{t.benefits.title}</h2>
          </div>
        </div>
        <div className="cards-4">
          {t.benefits.items.map((b, i) => (
            <article key={b.title} className="card">
              <div className="ico" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{ICONS[i]}</svg>
              </div>
              <h3>{b.title}</h3>
              <p>{b.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 5 · Crecer · cómo contratamos (tarjetas de igual altura) */}
      <section className="sec" id="crecer">
        <div className="sec-head">
          <div className="left">
            <div className="eyebrow">{t.process.eyebrow}</div>
            <h2>{t.process.title}</h2>
            <p className="sub">{t.process.lead}</p>
          </div>
        </div>
        <ol className="steps">
          {t.process.steps.map((s) => (
            <li key={s.label} className="step">
              <div className="num">{s.label}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 6 · Áreas (lean) · conteos desde la base */}
      <section className="sec" id="areas">
        <div className="sec-head">
          <div className="left">
            <div className="eyebrow">{t.areas.eyebrow}</div>
            <h2>{t.areas.title}</h2>
            <p className="sub">{t.areas.lead}</p>
          </div>
          <Link className="link-all" href="/vacantes">{t.nav.cta} →</Link>
        </div>
        <div className="cards-3">
          {AREAS.map((key) => (
            <Link key={key} href={`/vacantes?area=${key}`} className="area-card">
              <div className="thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={AREA_IMGS[key]} alt="" loading="lazy" />
                <span className="cap">{t.shell.photoPlaceholder}</span>
              </div>
              <div className="body">
                <h3>{t.areas[key].title}</h3>
                <p>{t.areas[key].desc}</p>
                {jobs !== null && (
                  <span className={`count${counts[key] === 0 ? " zero" : ""}`}>{countLabel(counts[key])}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 7 · Vacantes */}
      <section className="sec" id="vacantes">
        <div className="sec-head">
          <div className="left">
            <div className="eyebrow">{t.hero.eyebrow}</div>
            <h2>{t.shell.roles}</h2>
            <p className="sub">
              {t.jobs.pageSubtitle} <a href="#unete">{t.pool.cta} →</a>
            </p>
          </div>
          <Link className="link-all" href="/vacantes">{t.jobs.viewAll} →</Link>
        </div>

        <div className="jobs-toolbar">
          <div className="search-jobs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.jobs.searchPlaceholder}
              aria-label={t.jobs.searchLabel}
              autoComplete="off"
            />
          </div>
          <div className="filters">
            <div className="group" role="group" aria-label={t.jobs.areaLabel}>
              <span className="lab">{t.jobs.areaLabel}</span>
              <button type="button" className={area === "all" ? "is-on" : ""} aria-pressed={area === "all"} onClick={() => setArea("all")}>
                {t.jobs.all}
              </button>
              {AREAS.map((a) => (
                <button key={a} type="button" className={area === a ? "is-on" : ""} aria-pressed={area === a} onClick={() => setArea(a)}>
                  {t.areas[a].title}
                </button>
              ))}
            </div>
            {modes.length > 1 && (
              <div className="group" role="group" aria-label={t.jobs.modeLabel}>
                <span className="lab">{t.jobs.modeLabel}</span>
                <button type="button" className={mode === "all" ? "is-on" : ""} aria-pressed={mode === "all"} onClick={() => setMode("all")}>
                  {t.jobs.all}
                </button>
                {modes.map((m) => (
                  <button key={m} type="button" className={mode === m ? "is-on" : ""} aria-pressed={mode === m} onClick={() => setMode(m)}>
                    {modeName(m)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {jobs !== null && (
            <div className="jobs-count" aria-live="polite">
              {filtered.length === 1 ? t.jobs.resultsOne : fill(t.jobs.resultsMany, { n: filtered.length })}
              {loc !== "all" && ` · ${loc}`}
            </div>
          )}
        </div>

        <div className="jobs-grid">
          {jobs === null ? (
            <>
              <div className="skeleton" aria-busy="true" aria-label={t.jobs.loading} />
              <div className="skeleton" />
            </>
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
                <h3>{job.title[locale]}</h3>
                <p className="desc">{job.description[locale]}</p>
                <div className="foot">
                  <div className="meta">
                    {job.location && <span><Pin />{job.location}</span>}
                    <span>{modeName(job.mode)}</span>
                  </div>
                  <span className="arrow" aria-label={t.jobs.cardCta}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className="jobs-empty">
              <h3>{jobs.length === 0 ? t.jobs.allEmptyTitle : t.jobs.noResults}</h3>
              <p>
                {jobs.length === 0 ? t.jobs.allEmptyBody : t.jobs.areaEmptyBody}{" "}
                <a className="inline-link" href="#unete">{t.pool.cta} →</a>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 8 · Únete · talent pool */}
      <section className="sec" id="unete">
        <div className="pool-grid">
          <div className="pool-intro">
            <div className="eyebrow">{t.pool.eyebrow}</div>
            <h2>{t.pool.title}</h2>
            <p>{t.pool.body}</p>
            <ul>
              {t.pool.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <TalentPoolForm />
        </div>
      </section>

      {/* 9 · CTA final · la única banda ink */}
      <section className="cta-band" id="cta">
        <div>
          <h2>{t.cta.title}</h2>
          <p>{t.pool.title}</p>
        </div>
        <div className="btns">
          <a className="btn-blue" href="#vacantes">{t.cta.primary}</a>
          <a className="btn-ghost-text" href="#unete">{t.pool.cta} →</a>
        </div>
      </section>
    </PublicPage>
  );
}
