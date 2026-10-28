"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/i18n/context";
import { UNIVERSE_SIMBOLO } from "@/lib/brand";

/**
 * Chrome Universe About 1:1 (clon de Clara, pack rev F): lockup, toggle
 * Workspace|Company, buscador ⌘K y subnav.
 *
 * En el sitio público el toggle se queda en Company (Workspace es del equipo
 * interno: muestra la nota del clon y vuelve). El buscador sí funciona: busca
 * en las vacantes. La subnav lleva los equivalentes de Careers de
 * About us · Events · Wellness Soon · Brand.
 */
export default function Navbar() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [workspace, setWorkspace] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [pathname]);

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
    if (!workspace) return;
    const id = setTimeout(() => setWorkspace(false), 1800);
    return () => clearTimeout(id);
  }, [workspace]);

  const onRoles = pathname?.startsWith("/vacantes");
  const tabs = [
    { href: "/", label: t.shell.about, on: pathname === "/" && hash !== "#how-we-hire" && hash !== "#life-here" },
    { href: "/vacantes", label: t.nav.roles, on: !!onRoles },
    { href: "/#how-we-hire", label: t.nav.hire, on: pathname === "/" && hash === "#how-we-hire" },
    { href: "/#life-here", label: t.nav.life, on: pathname === "/" && hash === "#life-here" },
  ];

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
            <img src={UNIVERSE_SIMBOLO} alt="" />
            <span className="wm">Trading Solutions.</span>
          </Link>

          <div className="toggle" role="group" aria-label={`${t.shell.workspace} / ${t.shell.company}`}>
            <button type="button" className={workspace ? "is-on" : ""} aria-pressed={workspace} onClick={() => setWorkspace(true)}>
              {t.shell.workspace}
            </button>
            <button type="button" className={workspace ? "" : "is-on"} aria-pressed={!workspace} onClick={() => setWorkspace(false)}>
              {t.shell.company}
            </button>
          </div>
          <div className={`toggle-note${workspace ? " show" : ""}`} role="status">
            {workspace ? t.shell.workspaceNote : ""}
          </div>

          <form className="search" role="search" onSubmit={submit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
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
            <span className="kbd" aria-hidden>⌘</span>
            <span className="kbd" aria-hidden>K</span>
          </form>

          <div className="utils">
            <Link className="meg" href="/vacantes" aria-label={t.shell.announcements} title={t.shell.announcements}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 11v2a1 1 0 0 0 1 1h1l4 4V6L5 10H4a1 1 0 0 0-1 1z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M17.5 6a8 8 0 0 1 0 12" />
              </svg>
              <i className="dot" aria-hidden />
            </Link>
            <span className="avatar" aria-hidden />
          </div>
        </div>
      </header>

      <div className="subnav-wrap">
        <nav className="subnav" aria-label={t.shell.sections}>
          {tabs.map((tab) => (
            <Link key={tab.href} href={tab.href} className={tab.on ? "is-on" : ""} aria-current={tab.on ? "page" : undefined}>
              {tab.label}
            </Link>
          ))}
          <span className="is-soon" aria-disabled="true">
            {t.shell.stories} <span className="soon">{t.shell.soon}</span>
          </span>
        </nav>
      </div>
    </>
  );
}
