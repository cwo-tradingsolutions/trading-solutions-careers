/**
 * Resolución job_id (Neon · tabla `vacancies`) → vacancy_id (Supabase · `ht_vacancies`).
 *
 * POR QUÉ VIVE ACÁ
 * Había dos copias del mapa — una en /api/applications y otra en
 * /api/admin/sync-applications-to-funnel — y la del sync se quedó atrás con
 * solo los ids 2-5. Resultado: una aplicación a una vacante nueva entraba bien
 * por el formulario público pero el sync manual la descartaba por "no mapeada".
 * Con un solo módulo no pueden volver a divergir.
 *
 * POR QUÉ HAY UN FALLBACK POR TÍTULO
 * Un mapa de números escritos a mano se rompe solo: cada vacante nueva exige
 * que alguien se acuerde de agregar la línea, y hasta que lo haga las
 * aplicaciones se guardan en Neon pero nunca entran al funnel — en silencio, y
 * al candidato igual le llega el correo de "aplicación recibida". Ya pasó con
 * Full Stack, que compartía el id 6 con una vacante de China y mandaba sus
 * candidatos al funnel equivocado.
 *
 * Si el id no está en el mapa, manda el vínculo de la requisición
 * (ht_requisitions.web_vacancy_id → vacancy_id). El título queda último y
 * solo si ese vínculo no existe y hay un único destino. Buscar por título
 * exige que el título del ATS contenga el de la web: un sufijo de ciudad en
 * la web deja la coincidencia en cero, y el mismo título en varias ciudades
 * deja varias vacantes abiertas. Elegir la primera mezcla postulaciones.
 */
import { supabaseAdmin } from "@/lib/supabase";
import {
  decidirAltaFunnel,
  patronTitulo,
  resolverVacanteCon,
  type ConsultaVacantes,
  type FilaVacante,
  type ResolucionVacante,
  type VacanteResuelta,
} from "./vacancy-resolve";

export { decidirAltaFunnel, patronTitulo, resolverVacanteCon };
export type { ConsultaVacantes, FilaVacante, ResolucionVacante, VacanteResuelta };

export const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

export const VACANCY_MAP: Record<number, string> = {
  // CERRADAS · el mapeo se conserva para que las aplicaciones históricas
  // sigan resolviendo, pero ya no se publican en /careers.
  2: "c25ce70b-9244-4393-aea6-75372a99a6ef", // Inside Sales Support — CERRADA 18-ago-2026
  // Customer Documentation Specialist · reabierta el 8-oct-2026. El id de
  // abril (6e4838dd) quedó cerrado con 181 candidatos; apuntar acá seguía
  // mandando a los nuevos a esa vacante muerta.
  3: "0085656c-c139-4f0c-a462-72c2e751b74f",
  4: "d354c55a-eb1c-4aee-bd02-b0a20162e1f1", // Pricing Junior
  5: "70c39cab-adaf-49a0-b137-29d0ff9b56b0", // Talent Acquisition and Development Lead

  // ─── Wellness ────────────────────────────────────────────────────
  12: "52e41180-79ca-48c5-97d1-f385f4d44dde", // Especialista SIG-SST (Wellness)

  // ─── CHINA · Builder Team (form_template_key='china', country='China') ──
  6: "ac368792-1cde-4afb-9185-24d5b4aa0579", // Customer Documentation and Support (Finance)
  7: "da9ca124-e610-450b-a9f1-56f4a538fd9a", // Operations Executive and Support (Operations)
  8: "81d82ac5-9746-4f80-94d5-4595d09bd7ab", // Overseas Sales Executive and Support (Commercial)
  9: "7350dc25-2791-4a9c-8d30-1c09fe48cbad", // Pricing Executive - Support (Pricing)

  // ─── Producto & Tecnología ──
  // Full Stack Developer Junior. Antes era job_id 6, el mismo que la vacante de
  // China de arriba: sus aplicaciones caían en el funnel equivocado. Se movió a
  // 10 y se resuelve por título — no hace falta configurar nada.
  // Si algún día se quiere fijar el UUID, basta con poner la variable
  // VACANCY_ID_FULLSTACK_JUNIOR y esta línea vuelve a mandar.
  ...(process.env.VACANCY_ID_FULLSTACK_JUNIOR
    ? { 10: String(process.env.VACANCY_ID_FULLSTACK_JUNIOR) }
    : ({} as Record<number, string>)),
};

/**
 * Títulos con los que buscar en ht_vacancies cuando el job_id no está mapeado
 * y tampoco hay un vínculo de requisición. Se comparan con ILIKE, así que
 * alcanza con un fragmento distintivo.
 */
export const TITLE_HINTS: Record<number, string> = {
  3: "customer documentation specialist",
  10: "full stack",
};

type ResultadoLectura = { data: unknown; error: { message: string } | null };

