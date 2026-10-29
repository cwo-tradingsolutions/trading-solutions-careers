import { cookies } from "next/headers";
import { isLocale, type Locale } from "./locales";

/** First visit, and any request without a saved choice, is English. No Accept-Language. */
export function localeFromRequest(): Locale {
  const raw = cookies().get("ts-lang")?.value;
  return isLocale(raw) ? raw : "en";
}
