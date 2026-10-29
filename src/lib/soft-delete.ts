/**
 * Borrado lógico de la Fase 0.
 *
 * Las lecturas y updates de estas tablas esconden las filas con
 * `deleted_at` por defecto. El cliente de Supabase aplica el filtro en
 * `src/lib/supabase.ts`. Para ver o restaurar una fila borrada hay que usar
 * `supabaseFromIncludingDeleted`.
 *
 * La lista tiene que coincidir con las tablas a las que la migración
 * `20261029_fase0_soft_delete.sql` les agrega `deleted_at`. `ts_interviews`
 * no entra: en producción esa tabla no existe.
 */
export const SOFT_DELETE_TABLES: ReadonlySet<string> = new Set([
  "ht_candidates",
  "ht_responses",
  "ht_results",
  "ht_ai_interviews",
  "ht_candidate_stage_events",
  "ht_candidate_tests",
  "ht_candidate_files",
  "ht_candidate_evaluations",
  "ht_contact_events",
  "ht_external_test_results",
  "ts_candidate_experience",
  "ts_cv_bank_matches",
  "ts_interview_decisions",
  "ts_recruiter_assessments",
  "ts_joint_schedulings",
  "ts_reminders_sent",
  "ts_candidate_reminders_paused",
  "ts_bat_sessions",
]);

export const HR_ADMIN_ACTOR = "hr-admin";

type Filterable = {
  is: (column: string, value: null) => unknown;
};

/**
 * Encadena `deleted_at IS NULL` a select, update y delete.
 * insert y upsert no se filtran: una fila nueva nace viva, y el upsert de
 * una pausa tiene que poder limpiar `deleted_at`.
 */
export function hideSoftDeleted<T extends object>(builder: T): T {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === "select" || prop === "update" || prop === "delete") {
        return (...args: unknown[]) => {
          const method = Reflect.get(target, prop, receiver) as (...a: unknown[]) => Filterable;
          const next = method.apply(target, args);
          return next.is("deleted_at", null);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}
