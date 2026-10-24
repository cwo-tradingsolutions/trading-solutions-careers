"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/context";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-ts-hairline">
      <div className="max-w-ts mx-auto px-6 lg:px-8 py-6 flex flex-col sm:flex-row justify-between gap-3 text-xs text-ts-muted">
        <span>Trading Solutions · {t.footer.companyCareers}</span>
        <div className="flex gap-4">
          <a href="https://tradingsolutions.com" target="_blank" rel="noopener" className="hover:text-ts-ink">
            {t.footer.companyAbout}
          </a>
          <Link href="/vacantes" className="hover:text-ts-ink">
            {t.nav.roles}
          </Link>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