type FiltroLectura = PromiseLike<ResultadoLectura> & {
  eq(columna: string, valor: unknown): FiltroLectura;
  ilike(columna: string, patron: string): FiltroLectura;
  maybeSingle(): Promise<ResultadoLectura>;
};

export type LectorVacantes = {
  from(tabla: string): {
    select(columnas: string): FiltroLectura;
  };
};

function filasDe(data: unknown): FilaVacante[] {
  return Array.isArray(data) ? (data as FilaVacante[]) : [];
}

/**
 * Lecturas que usa el resolvedor. El vínculo se pide a ht_requisitions por
 * web_vacancy_id y client_id; el título, solo como fallback, con un patrón
 * que el ATS tiene que contener.
 */
export function consultaDe(db: LectorVacantes): ConsultaVacantes {
  return {
    async vacantePorId(id) {
      const { data, error } = await db
        .from("ht_vacancies")
        .select("id, title, status, client_id")
        .eq("id", id)
        .maybeSingle();
      if (error) return { fila: null, error: true };
      return { fila: (data as FilaVacante | null) ?? null, error: false };
    },
    async vinculosPorWebJob(jobId) {
      const { data, error } = await db
        .from("ht_requisitions")
        .select("vacancy_id")
        .eq("client_id", TS_CLIENT_ID)
        .eq("web_vacancy_id", jobId);
      if (error) return { vacancyIds: [], error: true };
      return {
        vacancyIds: filasDe(data).map((fila) => (fila as { vacancy_id?: string | null }).vacancy_id ?? null),
        error: false,
      };
    },
    async porTitulo(hint) {
      const { data, error } = await db
        .from("ht_vacancies")
        .select("id, title, status")
        .eq("client_id", TS_CLIENT_ID)
        .ilike("title", patronTitulo(hint));
      if (error) return { filas: [], error: true };
      return { filas: filasDe(data), error: false };
    },
  };
}

/**
 * Resuelve la vacante de una aplicación del formulario público.
 *
 * POR QUÉ EL MAPA YA NO MANDA SOLO
 * El 8 de octubre quince personas aplicaron a Customer Documentation y
 * ninguna apareció en el funnel: el mapa mandaba el job_id 3 a la vacante de
 * abril, cerrada hacía meses, y nadie lo notó porque la aplicación se guardaba
 * igual y al candidato le llegaba su correo de confirmación.
 *
 * Un cargo que se vuelve a abrir nace con otro id, y el mapa se queda con el
 * viejo hasta que alguien se acuerde de editarlo. Si lo que dice el mapa está
 * cerrado y existe una vacante abierta con ese mismo nombre, manda la abierta.
 *
 * POR QUÉ EL VÍNCULO VA ANTES QUE EL TÍTULO
 * Tres cargos de China se llaman OVERSEAS SALES en el ATS y en la web se
 * distinguen por la ciudad. El título de Guangzhou no cabe dentro del título
 * del ATS, así que la búsqueda devuelve cero. El de Shenzhen sí cabe, pero
 * cabe en las tres. La requisición ya guarda web_vacancy_id → vacancy_id;
 * si hay exactamente un destino, es ese. Si no hay vínculo o hay más de uno,
 * no se elige una fila al azar y la aplicación queda en Neon con el fallo
 * visible en el log.
 */
export async function resolverVacanteDetallada(
  jobId: number,
  jobTitle?: string,
  consulta: ConsultaVacantes = consultaDe(supabaseAdmin as unknown as LectorVacantes),
): Promise<ResolucionVacante> {
  let resuelta: ResolucionVacante;
  try {
    resuelta = await resolverVacanteCon(jobId, jobTitle, consulta, VACANCY_MAP, TITLE_HINTS, TS_CLIENT_ID);
  } catch (e: unknown) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`[vacancy-map] fallo resolviendo job_id ${jobId}:`, mensaje);
    return { vacante: null, motivo: `job_id ${jobId}: excepción al resolver (${mensaje})` };
  }
  if (!resuelta.vacante) console.error(`[vacancy-map] ${resuelta.motivo}`);
  else if (resuelta.vacante.aviso) console.warn(`[vacancy-map] ${resuelta.vacante.aviso}`);
  return resuelta;
}

export async function resolverVacante(
  jobId: number,
  jobTitle?: string,
): Promise<VacanteResuelta | null> {
  const resuelta = await resolverVacanteDetallada(jobId, jobTitle);
  return resuelta.vacante;
}

/**
 * Igual que `resolverVacante` pero devolviendo solo el id, para quien no
 * necesita el detalle. Devuelve null si no hay forma de resolverlo — quien
 * llama debe loguearlo, nunca descartar la aplicación en silencio.
 */
export async function resolveVacancyId(
  jobId: number,
  jobTitle?: string,
): Promise<string | null> {
  const r = await resolverVacante(jobId, jobTitle);
  return r?.id ?? null;
}
