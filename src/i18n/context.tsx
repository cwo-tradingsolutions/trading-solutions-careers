"use client";

import { createContext, useContext, ReactNode } from "react";
import { translations, type Locale, type Translations } from "./translations";

/**
 * Public Careers ships one language per view. This release is English only
 * (Bernabé copy pack). The provider stays so a future locale can be added
 * as a full, reviewed string set — not mixed in string by string.
 */
interface LanguageContextType {
  locale: Locale;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale: Locale = "en";
  return (
    <LanguageContext.Provider value={{ locale, t: translations[locale] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
