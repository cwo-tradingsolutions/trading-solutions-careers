"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/context";
import { UNIVERSE_SIMBOLO } from "@/lib/brand";

/**
 * Pie del preview AJUSTE (pack rev J): marca, Careers, servicios y compañía.
 * Todo enlace va a una sección real o a páginas de tradingsolutions.com
 * verificadas el 27-oct; nada de "#". Sin redes: el sitio corporativo no
 * publica ninguna.
 */
const CORP = "https://tradingsolutions.com";

export default function Footer() {
  const { t } = useLanguage();

  const careers = [
    { label: t.shell.roles, href: "/vacantes" },
    { label: t.pool.cta, href: "/#unete" },
    { label: t.shell.people, href: "/#gente" },
    { label: t.shell.culture, href: "/#cultura" },
    { label: t.nav.hire, href: "/#crecer" },
  ];
  const services = [
    { label: "Maritime", href: `${CORP}/services/maritime` },
    { label: "Ground", href: `${CORP}/services/ground` },
    { label: "Air", href: `${CORP}/services/air` },
    { label: "Customs", href: `${CORP}/services/customs` },
  ];
  const company = [
    { label: "tradingsolutions.com", href: CORP },
    { label: t.footer.about, href: `${CORP}/company/about` },
    { label: t.footer.contact, href: `${CORP}/company/contact` },
  ];

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="foot-grid">
          <div className="foot-brand">
            <div className="wm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={UNIVERSE_SIMBOLO} alt="" width={22} height={22} /> Trading Solutions.
            </div>
            <p>
              {t.footer.tagline} {t.footer.hq}.
            </p>
          </div>
          <div className="foot-col">
            <h4>{t.footer.careers}</h4>
            {careers.map((l) => (
              <Link key={l.href} href={l.href}>{l.label}</Link>
            ))}
          </div>
          <div className="foot-col">
            <h4>{t.footer.services}</h4>
            {services.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener">{l.label}</a>
            ))}
          </div>
          <div className="foot-col">
            <h4>{t.footer.company}</h4>
            {company.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener">{l.label}</a>
            ))}
          </div>
        </div>
        <div className="foot-bottom">
          <span>{t.footer.rights}</span>
          <a href={`${CORP}/company/legal`} target="_blank" rel="noopener">{t.footer.legal}</a>
        </div>
      </div>
    </footer>
  );
}
