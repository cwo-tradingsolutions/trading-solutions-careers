-- NOT APPLIED. This file only rewrites the signature and the WhatsApp
-- greeting inside ts_reminder_rules.templates. It does not change subjects,
-- bodies, stages, or on_exhausted_action.
--
-- WhatsApp greeting (replaces "Soy Kelly…"):
--   ES: Te escribe el Talent Acquisition Team de Trading Solutions
--   EN: The Talent Acquisition Team at Trading Solutions is writing to you
--   PT: A Talent Acquisition Team da Trading Solutions escreve para você
-- The 20260507 seed has ES and EN only, so this UPDATE does not invent a PT body.
-- Idempotent: replace() of a phrase that is already gone is a no-op, and
-- the WHERE skips rows that no longer contain a Kelly greeting.
--
-- Preview counts. Run this SELECT before applying. Each column is the number
-- of leftover occurrences across all rows. On the 20260507 seed (3 scenarios
-- × 3 iterations × ES/EN) the expected counts BEFORE this update are:
--   kelly_signature            18
--   soy_kelly_de                1
--   soy_kelly_de_lower          2
--   this_is_kelly_from          1
--   this_is_kelly_from_lower    2
--   soy_kelly_period            2
--   this_is_kelly_period        2
-- After a successful apply every count is 0.
--
-- SELECT
--   COALESCE(SUM((length(templates::text) - length(replace(templates::text, 'Kelly Castañeda · Trading Solutions', ''))) / length('Kelly Castañeda · Trading Solutions')), 0) AS kelly_signature,
--   COALESCE(SUM((length(templates::text) - length(replace(templates::text, 'Soy Kelly de Trading Solutions', ''))) / length('Soy Kelly de Trading Solutions')), 0) AS soy_kelly_de,
--   COALESCE(SUM((length(templates::text) - length(replace(templates::text, 'soy Kelly de Trading Solutions', ''))) / length('soy Kelly de Trading Solutions')), 0) AS soy_kelly_de_lower,
--   COALESCE(SUM((length(templates::text) - length(replace(templates::text, 'This is Kelly from Trading Solutions', ''))) / length('This is Kelly from Trading Solutions')), 0) AS this_is_kelly_from,
--   COALESCE(SUM((length(templates::text) - length(replace(templates::text, 'this is Kelly from Trading Solutions', ''))) / length('this is Kelly from Trading Solutions')), 0) AS this_is_kelly_from_lower,
--   COALESCE(SUM((length(templates::text) - length(replace(templates::text, 'soy Kelly.', ''))) / length('soy Kelly.')), 0) AS soy_kelly_period,
--   COALESCE(SUM((length(templates::text) - length(replace(templates::text, 'this is Kelly.', ''))) / length('this is Kelly.')), 0) AS this_is_kelly_period
-- FROM ts_reminder_rules;

UPDATE ts_reminder_rules
SET templates = (
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
    templates::text,
    'Kelly Castañeda · Trading Solutions', 'Talent Acquisition Team · Trading Solutions'),
    'Soy Kelly de Trading Solutions', 'Te escribe el Talent Acquisition Team de Trading Solutions'),
    'soy Kelly de Trading Solutions', 'te escribe el Talent Acquisition Team de Trading Solutions'),
    'This is Kelly from Trading Solutions', 'The Talent Acquisition Team at Trading Solutions is writing to you'),
    'this is Kelly from Trading Solutions', 'the Talent Acquisition Team at Trading Solutions is writing to you'),
    'soy Kelly.', 'te escribe el Talent Acquisition Team de Trading Solutions.'),
    'this is Kelly.', 'the Talent Acquisition Team at Trading Solutions is writing to you.')
)::jsonb,
    updated_at = NOW()
WHERE templates::text LIKE '%Kelly Castañeda%'
   OR templates::text LIKE '%Soy Kelly%'
   OR templates::text LIKE '%soy Kelly%'
   OR templates::text LIKE '%This is Kelly%'
   OR templates::text LIKE '%this is Kelly%';
