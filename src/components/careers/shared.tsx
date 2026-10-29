import type { Job } from "@/lib/vacancies-adapter";
import { jobCopyLocale, type Locale } from "@/i18n/locales";
import { translations } from "@/i18n/translations";

export const SITE = "https://tradingsolutions.com";

export const siteLinks = {
  about: `${SITE}/about`,
  maritime: `${SITE}/maritime`,
  ground: `${SITE}/ground`,
  air: `${SITE}/air`,
  customs: `${SITE}/customs`,
  contact: `${SITE}/contact`,
  legal: `${SITE}/legal`,
  linkedinJobs: "https://www.linkedin.com/company/trading-sol/jobs/",
  linkedin: "https://www.linkedin.com/company/trading-sol/",
  instagram: "https://www.instagram.com/tradingsolutions/",
};

export function openingsLabel(n: number, one: string, many: string, none: string) {
  if (n <= 0) return none;
  if (n === 1) return one;
  return many.replace("{n}", String(n));
}

export function departmentsFrom(jobs: Job[]): string[] {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    if (!job.dept) continue;
    counts.set(job.dept, (counts.get(job.dept) || 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => (counts.get(b)! - counts.get(a)!) || a.localeCompare(b));
}

export function deptMatches(jobDept: string, filter: string, label: (dept: string) => string) {
  if (!filter || filter === "all") return true;
  const f = filter.toLowerCase();
  return jobDept.toLowerCase() === f || label(jobDept).toLowerCase() === f;
}

type AreaAltKey = "teamAlt" | "opsAlt" | "techAlt" | "adminAlt";
type AreaVisual = { base: string; widths: number[]; altKey: AreaAltKey };

const FALLBACK: AreaVisual = {
  base: "careers-team",
  widths: [800, 1600, 2400],
  altKey: "teamAlt",
};

export function areaVisual(dept: string): AreaVisual {
  const d = dept.toLowerCase();
  if (/oper/.test(d)) {
    return {
      base: "careers-operations",
      widths: [800, 1600],
      altKey: "opsAlt",
    };
  }
  if (/tec|tech|desarroll|software|it\b/.test(d)) {
    return {
      base: "careers-technology",
      widths: [800, 1600],
      altKey: "techAlt",
    };
  }
  if (/admin|corporat|finanz|finance|people|talent|wellness|human/.test(d)) {
    return {
      base: "careers-administration",
      widths: [800, 1600],
      altKey: "adminAlt",
    };
  }
  return FALLBACK;
}

export function CareerPicture({
  base,
  widths,
  alt,
  sizes,
  priority,
  className,
}: {
  base: string;
  widths: number[];
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const src = (w: number) => `/careers/img/${base}-${w}.webp`;
  const fallback = widths.includes(1600) ? 1600 : widths[widths.length - 1];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={src(fallback)}
      srcSet={widths.map((w) => `${src(w)} ${w}w`).join(", ")}
      sizes={sizes}
      alt={alt}
      decoding={priority ? "sync" : "async"}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
    />
  );
}

export function splitSentence(text: string): [string, string] {
  const i = text.indexOf(". ");
  if (i < 0) return [text, ""];
  return [text.slice(0, i + 1), text.slice(i + 2)];
}

export function splitFreedom(desc: string): [string, string] {
  for (const marker of ["More freedom.", "Más libertad.", "Mais liberdade.", "更多自由。"]) {
    const i = desc.indexOf(marker);
    if (i >= 0) return [desc.slice(0, i + marker.length), desc.slice(i + marker.length).trim()];
  }
  return [desc, ""];
}

/**
 * Accept a LinkedIn profile however it was copied and turn it into a usable URL.
 * The field stays type=text so "linkedin.com/in/perfil" is not rejected by the browser.
 */
/** Known compensation phrases are chrome. Other ranges stay as published. */
export function displaySalary(salary: string, locale: Locale): string {
  const trimmed = salary.trim();
  const phrases = translations[locale].ui;
  if (trimmed === "Competitive (USD)") return phrases.salaryCompetitiveUsd;
  if (trimmed === "Competitive") return phrases.salaryCompetitive;
  if (trimmed === "Negotiable") return phrases.salaryNegotiable;
  return salary;
}

/** Seniority labels stored in English. Unknown values stay as published. */
export function displayLevel(level: string, locale: Locale): string {
  if (level.trim() === "Mid-Level") return translations[locale].ui.levelMid;
  return level;
}

/** City names stored in English. The rest of the location stays as published. */
export function displayLocation(location: string, locale: Locale): string {
  const phrases = translations[locale].ui;
  const trimmed = location.trim();
  if (trimmed === "Panama City, Panama") return `${phrases.cityPanama}, ${phrases.countryPanama}`;
  return location.replaceAll("Panama City", phrases.cityPanama);
}

export function jobString(field: { es: string; en: string }, locale: Locale): string {
  const copy = jobCopyLocale(locale);
  if (copy === "es" && field.es.trim()) return field.es;
  return field.en || field.es;
}

export function jobStrings(field: { es: string[]; en: string[] }, locale: Locale): string[] {
  const copy = jobCopyLocale(locale);
  if (copy === "es" && field.es.length) return field.es;
  return field.en.length ? field.en : field.es;
}

const SPANISH_MARKERS = new Set([
  "de", "la", "el", "que", "en", "los", "las", "para", "con", "una", "por", "del", "al", "su", "se", "un", "y", "como", "más", "esta", "este",
]);

export function looksSpanish(text: string): boolean {
  if (/[áéíóúñü¿¡]/i.test(text)) return true;
  const words = text.toLowerCase().split(/[^a-záéíóúñü]+/).filter(Boolean);
  if (words.length < 8) return false;
  let hits = 0;
  for (const word of words) if (SPANISH_MARKERS.has(word)) hits++;
  return hits >= 4 && hits / words.length >= 0.08;
}

function sectionReadsEnglish(esText: string, enText: string): boolean {
  const es = esText.trim();
  const en = enText.trim();
  if (!es && !en) return true;
  if (!es) return true;
  if (en && es === en) return true;
  return !looksSpanish(es);
}

/**
 * The Spanish UI is showing an English job narrative, so the page should say so.
 * A mixed posting (English intro, Spanish bullets) is shown as stored and is not labeled English-only.
 */
export function postingReadsEnglish(job: Pick<Job, "description" | "responsibilities" | "requirements">): boolean {
  const sections: Array<[string, string]> = [
    [job.description.es, job.description.en],
    [job.responsibilities.es.join(" "), job.responsibilities.en.join(" ")],
    [job.requirements.es.join(" "), job.requirements.en.join(" ")],
  ];
  const present = sections.filter(([es, en]) => es.trim() || en.trim());
  if (!present.length) return false;
  return present.every(([es, en]) => sectionReadsEnglish(es, en));
}

export function linkedInShareHref(jobUrl: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}`;
}

export function normalizarLinkedin(valor: string): string {
  const v = (valor || "").trim().replace(/\s+/g, "");
  if (!v) return "";
  if (!/linkedin\./i.test(v)) {
    const usuario = v.replace(/^\/?(in\/)?/i, "");
    return usuario ? `https://www.linkedin.com/in/${usuario}` : "";
  }
  if (!/^https?:\/\//i.test(v)) return `https://${v}`;
  return v;
}

export function GoArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 9.5L9.5 2.5M9.5 2.5H4M9.5 2.5V8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
