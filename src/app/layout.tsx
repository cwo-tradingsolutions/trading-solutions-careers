import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { LanguageProvider } from "@/i18n/context";
import "./globals.css";

/**
 * Open Sauce Two is named first in --ts-font. It is not vendored in this
 * repo, so Inter (300/500/600) then system-ui carry the UI until the face
 * is available. Do not claim SF Pro.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Careers — Trading Solutions",
  description: "Únete al equipo que mueve el mundo. Explora oportunidades en Trading Solutions.",
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
