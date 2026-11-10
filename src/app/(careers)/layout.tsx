import type { Metadata } from "next";
import { ogLocale } from "@/i18n/locales";
import { localeFromRequest } from "@/i18n/server-locale";
import { translations } from "@/i18n/translations";
import "@/styles/ximena.css";
import "@/styles/ximena-extras.css";

export function generateMetadata(): Metadata {
  const locale = localeFromRequest();
  const meta = translations[locale].meta;
  return {
    title: meta.homeTitle,
    description: meta.homeDescription,
    openGraph: {
      title: meta.homeTitle,
      description: meta.homeDescription,
      images: ["/careers/img/careers-hero-1600.webp"],
      siteName: "Trading Solutions Careers",
      locale: ogLocale(locale),
    },
    icons: {
      icon: "/careers/logo-ts.png",
      apple: "/careers/logo-ts.png",
    },
  };
}

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preload" href="/fonts/OpenSauceTwo-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      {children}
    </>
  );
}
