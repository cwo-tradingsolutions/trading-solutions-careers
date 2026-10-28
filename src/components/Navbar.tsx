"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/i18n/context";
import { LOGO_TS } from "@/lib/brand";

/**
 * Barra pública: blanca, con el logotipo completo (símbolo + palabra) como en
 * Universe About. Sin la franja de idioma ink+lima de antes: el portal
 * público va solo en inglés. Sin Workspace|Company ni buscador ⌘K, que son
 * del producto Universe, no del sitio de empleo.
 */
export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useLanguage();

  const links = [
    { href: "/#why", label: t.nav.why },
    { href: "/vacantes", label: t.nav.roles },
    { href: "/#how-we-hire", label: t.nav.hire },
    { href: "/#life-here", label: t.nav.life },
  ];

  return (
    <nav className="sticky top-0 w-full z-50 bg-ts-surface/95 backdrop-blur-md border-b border-[color:var(--ts-line)]">
      <div className="max-w-ts mx-auto px-5 md:px-6 lg:px-10 flex items-center justify-between h-16 md:h-[72px]">
        <Link href="/" className="flex items-center shrink-0" aria-label="Trading Solutions Careers">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_TS} alt={t.logoAlt} className="h-6 md:h-7 w-auto" />
        </Link>
        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3.5 py-2 rounded-ts-sm text-sm font-medium text-ts-muted hover:text-ts-ink hover:bg-ts-canvas transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <Link href="/vacantes" className="pill-btn pill-btn-primary text-sm !py-2.5 !px-5 ml-4">
            {t.nav.cta}
            <ArrowUpRight size={14} strokeWidth={2.5} />
          </Link>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 -mr-2"
          aria-label={t.nav.menu}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {mobileOpen && (
        <div className="md:hidden bg-ts-surface border-t border-[color:var(--ts-line)] px-5 pb-6 pt-3">
          <div className="flex flex-col">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="py-3 text-base font-medium text-ts-ink border-b border-[color:var(--ts-line)]"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/vacantes"
              onClick={() => setMobileOpen(false)}
              className="pill-btn pill-btn-primary text-sm justify-center mt-5"
            >
              {t.nav.cta}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
