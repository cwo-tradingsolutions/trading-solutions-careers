"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useLanguage } from "@/i18n/context";
import UniverseMark from "./universe/Mark";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t, locale, setLocale } = useLanguage();

  const close = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-ts-hairline bg-ts-canvas">
      <div className="max-w-ts mx-auto px-6 lg:px-8 flex items-center justify-between gap-6" style={{ minHeight: "var(--ts-header)" }}>
        <Link href="/" className="flex items-center gap-3 text-[15px] text-ts-ink">
          <UniverseMark />
          Trading Solutions
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-ts-secondary" aria-label="Primary">
          <Link href="/vacantes" className="hover:text-ts-ink transition-colors">
            {t.nav.roles}
          </Link>
          <Link href="/#life" className="hover:text-ts-ink transition-colors">
            {t.nav.life}
          </Link>
          <Link href="/#process" className="hover:text-ts-ink transition-colors">
            {t.nav.process}
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center rounded-ts-pill bg-ts-surface-2 p-0.5 text-[12px]" aria-label="Language">
            <button
              type="button"
              onClick={() => setLocale("en")}
              className={`px-2.5 py-1 rounded-ts-pill ${locale === "en" ? "bg-ts-surface text-ts-accent" : "text-ts-muted"}`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLocale("es")}
              className={`px-2.5 py-1 rounded-ts-pill ${locale === "es" ? "bg-ts-surface text-ts-accent" : "text-ts-muted"}`}
            >
              ES
            </button>
          </div>
          <Link href="/vacantes" className="pill-btn pill-btn-primary !py-2.5 !px-4 text-sm">
            {t.nav.viewJobs}
          </Link>
          <button type="button" onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-ts-ink" aria-label="Menu">
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-ts-hairline bg-ts-canvas px-6 pb-6 pt-4">
          <div className="flex flex-col gap-4 text-base">
            <Link href="/vacantes" onClick={close}>{t.nav.roles}</Link>
            <Link href="/#life" onClick={close}>{t.nav.life}</Link>
            <Link href="/#process" onClick={close}>{t.nav.process}</Link>
            <div className="flex gap-2 text-sm">
              <button type="button" onClick={() => setLocale("en")} className={locale === "en" ? "text-ts-accent" : "text-ts-muted"}>EN</button>
              <button type="button" onClick={() => setLocale("es")} className={locale === "es" ? "text-ts-accent" : "text-ts-muted"}>ES</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
