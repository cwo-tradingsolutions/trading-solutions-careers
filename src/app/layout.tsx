import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LanguageProvider } from "@/i18n/context";
import { htmlLang, isLocale } from "@/i18n/locales";
import "./globals.css";

export const metadata: Metadata = {
  title: "Careers — Trading Solutions",
  description: "Your next chapter starts here. Join the boutique freight forwarder operating in more than 150 countries.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const raw = cookies().get("ts-lang")?.value;
  const locale = isLocale(raw) ? raw : "en";
  return (
    <html lang={htmlLang(locale)} suppressHydrationWarning>
      <body className="antialiased font-sans">
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
