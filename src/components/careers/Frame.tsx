"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "@/i18n/context";
import { siteLinks } from "./shared";

export default function Frame({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useLanguage();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const onJobs = pathname.startsWith("/vacantes");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const prev = document.documentElement.lang;
    document.documentElement.lang = locale;
    document.documentElement.classList.add("ts-careers-root");
    const titles: Record<string, string> = {
      "/": locale === "es" ? "Carreras en Trading Solutions" : "Careers — Trading Solutions",
      "/vacantes": locale === "es" ? "Vacantes — Trading Solutions" : "Open positions — Trading Solutions Careers",
    };
    if (titles[pathname]) document.title = titles[pathname];
    return () => {
      document.documentElement.lang = prev;
      document.documentElement.classList.remove("ts-careers-root");
    };
  }, [locale, pathname]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nav = root.querySelector<HTMLElement>(".nav");
    if (!nav) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        nav.classList.toggle("stuck", y > 8);
        const hero = root.querySelector<HTMLElement>(".hero-full, .v3-hero");
        if (hero) nav.classList.toggle("over", y < hero.offsetHeight - 80);
        else nav.classList.remove("over");
        if (reduce) return;
        const nb = nav.getBoundingClientRect().bottom;
        root.querySelectorAll<HTMLElement>(".v3-hero-copy > *").forEach((el) => {
          el.classList.add("ts-fade");
          const k = Math.max(0, Math.min(1, (el.getBoundingClientRect().top - nb + 20) / 40));
          el.style.filter = k < 1 ? `blur(${((1 - k) * 6).toFixed(2)}px)` : "";
        });
        const vh = window.innerHeight;
        root.querySelectorAll<HTMLElement>("[data-par]").forEach((el) => {
          const r = el.parentElement?.getBoundingClientRect();
          if (!r || r.bottom < -200 || r.top > vh + 200) return;
          const off = (r.top + r.height / 2 - vh / 2) / vh;
          const par = parseFloat(el.dataset.par || "0");
          el.style.transform = `translate3d(0,${(off * par * 100).toFixed(2)}px,0)`;
        });
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("keydown", onKey);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pathname]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.01 }
    );
    const watch = () => {
      root.querySelectorAll(".rv:not(.in)").forEach((el) => {
        if (reduce) el.classList.add("in");
        else io.observe(el);
      });
    };
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          const el = entry.target as HTMLElement;
          const raw = el.dataset.count || "";
          const m = raw.match(/([^0-9]*)([0-9.]+)(.*)/);
          if (!m) return;
          const target = parseFloat(m[2]);
          const t0 = performance.now();
          const step = (ts: number) => {
            const p = Math.min(1, (ts - t0) / 1100);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = m[1] + Math.round(target * eased) + m[3];
            if (p < 1) requestAnimationFrame(step);
            else el.textContent = raw;
          };
          requestAnimationFrame(step);
        });
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    root.querySelectorAll("[data-count]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname, locale]);

  return (
    <div className="ts-x has-js" data-lang={locale} ref={rootRef}>
      <header className={`nav${open ? " open" : ""}`} id="nav">
        <div className="wrap nav-in">
          <Link href="/" className="nav-logo" aria-label="Trading Solutions Careers">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo-light" src="/careers/logo-trading-solutions.svg" alt="Trading Solutions" width={198} height={25} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo-dark" src="/careers/logo-trading-solutions-white.svg" alt="" width={198} height={25} aria-hidden="true" />
          </Link>
          <nav className="nav-links" id="nav-links">
            <Link className="nav-a" href="/#culture" onClick={() => setOpen(false)}>
              {t.nav.culture}
            </Link>
            <Link className="nav-a" href="/#areas" onClick={() => setOpen(false)}>
              {t.nav.areas}
            </Link>
            <Link className="nav-a" href="/#experience" onClick={() => setOpen(false)}>
              {t.nav.experience}
            </Link>
            <Link className={`nav-a${onJobs ? " current" : ""}`} href="/vacantes" onClick={() => setOpen(false)}>
              {t.ui.openPositions}
            </Link>
            <div className="nav-mob">
              <a href={siteLinks.about} className="btn btn-line nav-mob-login">
                {t.ui.mainSite}
              </a>
              <span className="nav-mob-note">{t.ui.mainSiteNote}</span>
            </div>
          </nav>
          <div className="nav-right">
            <a href={siteLinks.about} className="btn btn-line">
              {t.ui.mainSite}
            </a>
            <Link href="/vacantes" className="btn btn-dark">
              {t.nav.viewJobs}
            </Link>
            <button
              className="burger"
              aria-label={t.ui.menu}
              aria-expanded={open}
              aria-controls="nav-links"
              onClick={() => setOpen((v) => !v)}
            >
              <span />
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="wrap foot">
        <div className="foot-in">
          <div className="foot-grid">
            <div className="foot-brand">
              <div className="foot-logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/careers/logo-trading-solutions.svg" alt="Trading Solutions" width={238} height={30} />
              </div>
              <p>{t.footer.tagline}</p>
              <div className="foot-social">
                <a href={siteLinks.instagram} target="_blank" rel="noopener" aria-label="Instagram">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.7" />
                    <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.7" />
                    <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" />
                  </svg>
                </a>
                <a href={siteLinks.linkedin} target="_blank" rel="noopener" aria-label="LinkedIn">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4v11H3zM9.5 9.75h3.8v1.5h.06c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.77 2.65 4.77 6.1v5.46h-4v-4.84c0-1.16-.02-2.64-1.61-2.64-1.61 0-1.86 1.26-1.86 2.56v4.92h-4z" />
                  </svg>
                </a>
              </div>
            </div>
            <div className="foot-col">
              <h4 className="mono mono-ink">{t.ui.careersCol}</h4>
              <ul>
                <li><Link href="/#culture">{t.nav.culture}</Link></li>
                <li><Link href="/#areas">{t.nav.areas}</Link></li>
                <li><Link href="/#experience">{t.nav.experience}</Link></li>
                <li><Link href="/vacantes">{t.ui.openPositions}</Link></li>
              </ul>
            </div>
            <div className="foot-col">
              <h4 className="mono mono-ink">{t.ui.solutions}</h4>
              <ul>
                <li><a href={siteLinks.maritime}>{t.ui.maritime}</a></li>
                <li><a href={siteLinks.ground}>{t.ui.ground}</a></li>
                <li><a href={siteLinks.air}>{t.ui.air}</a></li>
                <li><a href={siteLinks.customs}>{t.ui.customs}</a></li>
              </ul>
            </div>
            <div className="foot-col">
              <h4 className="mono mono-ink">{t.footer.company}</h4>
              <ul>
                <li><a href={siteLinks.about}>{t.footer.companyAbout}</a></li>
                <li><Link href="/">{t.footer.companyCareers}</Link></li>
                <li><a href={siteLinks.contact}>{t.footer.companyContact}</a></li>
                <li><a href={siteLinks.legal}>{t.footer.legal}</a></li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <div className="lang">
              <button type="button" className={locale === "es" ? "on" : ""} aria-pressed={locale === "es"} onClick={() => setLocale("es")}>
                ES
              </button>
              <button type="button" className={locale === "en" ? "on" : ""} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
                EN
              </button>
            </div>
            <span className="mono">© Trading Solutions. 2026 — {t.footer.rights}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
