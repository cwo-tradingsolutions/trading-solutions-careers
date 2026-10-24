"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/context";
import { LOGO_TS, LOGO_TS_CLASE_EN_OSCURO } from "@/lib/brand";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-ts-ink text-white py-16">
      <div className="max-w-ts mx-auto px-6 lg:px-10">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_TS}
              alt="Trading Solutions"
              className={`h-8 w-auto mb-6 ${LOGO_TS_CLASE_EN_OSCURO}`}
            />
            <p className="text-sm text-white/60 leading-relaxed">{t.footer.tagline}</p>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-4">{t.footer.services}</h4>
            <div className="space-y-3">
              <a href="https://tradingsolutions.com" target="_blank" rel="noopener" className="block text-sm text-white/70 hover:text-ts-accent transition-colors">Maritime</a>
              <a href="https://tradingsolutions.com" target="_blank" rel="noopener" className="block text-sm text-white/70 hover:text-ts-accent transition-colors">Ground</a>
              <a href="https://tradingsolutions.com" target="_blank" rel="noopener" className="block text-sm text-white/70 hover:text-ts-accent transition-colors">Air</a>
              <a href="https://tradingsolutions.com" target="_blank" rel="noopener" className="block text-sm text-white/70 hover:text-ts-accent transition-colors">Customs</a>
            </div>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-4">{t.footer.company}</h4>
            <div className="space-y-3">
              <a href="https://tradingsolutions.com" target="_blank" rel="noopener" className="block text-sm text-white/70 hover:text-ts-accent transition-colors">{t.footer.companyAbout}</a>
              <Link href="/" className="block text-sm text-white/70 hover:text-ts-accent transition-colors">{t.footer.companyCareers}</Link>
              <a href="https://tradingsolutions.com" target="_blank" rel="noopener" className="block text-sm text-white/70 hover:text-ts-accent transition-colors">{t.footer.companyContact}</a>
            </div>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-4">{t.footer.followUs}</h4>
            <div className="flex gap-3">
              <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="white" strokeWidth="2"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" stroke="white" strokeWidth="2" fill="none"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-600">&copy; Trading Solutions 2026. {t.footer.rights}</p>
          <div className="flex gap-6">
            <a href="#" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">{t.footer.legal}</a>
            <a href="#" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">{t.footer.privacy}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
