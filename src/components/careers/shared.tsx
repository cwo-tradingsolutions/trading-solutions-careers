import type { Job } from "@/lib/vacancies-adapter";
import type { Locale } from "@/i18n/translations";

export const SITE = "https://tradingsolutions.com";

export const siteLinks = {
  about: `${SITE}/company/about`,
  maritime: `${SITE}/services/maritime`,
  ground: `${SITE}/services/ground`,
  air: `${SITE}/services/air`,
  customs: `${SITE}/services/customs`,
  contact: `${SITE}/company/contact`,
  legal: `${SITE}/company/legal`,
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

type AreaVisual = { base: string; widths: number[]; alt: Record<Locale, string> };

const FALLBACK: AreaVisual = {
  base: "careers-team",
  widths: [800, 1600, 2400],
  alt: {
    en: "A team working together in an open office",
    es: "Un equipo trabajando junto en una oficina abierta",
  },
};

export function areaVisual(dept: string): AreaVisual {
  const d = dept.toLowerCase();
  if (/oper/.test(d)) {
    return {
      base: "careers-operations",
      widths: [800, 1600],
      alt: {
        en: "Operations specialist beside containers at a terminal",
        es: "Especialista de operaciones junto a contenedores en una terminal",
      },
    };
  }
  if (/tec|tech|desarroll|software|it\b/.test(d)) {
    return {
      base: "careers-technology",
      widths: [800, 1600],
      alt: {
        en: "Team reviewing work together on a laptop",
        es: "Equipo revisando un trabajo juntos en un computador",
      },
    };
  }
  if (/admin|corporat|finanz|finance|people|talent|wellness|human/.test(d)) {
    return {
      base: "careers-administration",
      widths: [800, 1600],
      alt: {
        en: "Colleagues working at their desks in the office",
        es: "Compañeros trabajando en sus escritorios en la oficina",
      },
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
  for (const marker of ["More freedom.", "Más libertad."]) {
    const i = desc.indexOf(marker);
    if (i >= 0) return [desc.slice(0, i + marker.length), desc.slice(i + marker.length).trim()];
  }
  return [desc, ""];
}

/**
 * Accept a LinkedIn profile however it was copied and turn it into a usable URL.
 * The field stays type=text so "linkedin.com/in/perfil" is not rejected by the browser.
 */
const SALARY_ES: Record<string, string> = {
  "Competitive (USD)": "Competitiva (USD)",
  Competitive: "Competitiva",
  Negotiable: "A convenir",
};

/** Known compensation phrases are chrome. Other ranges stay as published. */
export function displaySalary(salary: string, locale: Locale): string {
  const trimmed = salary.trim();
  if (locale === "es" && SALARY_ES[trimmed]) return SALARY_ES[trimmed];
  return salary;
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

/** Spanish UI is showing an English job narrative, so the page should say so. */
export function postingReadsEnglish(esText: string, enText: string): boolean {
  const es = esText.trim();
  const en = enText.trim();
  if (!es && !en) return false;
  if (es && en && es === en) return true;
  return es.length > 0 && !looksSpanish(es);
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
