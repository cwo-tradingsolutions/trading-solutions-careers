import { supabaseAdmin } from "@/lib/supabase";
import { fechaIso, MSG_OBJETIVO_SIN_COLUMNA, validarFechasVacante } from "@/lib/vacancy-dates";

export type FechasGuardadas = {
  hr_request_date: string | null;
  target_fill_date: string | null;
  objetivo_columna: boolean;
};

let objetivoCache: boolean | null = null;

/** true solo si ht_vacancy_milestones.target_fill_date ya existe. */
export async function columnaFechaObjetivoExiste(): Promise<boolean> {
  if (objetivoCache !== null) return objetivoCache;
  const probe = await supabaseAdmin
    .from("ht_vacancy_milestones")
    .select("target_fill_date")
    .limit(1);
  objetivoCache = !(probe.error && /target_fill_date|column/i.test(probe.error.message || ""));
  return objetivoCache;
}

export async function validarFechasAts(opening: unknown, target: unknown) {
  return validarFechasVacante(opening, target, await columnaFechaObjetivoExiste());
}

export async function leerFechasVacante(vacancyId: string): Promise<FechasGuardadas> {
  const objetivo_columna = await columnaFechaObjetivoExiste();
  const cols = objetivo_columna ? "hr_request_date, target_fill_date" : "hr_request_date";
  const { data } = await supabaseAdmin
    .from("ht_vacancy_milestones")
    .select(cols)
    .eq("vacancy_id", vacancyId)
    .maybeSingle();
  return {
    hr_request_date: fechaIso((data as { hr_request_date?: string | null } | null)?.hr_request_date),
    target_fill_date: objetivo_columna
      ? fechaIso((data as { target_fill_date?: string | null } | null)?.target_fill_date)
      : null,
    objetivo_columna,
  };
}

export async function guardarFechasVacante(
  vacancyId: string,
  apertura: string,
  objetivo: string | null,
): Promise<{ ok: true; aviso: string | null } | { ok: false; error: string }> {
  const objetivo_columna = await columnaFechaObjetivoExiste();
  const row: Record<string, string> = { hr_request_date: apertura };
  if (objetivo_columna && objetivo) row.target_fill_date = objetivo;

  const existing = await supabaseAdmin
    .from("ht_vacancy_milestones")
    .select("vacancy_id")
    .eq("vacancy_id", vacancyId)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };

  const write = existing.data
    ? await supabaseAdmin.from("ht_vacancy_milestones").update(row).eq("vacancy_id", vacancyId)
    : await supabaseAdmin.from("ht_vacancy_milestones").insert({ vacancy_id: vacancyId, ...row });
  if (write.error) return { ok: false, error: write.error.message };
  return { ok: true, aviso: objetivo_columna ? null : MSG_OBJETIVO_SIN_COLUMNA };
}
