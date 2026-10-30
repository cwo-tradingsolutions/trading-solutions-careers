/**
 * Public vacancy reads.
 *
 * `vacancies` has salary_range (and sometimes salary_range_en). It does not
 * have a publish-salary flag. salary_public is free text on ht_requisitions,
 * not a column here. Until a real flag exists, anonymous responses omit
 * salary_range and salary_range_en.
 */

/** Sent by HR Admin when it needs the full vacancy list. Absent on the public careers site. */
export const VACANCY_ADMIN_HEADER = "x-hr-admin";

export function vacancyAdminRequested(header: string | null, adminParam: string | null): boolean {
  return header === "1" || adminParam === "1";
}

const SALARY_KEYS = ["salary_range", "salary_range_en"] as const;

export function vacancyPublishesSalary(row: Record<string, unknown>): boolean {
  return row.salary_public === true || row.publish_salary === true;
}

export function forPublicVacancy(row: Record<string, unknown>): Record<string, unknown> {
  if (vacancyPublishesSalary(row)) return { ...row };
  const copy: Record<string, unknown> = { ...row };
  for (const key of SALARY_KEYS) delete copy[key];
  return copy;
}

export function vacancyListQuery(input: {
  admin: boolean;
  status: string | null;
  department: string | null;
}): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  let text = "SELECT * FROM vacancies WHERE 1=1";
  const status = input.admin ? input.status : "open";
  if (status) {
    params.push(status);
    text += ` AND status = $${params.length}`;
  }
  if (input.department) {
    params.push(input.department);
    text += ` AND department = $${params.length}`;
  }
  text += " ORDER BY created_at DESC";
  return { text, params };
}

export function presentVacancyList(
  rows: Record<string, unknown>[],
  admin: boolean,
): Record<string, unknown>[] {
  if (admin) return rows;
  return rows.filter((row) => row.status === "open").map((row) => forPublicVacancy(row));
}

export function presentVacancyDetail(
  row: Record<string, unknown> | undefined,
  admin: boolean,
): { status: 404 } | { status: 200; body: Record<string, unknown> } {
  if (!row) return { status: 404 };
  if (!admin && row.status !== "open") return { status: 404 };
  return { status: 200, body: admin ? { ...row } : forPublicVacancy(row) };
}
