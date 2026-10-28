import type { Metadata } from "next";
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

// Metadatos del portal público (inglés, copy pack Bernabé). HR Admin define
// los suyos en hr-admin/layout.tsx.
const meta = translations.en.meta;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  openGraph: {
    title: meta.ogTitle,
    description: meta.ogDescription,
    type: "website",
    images: [{ url: "/careers/hero-miami-port.jpg", width: 2000, height: 1250 }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased font-sans">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
