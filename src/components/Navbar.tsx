"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/i18n/context";
import { UNIVERSE_SIMBOLO } from "@/lib/brand";

/**
 * Chrome Universe × Careers (preview AJUSTE de Clara, pack rev J): lockup,
 * toggle Workspace|Company, buscador ⌘K y subnav de 6 pills.
 *
 * En el sitio público el toggle se queda en Company: Workspace muestra el
 * aviso del preview y no cambia nada. El buscador sí funciona (busca en
 * /vacantes). Las pills apuntan a las secciones de la home con los mismos
 * anclajes del preview; en la home, la pill activa sigue el scroll.
 */
const SECTIONS = ["inicio", "cultura", "gente", "crecer", "vacantes", "unete"] as const;
type Section = (typeof SECTIONS)[number];

export default function Navbar() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState<Section>("inicio");
  const [tip, setTip] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const home = pathname === "/";

  // Pill activa según la sección visible (mismo rootMargin del preview).
  useEffect(() => {
    if (!home || !("IntersectionObserver" in window)) return;
    const els = SECTIONS.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id as Section);
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [home]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!tip) return;
    const id = setTimeout(() => setTip(false), 2200);
    return () => clearTimeout(id);
  }, [tip]);

  const labels: Record<Section, string> = {
    inicio: t.shell.home,
    cultura: t.shell.culture,
    gente: t.shell.people,
    crecer: t.shell.grow,
    vacantes: t.shell.roles,
    unete: t.shell.join,
  };
  const current: Section | null = home ? active : pathname?.startsWith("/vacantes") ? "vacantes" : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = q.trim();
    router.push(s ? `/vacantes?q=${encodeURIComponent(s)}` : "/vacantes");
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/" aria-label={t.logoAlt}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={UNIVERSE_SIMBOLO} alt="" width={26} height={26} />
            <span className="wm">Trading Solutions.</span>
          </Link>

          <div className="toggle" role="group" aria-label={`${t.shell.workspace} / ${t.shell.company}`}>
            <button type="button" aria-pressed={false} onClick={() => setTip(true)}>
              {t.shell.workspace}
            </button>
            <button type="button" className="is-on" aria-pressed>
              {t.shell.company}
            </button>
            <div className={`toggle-tip${tip ? " show" : ""}`} role="status">
              {tip ? t.shell.workspaceTip : ""}
            </div>
          </div>

          <form className="search" role="search" onSubmit={submit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.shell.searchPlaceholder}
              aria-label={t.shell.searchLabel}
            />
            <span className="kbd" aria-hidden>⌘ K</span>
          </form>

          <div className="utils">
            <Link className="meg" href="/vacantes" aria-label={t.shell.announcements} title={t.shell.announcements}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1z" />
                <path d="M16 8.5a4.5 4.5 0 010 7" />
                <path d="M18.5 6a8 8 0 010 12" />
              </svg>
              <span className="dot" aria-hidden />
            </Link>
            <span className="avatar" aria-hidden />
          </div>
        </div>
      </header>

      <nav className="subnav-wrap" aria-label={t.shell.sections}>
        <div className="subnav">
          {SECTIONS.map((id) => (
            <Link
              key={id}
              href={id === "inicio" ? "/" : `/#${id}`}
              className={current === id ? "is-on" : ""}
              aria-current={current === id ? "location" : undefined}
              onClick={() => home && setActive(id)}
            >
              {labels[id]}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
