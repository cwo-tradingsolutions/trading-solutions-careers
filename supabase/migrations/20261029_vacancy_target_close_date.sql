-- ARCHIVO SOLAMENTE. No aplicar a producción ni a ninguna base real desde el agente.
-- Staging: correr a mano cuando se vaya a probar el cierre objetivo.
--
-- Fecha de apertura: NO se crea columna.
--   ATS  → ht_vacancy_milestones.hr_request_date (ya existe)
--   Web  → vacancies.posted_at (ya existe)
-- Fecha de cierre objetivo: no había columna. Se agrega y el API solo la
-- exige cuando esta migración ya corrió.

ALTER TABLE ht_vacancy_milestones
  ADD COLUMN IF NOT EXISTS target_fill_date DATE;

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS target_close_date DATE;

COMMENT ON COLUMN ht_vacancy_milestones.target_fill_date IS
  'Fecha de cierre objetivo de la vacante del ATS. Obligatoria al crear o editar solo si esta columna ya existe.';

COMMENT ON COLUMN vacancies.target_close_date IS
  'Fecha de cierre objetivo de la vacante publicada. Obligatoria al crear o editar solo si esta columna ya existe.';
