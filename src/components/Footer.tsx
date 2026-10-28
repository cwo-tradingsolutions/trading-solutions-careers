"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/context";
import { LOGO_TS } from "@/lib/brand";

/**
 * Light footer, every link live. Corporate links point at the real pages on
 * tradingsolutions.com. No social icons until the company shares real
 * profiles (no href="#").
 */
const CORP = "https://tradingsolutions.com";

export default function Footer() {
  const { t } = useLanguage();

  const services = [
    { label: "Maritime", href: `${CORP}/services/maritime` },
    { label: "Ground", href: `${CORP}/services/ground` },
    { label: "Air", href: `${CORP}/services/air` },
    { label: "Customs", href: `${CORP}/services/customs` },
  ];

  const linkCls = "block text-sm text-ts-muted hover:text-ts-accent transition-colors";

  return (
    <footer className="bg-ts-surface border-t border-[color:var(--ts-line)]">
      <div className="max-w-ts mx-auto px-4 sm:px-6 lg:px-10 py-14 md:py-16">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_TS} alt={t.logoAlt} className="h-7 w-auto mb-5" />
            <p className="text-base text-ts-ink font-medium max-w-xs">{t.footer.tagline}</p>
            <p className="text-sm text-ts-muted mt-2">{t.footer.hq}</p>
            <a href={CORP} target="_blank" rel="noopener noreferrer" className="inline-block mt-4 text-sm font-medium text-ts-accent hover:underline">
              {t.footer.link1}
            </a>
          </div>

          <div className="md:col-span-2">
            <h2 className="text-sm font-medium text-ts-ink mb-4">{t.footer.careersHeading}</h2>
            <div className="space-y-3">
              <Link href="/#why" className={linkCls}>{t.nav.whyUs}</Link>
              <Link href="/vacantes" className={linkCls}>{t.nav.openRoles}</Link>
              <Link href="/#how-we-hire" className={linkCls}>{t.nav.howWeHire}</Link>
              <Link href="/#life" className={linkCls}>{t.nav.lifeHere}</Link>
            </div>
          </div>

          <div className="md:col-span-2">
            <h2 className="text-sm font-medium text-ts-ink mb-4">{t.footer.servicesHeading}</h2>
            <div className="space-y-3">
              {services.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          <div className="md:col-span-3">
            <h2 className="text-sm font-medium text-ts-ink mb-4">{t.footer.companyHeading}</h2>
            <div className="space-y-3">
              <a href={`${CORP}/company/about`} target="_blank" rel="noopener noreferrer" className={linkCls}>{t.footer.about}</a>
              <a href={`${CORP}/company/contact`} target="_blank" rel="noopener noreferrer" className={linkCls}>{t.footer.contact}</a>
              <a href={`${CORP}/company/legal`} target="_blank" rel="noopener noreferrer" className={linkCls}>{t.footer.legalLink}</a>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-[color:var(--ts-line)] flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <p className="text-xs text-ts-muted">{t.footer.legal}</p>
          <p className="text-xs text-ts-muted">{t.footer.servicesLine}</p>
        </div>
      </div>
    </footer>
  );
}
