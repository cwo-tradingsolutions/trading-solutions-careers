import type { Metadata } from "next";
import { LanguageProvider } from "@/i18n/context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Careers — Trading Solutions",
  description: "Únete al equipo que mueve el mundo. Explora oportunidades en Trading Solutions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased font-sans">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
