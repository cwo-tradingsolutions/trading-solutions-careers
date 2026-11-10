import type { Metadata } from "next";
import { ogLocale } from "@/i18n/locales";
import { localeFromRequest } from "@/i18n/server-locale";
import { translations } from "@/i18n/translations";

export function generateMetadata(): Metadata {
  const locale = localeFromRequest();
  const meta = translations[locale].meta;
  return {
    title: meta.jobsTitle,
    description: meta.jobsDescription,
    openGraph: {
      title: meta.jobsTitle,
      description: meta.jobsDescription,
      siteName: "Trading Solutions Careers",
      locale: ogLocale(locale),
    },
  };
}

export default function VacantesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
