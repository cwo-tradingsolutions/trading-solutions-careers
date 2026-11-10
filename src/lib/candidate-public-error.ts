/**
 * Respuestas de rutas públicas. El candidato nunca ve el texto de la base.
 * El error real se queda en el log del servidor.
 */

export const CANDIDATE_MAIL = "jointheteam@tradingsolutions.com";

export const SURVEY_LOAD_ES = `No pudimos cargar la encuesta. Escríbenos a ${CANDIDATE_MAIL}`;
export const SURVEY_LOAD_EN = `We couldn't load the survey. Write to us at ${CANDIDATE_MAIL}`;
export const SURVEY_SEND_ES = `No pudimos enviar la encuesta. Escríbenos a ${CANDIDATE_MAIL}`;
export const SURVEY_SEND_EN = `We couldn't send the survey. Write to us at ${CANDIDATE_MAIL}`;
export const STEP_ES = `No pudimos completar este paso. Escríbenos a ${CANDIDATE_MAIL}`;
export const STEP_EN = `We couldn't complete this step. Write to us at ${CANDIDATE_MAIL}`;

export function surveyLoadBody() {
  return { error: SURVEY_LOAD_ES, error_en: SURVEY_LOAD_EN };
}

export function surveySendBody() {
  return { error: SURVEY_SEND_ES, error_en: SURVEY_SEND_EN };
}

export function publicStepBody() {
  return { error: STEP_ES, error_en: STEP_EN };
}

type DbError = { code?: string; message?: string } | null | undefined;

/**
 * Postgres 42703, o el aviso de PostgREST cuando la columna no está en el schema.
 * En el select de la encuesta la única columna que puede faltar es vacancy_id.
 */
export function shouldDropVacancyId(error: DbError): boolean {
  if (!error) return false;
  const message = error.message || "";
  const namesColumn = /vacancy_id/i.test(message);
  if (error.code === "42703") return true;
  if (error.code === "PGRST204" && namesColumn) return true;
  return namesColumn && /does not exist|schema cache|could not find|42703/i.test(message);
}
