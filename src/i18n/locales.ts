export const LOCALES = ["en", "es", "zh-CN", "pt-BR"] as const;

export type Locale = (typeof LOCALES)[number];

export const LANG_STORAGE_KEY = "ts-lang";
export const LANG_COOKIE = "ts-lang";

export const LOCALE_CHOICES: { id: Locale; label: string; htmlLang: string }[] = [
  { id: "en", label: "EN", htmlLang: "en" },
  { id: "es", label: "ES", htmlLang: "es" },
  { id: "zh-CN", label: "中文", htmlLang: "zh-CN" },
  { id: "pt-BR", label: "PT", htmlLang: "pt-BR" },
];

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "es" || value === "zh-CN" || value === "pt-BR";
}

export function htmlLang(locale: Locale): string {
  return LOCALE_CHOICES.find((choice) => choice.id === locale)?.htmlLang ?? "en";
}

export function ogLocale(locale: Locale): string {
  if (locale === "zh-CN") return "zh_CN";
  if (locale === "pt-BR") return "pt_BR";
  if (locale === "es") return "es_ES";
  return "en_US";
}

/** Job copy from the API is only stored in Spanish and English. */
export function jobCopyLocale(locale: Locale): "es" | "en" {
  return locale === "es" ? "es" : "en";
}
