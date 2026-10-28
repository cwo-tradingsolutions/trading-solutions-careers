"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, Globe } from "lucide-react";
import { useLanguage } from "@/i18n/context";
import { LOGO_TS } from "@/lib/brand";

/**
 * Public Careers chrome: white bar, ink lockup, four Bernabé links, one
 * Aqua CTA and a quiet locale label. Not the Universe app chrome — no
 * Workspace|Company switcher, no ⌘K search.
 */
export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const links = [
    { href: "/#why", label: t.nav.whyUs },
    { href: "/vacantes", label: t.nav.openRoles },
    { href: "/#how-we-hire", label: t.nav.howWeHire },
    { href: "/#life", label: t.nav.lifeHere },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[color:var(--ts-line)]">
      <div className="max-w-ts mx-auto px-4 sm:px-6 lg:px-10 h-16 md:h-[72px] flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center shrink-0" aria-label="Trading Solutions Careers home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_TS} alt={t.logoAlt} className="h-6 md:h-7 w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-1" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3.5 py-2 rounded-ts-sm text-[15px] font-medium text-ts-secondary hover:text-ts-ink hover:bg-ts-canvas transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ts-muted px-2.5 py-1 rounded-full border border-[color:var(--ts-line)]"
            aria-label={t.localeAria}
            title={t.localeAria}
          >
            <Globe size={13} aria-hidden />
            {t.localeLabel}
          </span>
          <Link href="/vacantes" className="pill-btn pill-btn-primary !py-2.5 !px-5">
            {t.nav.cta}
          </Link>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="md:hidden -mr-2 p-2 rounded-ts-sm text-ts-ink"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={t.nav.menu}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="md:hidden border-t border-[color:var(--ts-line)] bg-ts-surface h-[calc(100dvh-64px)] px-4 pt-4 pb-8 flex flex-col">
          <nav className="flex flex-col" aria-label="Main">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-4 text-xl font-light tracking-ts-tight text-ts-ink border-b border-[color:var(--ts-line)]"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ts-muted" aria-label={t.localeAria}>
              <Globe size={13} aria-hidden />
              {t.localeLabel}
            </span>
            <Link href="/vacantes" onClick={() => setOpen(false)} className="pill-btn pill-btn-primary flex-1 justify-center">
              {t.nav.cta}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
