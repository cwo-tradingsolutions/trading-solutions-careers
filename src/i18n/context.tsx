"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { translations, type Translations } from "./translations";
import { htmlLang, isLocale, LANG_COOKIE, LANG_STORAGE_KEY, LOCALES, type Locale } from "./locales";

interface LanguageContextType {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

function readStoredLocale(): Locale | null {
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* private mode */
  }
  const match = document.cookie.match(/(?:^|; )ts-lang=([^;]+)/);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function persistLocale(locale: Locale) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, locale);
  } catch {
    /* private mode */
  }
  document.cookie = `${LANG_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.documentElement.lang = htmlLang(locale);
}

export function LanguageProvider({
  children,
  initialLocale = "en",
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(isLocale(initialLocale) ? initialLocale : "en");

  useEffect(() => {
    const saved = readStoredLocale();
    if (!saved) return;
    setLocaleState((current) => (current === saved ? current : saved));
    persistLocale(saved);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const next = LOCALES[(LOCALES.indexOf(prev) + 1) % LOCALES.length];
      persistLocale(next);
      return next;
    });
  }, []);

  const t = translations[locale] as unknown as Translations;

  return (
    <LanguageContext.Provider value={{ locale, t, setLocale, toggleLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
