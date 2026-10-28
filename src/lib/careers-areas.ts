import type { Job } from "@/data/jobs";

/**
 * The three public teams on Careers (Operations · Corporate · Commercial).
 *
 * Vacancies carry free-text departments from the ATS, in Spanish or English
 * ("Operaciones", "Administration", "Technology"…). This folds them into the
 * three public areas so the home counts and the /vacantes filter come from the
 * same data — never hardcoded numbers.
 */
export type AreaKey = "operations" | "corporate" | "commercial";

export const AREA_KEYS: AreaKey[] = ["operations", "corporate", "commercial"];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const OPERATIONS = ["operaciones", "operations", "ops", "pricing", "customs", "aduanas", "logistica", "logistics"];
const COMMERCIAL = ["comercial", "commercial", "sales", "ventas", "inside sales", "marketing", "customer service", "servicio al cliente"];

export function areaOf(dept: string): AreaKey {
  const d = norm(dept || "");
  if (OPERATIONS.some((k) => d === k || d.startsWith(k))) return "operations";
  if (COMMERCIAL.some((k) => d === k || d.startsWith(k))) return "commercial";
  // Finance, people/talent/wellness, technology/systems, administration…
  return "corporate";
}

export function countByArea(jobs: Job[]): Record<AreaKey, number> {
  const out: Record<AreaKey, number> = { operations: 0, corporate: 0, commercial: 0 };
  for (const j of jobs) out[areaOf(j.dept)] += 1;
  return out;
}

export function isAreaKey(v: string | null | undefined): v is AreaKey {
  return v === "operations" || v === "corporate" || v === "commercial";
}
