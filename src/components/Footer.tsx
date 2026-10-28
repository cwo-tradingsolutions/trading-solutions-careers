"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/context";
import { LOGO_TS } from "@/lib/brand";

/**
 * Pie claro: la única banda ink de la home es el CTA final. Todos los enlaces
 * van a páginas reales de tradingsolutions.com (verificadas 27-oct). Sin
 * redes sociales: el sitio corporativo no publica ninguna y los íconos con
 * href="#" eran enlaces muertos.
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
  const company = [
    { label: t.footer.about, href: `${CORP}/company/about` },
    { label: t.footer.contact, href: `${CORP}/company/contact` },
    { label: "tradingsolutions.com", href: CORP },
  ];
  const careers = [
    { label: t.nav.roles, href: "/vacantes" },
    { label: t.nav.hire, href: "/#how-we-hire" },
    { label: t.nav.life, href: "/#life-here" },
  ];

  const linkCls = "block text-sm text-ts-muted hover:text-ts-ink transition-colors";

  return (
    <footer className="bg-ts-surface border-t border-[color:var(--ts-line)] pt-16 pb-10">
      <div className="max-w-ts mx-auto px-5 md:px-6 lg:px-10">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-14">
          <div className="col-span-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_TS} alt={t.logoAlt} className="h-7 w-auto mb-6" />
            <p className="text-base text-ts-ink max-w-xs leading-snug">{t.footer.tagline}</p>
            <p className="text-sm text-ts-muted mt-2">{t.footer.hq}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-ts-ink mb-4">{t.footer.careers}</h4>
            <div className="space-y-3">
              {careers.map((l) => (
                <Link key={l.href} href={l.href} className={linkCls}>{l.label}</Link>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-ts-ink mb-4">{t.footer.services}</h4>
            <div className="space-y-3">
              {services.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noopener" className={linkCls}>{l.label}</a>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-ts-ink mb-4">{t.footer.company}</h4>
            <div className="space-y-3">
              {company.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noopener" className={linkCls}>{l.label}</a>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-[color:var(--ts-line)] pt-8 flex flex-col md:flex-row justify-between gap-3">
          <p className="text-xs text-ts-muted">{t.footer.rights}</p>
          <a href={`${CORP}/company/legal`} target="_blank" rel="noopener" className="text-xs text-ts-muted hover:text-ts-ink transition-colors">
            {t.footer.legal}
          </a>
        </div>
      </div>
    </footer>
  );
}
