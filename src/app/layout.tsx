import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import { LanguageProvider } from "@/i18n/context";
import { htmlLang, isLocale } from "@/i18n/locales";
import "./globals.css";

/**
 * Inter stays the Universe face for HR Admin (via --font-inter).
 * The public Careers shell uses Open Sauce Two, loaded in globals.css
 * and scoped under .ts-x. Default language is English.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Careers — Trading Solutions",
  description:
    "Your next chapter starts here. Join the boutique freight forwarder operating in more than 150 countries.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const raw = cookies().get("ts-lang")?.value;
  const locale = isLocale(raw) ? raw : "en";
  return (
    <html lang={htmlLang(locale)} className={inter.variable} suppressHydrationWarning>
      <body className="antialiased font-sans">
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
