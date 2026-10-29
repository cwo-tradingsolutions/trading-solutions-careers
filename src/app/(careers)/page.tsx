"use client";

import { useRef } from "react";
import Link from "next/link";
import Frame from "@/components/careers/Frame";
import JobRow from "@/components/careers/JobRow";
import { useOpenJobs } from "@/components/careers/useOpenJobs";
import { CareerPicture, areaVisual, departmentsFrom, openingsLabel, siteLinks, splitFreedom, splitSentence } from "@/components/careers/shared";
import { useLanguage } from "@/i18n/context";
import { GoArrow } from "@/components/careers/shared";

export default function HomePage() {
  const { t } = useLanguage();
  const { jobs, loading } = useOpenJobs();
  const trackRef = useRef<HTMLDivElement>(null);
  const depts = departmentsFrom(jobs);
  const [lead, rest] = t.culture.title.split("\n");
  const [expLead, expRest] = splitSentence(t.experience.title);
  const [moreLead, moreRest] = splitFreedom(t.culture.blackBlock.desc);
  const total = openingsLabel(jobs.length, t.ui.openOne, t.ui.openMany, t.ui.openNone);

  const scrollAreas = (dir: number) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>(".cr-area");
    const step = card ? card.offsetWidth + 16 : 400;
    track.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <Frame>
      <section className="hero-full v3-hero cr-hero">
        <div className="bg" data-par="0.08">
          <CareerPicture
            base="careers-hero"
            widths={[800, 1600, 2400]}
            sizes="100vw"
            priority
            alt={t.ui.heroAlt}
          />
        </div>
        <div className="v3-hero-in">
          <div className="v3-hero-copy">
            <span className="v3-eyebrow">{t.hero.tag}</span>
            <h1>
              {t.hero.title.split("\n").map((line, i) => (
                <span key={line}>
                  {i > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </h1>
            <p>{t.hero.subtitle}</p>
            <div className="v3-ctas">
              <Link href="/vacantes" className="btn btn-blue">
                {t.hero.cta}
              </Link>
              <a href="#culture" className="btn btn-light">
                {t.hero.ctaSecondary}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap v3-statement">
        <p className="v3-big rv">
          {lead} {rest ? <span>{rest}</span> : null}
        </p>
        <div className="v3-figs">
          {(["countries", "clients", "teus", "tons"] as const).map((key) => (
            <div key={key}>
              <b className="num" data-count={t.stats[key].value}>
                {t.stats[key].value}
              </b>
              <span>{t.stats[key].label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap cr-sec" id="culture">
        <div className="cr-head rv">
          <div>
            <span className="cr-kick">{t.culture.tag}</span>
            <h2>{t.ui.cultureHeadline}</h2>
          </div>
          <p>{t.culture.subtitle}</p>
        </div>
        <div className="cr-cards">
          {t.culture.cards.map((card, i) => (
            <article className="cr-card rv" key={card.title}>
              <span className="n">0{i + 1}</span>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap v3-split">
        <h2 className="rv">{t.culture.blackBlock.title}</h2>
        <div className="rv">
          <p>{moreLead}</p>
          {moreRest ? <p className="v3-muted">{moreRest}</p> : null}
          <a href={siteLinks.about} className="v3-link">
            {t.ui.about}
          </a>
        </div>
      </section>

      <section className="wrap cr-sec" id="areas">
        <div className="cr-head rv">
          <div>
            <span className="cr-kick">{t.departments.tag}</span>
            <h2>{t.departments.title}</h2>
          </div>
          <div className="cr-area-nav">
            <button type="button" className="cr-arrow" aria-label={t.ui.prev} onClick={() => scrollAreas(-1)}>
              <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" className="cr-arrow" aria-label={t.ui.next} onClick={() => scrollAreas(1)}>
              <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="cr-areas-track" id="areasTrack" ref={trackRef}>
          {(loading ? [] : depts).map((dept, i) => {
            const visual = areaVisual(dept);
            const n = jobs.filter((j) => j.dept === dept).length;
            const count = openingsLabel(n, t.ui.openOne, t.ui.openMany, t.ui.openNone);
            const name = (t.deptNames as Record<string, string>)[dept] || dept;
            const href = n > 0 ? `/vacantes?dept=${encodeURIComponent(dept)}` : "/vacantes/pool";
            return (
              <Link className="cr-area" href={href} key={dept}>
                <CareerPicture base={visual.base} widths={visual.widths} alt={t.ui[visual.altKey]} sizes="(max-width:560px) 84vw, 560px" />
                <div className="top">
                  <span>
                    {t.ui.areaWord} {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{n ? count : t.ui.openNone}</span>
                </div>
                <div className="bot">
                  <div>
                    <h3>{name}</h3>
                    <span className="count">{n ? count : t.ui.talentPool}</span>
                  </div>
                  <span className="btn btn-light">{n ? t.ui.viewRoles : t.ui.leaveCv}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="wrap cr-sec" id="experience">
        <div className="cr-head rv">
          <div>
            <span className="cr-kick">{t.experience.tag}</span>
            <h2>
              {expLead} {expRest ? <span>{expRest}</span> : null}
            </h2>
          </div>
        </div>
        <div className="cr-steps">
          {t.experience.steps.map((step) => (
            <article className="cr-step rv" key={step.num}>
              <span className="n">
                <b>{step.num}</b> — {step.label}
              </span>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </article>
          ))}
        </div>
        <div className="cr-after rv">
          <Link href="/vacantes" className="btn btn-dark">
            {t.experience.cta} <GoArrow />
          </Link>
        </div>
      </section>

      <section className="wrap cr-sec">
        <div className="cr-benefits">
          <div className="rv">
            <span className="cr-kick">{t.benefits.tag}</span>
            <h2>{t.benefits.title}</h2>
          </div>
          <div className="rv">
            {t.benefits.items.map((item, i) => (
              <div className="cr-ben" key={item.title}>
                <span className="n">0{i + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap cr-sec">
        <div className="cr-head rv">
          <div>
            <span className="cr-kick">{loading ? t.ui.openPositions : total}</span>
            <h2>{t.jobs.pageTitle}</h2>
          </div>
          <Link href="/vacantes" className="v3-link" style={{ marginTop: 0 }}>
            {t.cta.button}
          </Link>
        </div>
        <div className="cr-jobs">
          {jobs.slice(0, 4).map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      </section>

      <section className="v3-chapter cr-chapter">
        <div className="bg" data-par="0.12">
          <CareerPicture
            base="careers-next"
            widths={[800, 1600, 2400]}
            sizes="100vw"
            alt={t.ui.nextAlt}
          />
        </div>
        <div className="wrap v3-chapter-in rv">
          <h2>{t.cta.title}</h2>
          <p>{t.cta.subtitle}</p>
          <Link href="/vacantes" className="btn btn-blue">
            {t.cta.button}
          </Link>
        </div>
      </section>
      <div style={{ height: "clamp(40px,5vw,72px)" }} />
    </Frame>
  );
}
