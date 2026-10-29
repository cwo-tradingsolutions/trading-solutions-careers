import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@fontsource/open-sauce-two/300.css";
import "@fontsource/open-sauce-two/500.css";
import "@fontsource/open-sauce-two/600.css";
import { LanguageProvider } from "@/i18n/context";
import "./globals.css";

/**
 * Open Sauce Two is loaded for the HR Admin shell (`[data-ui="universe"]`).
 * Public pages keep Inter via --ts-font-sans and font-sans. Do not claim SF Pro.
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
