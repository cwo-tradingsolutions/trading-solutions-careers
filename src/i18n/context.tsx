"use client";

import { createContext, useContext, ReactNode } from "react";
import { translations, type Locale, type Translations } from "./translations";

/**
 * El portal público va solo en inglés (ver translations.ts). Se mantiene el
 * contexto para que las páginas sigan leyendo `t` y `locale` (las vacantes
 * traen título y descripción en `es`/`en`) sin cambiar su forma.
 */
interface LanguageContextType {
  locale: Locale;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  return (
    <LanguageContext.Provider value={{ locale: "en", t: translations.en as unknown as Translations }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
