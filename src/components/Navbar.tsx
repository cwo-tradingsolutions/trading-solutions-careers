"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/i18n/context";
import LanguageBanner from "./LanguageBanner";
import { LOGO_TS_SIMBOLO } from "@/lib/brand";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <>
      <LanguageBanner />
      <nav className="fixed top-8 w-full z-50 bg-ts-surface/90 backdrop-blur-md border-b border-[color:var(--ts-line)] transition-all">
        <div className="max-w-ts mx-auto px-6 lg:px-10 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_TS_SIMBOLO}
              alt="Trading Solutions"
              className="h-8 w-auto"
            />
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link href="/#culture" className="text-sm font-medium text-ts-secondary hover:text-ts-accent transition-colors">
              {t.nav.culture}
            </Link>
            <Link href="/#departments" className="text-sm font-medium text-ts-secondary hover:text-ts-accent transition-colors">
              {t.nav.areas}
            </Link>
            <Link href="/#experience" className="text-sm font-medium text-ts-secondary hover:text-ts-accent transition-colors">
              {t.nav.experience}
            </Link>
            <Link href="/vacantes" className="pill-btn pill-btn-primary text-sm !py-2.5 !px-5">
              {t.nav.viewJobs}
              <ArrowUpRight size={14} strokeWidth={2.5} />
            </Link>
          </div>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2">
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        {mobileOpen && (
          <div className="md:hidden bg-ts-surface border-t border-[color:var(--ts-line)] px-6 pb-6 pt-4">
            <div className="flex flex-col gap-4">
              <Link href="/#culture" onClick={() => setMobileOpen(false)} className="text-base font-medium text-ts-secondary">
                {t.nav.culture}
              </Link>
              <Link href="/#departments" onClick={() => setMobileOpen(false)} className="text-base font-medium text-ts-secondary">
                {t.nav.areas}
              </Link>
              <Link href="/#experience" onClick={() => setMobileOpen(false)} className="text-base font-medium text-ts-secondary">
                {t.nav.experience}
              </Link>
              <Link href="/vacantes" onClick={() => setMobileOpen(false)} className="pill-btn pill-btn-primary text-sm justify-center mt-2">
                {t.nav.viewJobs}
              </Link>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
