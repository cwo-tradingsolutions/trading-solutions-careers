"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useLanguage } from "@/i18n/context";
import { UNIVERSE_SIMBOLO } from "@/lib/brand";

/**
 * Marquee de mercados + pie del shell Universe About (clon de Clara).
 *
 * Las columnas del clon (RMS, Help Desk, Sales Platform…) son herramientas
 * internas y en el clon apuntan a "#"; aquí van las de Careers y las páginas
 * reales de tradingsolutions.com (verificadas 27-oct). Sin redes sociales: el
 * sitio corporativo no publica ninguna.
 */
const CORP = "https://tradingsolutions.com";

export default function Footer() {
  const { t } = useLanguage();

  const careers = [
    { label: t.nav.roles, href: "/vacantes" },
    { label: t.nav.hire, href: "/#how-we-hire" },
    { label: t.nav.life, href: "/#life-here" },
  ];
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

  const track = (hidden: boolean) => (
    <div aria-hidden={hidden || undefined}>
      {t.marquee.map((m) => (
        <Fragment key={m}>
          <span>{m}</span>
          <span className="sep">•</span>{" "}
        </Fragment>
      ))}
    </div>
  );

  return (
    <>
      <div className="marquee" aria-label="Markets">
        <div className="marquee-track">
          {track(false)}
          {track(true)}
        </div>
      </div>

      <footer className="site-footer">
        <div className="footer-inner">
          <div>
            <div className="f-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={UNIVERSE_SIMBOLO} alt="" />
              <span className="wm">Trading Solutions.</span>
            </div>
            <div className="f-brand">
              <p>
                {t.footer.tagline}
                <br />
                {t.footer.hq}
              </p>
            </div>
          </div>
          <div className="f-col">
            <h4>{t.footer.careers}</h4>
            {careers.map((l) => (
              <Link key={l.href} href={l.href}>{l.label}</Link>
            ))}
          </div>
          <div className="f-col">
            <h4>{t.footer.services}</h4>
            {services.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener">{l.label}</a>
            ))}
          </div>
          <div className="f-col">
            <h4>{t.footer.company}</h4>
            {company.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener">{l.label}</a>
            ))}
          </div>
        </div>
        <div className="f-copy">
          <span>{t.footer.rights}</span>
          <a href={`${CORP}/company/legal`} target="_blank" rel="noopener">{t.footer.legal}</a>
        </div>
      </footer>
    </>
  );
}
