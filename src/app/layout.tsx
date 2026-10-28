import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { LanguageProvider } from "@/i18n/context";
import { translations } from "@/i18n/translations";
import "./globals.css";

/**
 * Open Sauce Two is not vendored here. Inter is the Universe stand-in,
 * with system-ui behind it via --ts-font-sans. Do not claim SF Pro.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

const m = translations.en.meta;

export const metadata: Metadata = {
  metadataBase: new URL("https://trading-solutions-careers.vercel.app"),
  title: m.title,
  description: m.description,
  openGraph: {
    title: m.ogTitle,
    description: m.ogDescription,
    type: "website",
    siteName: "Trading Solutions Careers",
    images: [{ url: "/careers/hero-miami-port.webp", width: 2000, height: 1250 }],
  },
  twitter: {
    card: "summary_large_image",
    title: m.ogTitle,
    description: m.ogDescription,
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased font-sans">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
