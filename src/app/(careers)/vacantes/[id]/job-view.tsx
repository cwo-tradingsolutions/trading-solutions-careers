"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Frame from "@/components/careers/Frame";
import JobRow from "@/components/careers/JobRow";
import ApplyForm from "@/components/careers/ApplyForm";
import { useOpenJobs } from "@/components/careers/useOpenJobs";
import { departmentsFrom, displaySalary, jobString, jobStrings, linkedInShareHref, postingReadsEnglish, siteLinks } from "@/components/careers/shared";
import { useLanguage } from "@/i18n/context";

export default function JobView({ id, previewTestMode = false }: { id: string; previewTestMode?: boolean }) {
  const searchParams = useSearchParams();
  const refCode = searchParams.get("ref");
  const { t, locale } = useLanguage();
  const { jobs, loading } = useOpenJobs();
  const [showJump, setShowJump] = useState(true);
  const [shareHref, setShareHref] = useState("");
  const isPool = id === "pool";
  const job = isPool ? undefined : jobs.find((j) => j.id === Number(id));
  const missing = !loading && !isPool && !job;

  useEffect(() => {
    if (isPool) {
      document.title = t.meta.poolTitle;
      return;
    }
    if (job) {
      document.title = t.meta.jobTitle.replace("{title}", jobString(job.title, locale));
      return;
    }
    if (missing) {
      document.title = t.meta.closedTitle;
      let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "robots";
        document.head.appendChild(meta);
      }
      meta.content = "noindex, follow";
    }
  }, [isPool, job, missing, locale, t]);

  useEffect(() => {
    if (!job) return;
    const jobUrl = `${window.location.origin}/vacantes/${job.id}`;
    setShareHref(linkedInShareHref(jobUrl));
  }, [job]);

  useEffect(() => {
    const el = document.getElementById("apply");
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setShowJump(!entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [job, isPool, loading]);

  const deptName = (d: string) => (t.deptNames as Record<string, string>)[d] || d;
  const modeName = (m: string) => (t.modeNames as Record<string, string>)[m] || m;
  const others = job ? jobs.filter((j) => j.id !== job.id) : [];
  const englishOnly = !!job && locale !== "en" && postingReadsEnglish(job.description.es, job.description.en);

  return (
    <Frame>
      {loading ? (
        <section className="wrap cr-page-head">
          <p className="lede">{t.ui.loading}</p>
        </section>
      ) : missing ? (
        <section className="wrap cr-page-head cr-closed">
          <span className="kick">
            <Link href="/vacantes" className="cr-back">
              {t.jobs.backToJobs}
            </Link>
          </span>
          <h1>{t.ui.positionClosed}</h1>
          <p className="lede">{t.ui.positionClosedBody}</p>
          <div className="actions">
            <Link href="/vacantes" className="btn btn-dark">
              {t.jobs.viewAll}
            </Link>
            <Link href="/vacantes/pool" className="btn btn-blue">
              {t.ui.leaveCv}
            </Link>
          </div>
        </section>
      ) : isPool ? (
        <>
          <section className="wrap hero-co">
            <span className="mono mono-ink kick">
              <Link href="/vacantes" className="cr-back">
                {t.jobs.backToJobs}
              </Link>
            </span>
            <div className="hero-co-grid">
              <h1 className="display">{t.ui.leaveCv}</h1>
            </div>
            <p className="lede">{t.ui.poolIntro}</p>
          </section>
          <section className="wrap cr-detail">
            <div className="cr-body">
              <p className="intro">{t.ui.dontSeeBody}</p>
              <p>
                <a href={siteLinks.linkedinJobs} className="v3-link" target="_blank" rel="noopener">
                  {t.ui.followLinkedIn}
                </a>
              </p>
            </div>
            <aside className="cr-apply" id="apply">
              <ApplyForm mode="pool" areas={departmentsFrom(jobs)} previewTestMode={previewTestMode} />
            </aside>
          </section>
        </>
      ) : job ? (
        <>
          <section className="wrap hero-co">
            <span className="mono mono-ink kick">
              <Link href="/vacantes" className="cr-back">
                {t.jobs.backToJobs}
              </Link>{" "}
              / <span>{deptName(job.dept)}</span>
            </span>
            <div className="hero-co-grid">
              <h1 className="display">{jobString(job.title, locale)}</h1>
            </div>
            <dl className="co-meta">
              <div>
                <dt>{t.ui.location}</dt>
                <dd>{job.location}</dd>
              </div>
              <div>
                <dt>{t.ui.modeFilter}</dt>
                <dd>{modeName(job.mode)}</dd>
              </div>
              <div>
                <dt>{t.ui.level}</dt>
                <dd>{job.level}</dd>
              </div>
              {job.salary ? (
                <div>
                  <dt>{t.ui.compensation}</dt>
                  <dd>{displaySalary(job.salary, locale)}</dd>
                </div>
              ) : null}
            </dl>
            <a href="#apply" className="btn btn-blue cr-apply-jump" hidden={!showJump}>
              {t.jobs.applyBtn}
            </a>
          </section>

          <section className="wrap cr-detail">
            <div className="cr-body">
              {englishOnly ? <p className="cr-lang-note">{t.ui.englishPosting}</p> : null}
              {jobString(job.description, locale) ? <p className="intro">{jobString(job.description, locale)}</p> : null}
              {jobStrings(job.responsibilities, locale).length > 0 ? (
                <>
                  <h2>{t.jobs.whatYouDo}</h2>
                  <ol className="cr-list">
                    {jobStrings(job.responsibilities, locale).map((item, i) => (
                      <li key={item}>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        {item}
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
              {jobStrings(job.requirements, locale).length > 0 ? (
                <>
                  <h2>{t.jobs.whatWeSeek}</h2>
                  <ol className="cr-list">
                    {jobStrings(job.requirements, locale).map((item, i) => (
                      <li key={item}>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        {item}
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
            </div>
            <aside className="cr-apply" id="apply">
              <ApplyForm mode="job" job={job} areas={departmentsFrom(jobs)} refCode={refCode} previewTestMode={previewTestMode} />
              <div className="cr-share">
                <span>{t.ui.knowSomeone}</span>
                <a href={shareHref || linkedInShareHref(`https://careers.tradingsolutions.com/vacantes/${job.id}`)} target="_blank" rel="noopener">
                  {t.ui.shareLinkedIn}
                </a>
              </div>
            </aside>
          </section>

          {others.length > 0 ? (
            <section className="wrap cr-sec">
              <div className="cr-head">
                <div>
                  <span className="cr-kick">{t.ui.keepExploring}</span>
                  <h2>{t.ui.otherOpenings}</h2>
                </div>
                <Link href="/vacantes" className="v3-link" style={{ marginTop: 0 }}>
                  {t.jobs.viewAll}
                </Link>
              </div>
              <div className="cr-jobs">
                {others.map((other) => (
                  <JobRow key={other.id} job={other} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </Frame>
  );
}
