import { departments, modes, type Job } from "@/data/jobs";

export type { Job };

/**
 * ETAPA 1 — Unificación de fuente de datos.
 * Este adapter mapea filas de la tabla `vacancies` (Neon, vía GET /api/vacancies)
 * al shape `Job` que consumen las páginas públicas de vacantes.
 * Public views show a retry state if the live feed is unavailable.
 */

// Convierte un array jsonb (si viene) o un texto ";"-separado en string[].
function toArr(jsonbVal: unknown, textVal: unknown): string[] {
  if (Array.isArray(jsonbVal)) {
    return jsonbVal.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof jsonbVal === "string" && jsonbVal.trim()) {
    // A veces el jsonb llega serializado como string
    try {
      const parsed = JSON.parse(jsonbVal);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch {
      /* no era JSON; se trata más abajo como texto */
    }
  }
  if (typeof textVal === "string") {
    return textVal
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

// Fila cruda de la BD (columnas relevantes). Campos opcionales para robustez.
type VacancyRow = Record<string, any>;

export function mapRowToJob(row: VacancyRow): Job {
  return {
    id: Number(row.id),
    slug: row.slug || "",
    linkedinUrl: row.linkedin_url || "",
    title: {
      es: row.title_es || row.title || "",
      en: row.title_en || "Open role",
    },
    dept: row.department || "",
    location: row.location || "",
    mode: (row.work_mode || "Presencial") as Job["mode"],
    level: (row.level || "Junior") as Job["level"],
    salary: row.salary_range || "",
    tags: (row.tags || "")
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean),
    description: {
      es: row.description_es || row.description || "",
      en: row.description_en || "",
    },
    responsibilities: {
      es: toArr(row.responsibilities_es, row.responsibilities),
      en: toArr(row.responsibilities_en, null),
    },
    requirements: {
      es: toArr(row.requirements_es, row.requirements),
      en: toArr(row.requirements_en, null),
    },
    applyEmail: row.apply_email || "jointheteam@tradingsolutions.com",
    postedAt: row.posted_at || "",
  };
}

// Ordena por postedAt desc (más reciente primero). Vacías al final.
function byPostedAtDesc(a: Job, b: Job): number {
  if (!a.postedAt && !b.postedAt) return 0;
  if (!a.postedAt) return 1;
  if (!b.postedAt) return -1;
  return a.postedAt < b.postedAt ? 1 : a.postedAt > b.postedAt ? -1 : 0;
}

export async function fetchOpenJobs(): Promise<Job[]> {
  try {
    const res = await fetch("/api/vacancies?status=open");
    if (!res.ok) throw new Error(`GET /api/vacancies -> ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("Respuesta inesperada de /api/vacancies");
    const mapped = rows.map(mapRowToJob);
    return mapped.sort(byPostedAtDesc);
  } catch (err) {
    throw new Error("Open roles could not be loaded.", { cause: err });
  }
}

// Opciones de filtro derivadas de la data cargada (únicos), con fallback a consts.
export function deriveDepartments(list: Job[]): string[] {
  const unique = Array.from(new Set(list.map((j) => j.dept).filter(Boolean)));
  return unique.length > 0 ? unique : [...departments];
}

export function deriveModes(list: Job[]): string[] {
  const unique = Array.from(new Set(list.map((j) => j.mode).filter(Boolean)));
  return unique.length > 0 ? unique : [...modes];
}
