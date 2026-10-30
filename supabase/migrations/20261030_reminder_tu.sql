-- NOT APPLIED. Rewrites only the Spanish reminder voice inside
-- ts_reminder_rules.templates so the candidate is addressed as tú and the
-- team speaks as "nosotros". It does not change English copy, subjects,
-- stages, or the signature line.
-- Idempotent: each replace() is a no-op once the old phrase is gone.
--
-- Preview (run before applying). On the 20260507 seed each of these is 1,
-- except the substring counts below:
--   te_escribo   3   ("Te escribo desde/para")
--   escribeme    4   ("escríbeme", including "solo escríbeme")
--   quedo_atenta 1
--   mi_radar     1
-- After a successful apply every count is 0.
--
-- SELECT
--   COALESCE(SUM((length(templates::text) - length(replace(templates::text, 'Te escribo', ''))) / length('Te escribo')), 0) AS te_escribo,
--   COALESCE(SUM((length(templates::text) - length(replace(templates::text, 'escríbeme', ''))) / length('escríbeme')), 0) AS escribeme,
--   COALESCE(SUM((length(templates::text) - length(replace(templates::text, 'Quedo atenta', ''))) / length('Quedo atenta')), 0) AS quedo_atenta,
--   COALESCE(SUM((length(templates::text) - length(replace(templates::text, 'mi radar', ''))) / length('mi radar')), 0) AS mi_radar
-- FROM ts_reminder_rules;

UPDATE ts_reminder_rules
SET templates = (
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
  replace(replace(replace(
    templates::text,
    'Vuelvo a escribirte porque sigues en mi radar', 'Volvemos a escribirte porque sigues en nuestro radar'),
    'vuelvo a escribirte de Trading Solutions', 'volvemos a escribirte de Trading Solutions'),
    'en lo que pueda ayudarte para avanzar, escríbeme. Estoy aquí.', 'en lo que podamos ayudarte para avanzar, escríbenos. Estamos aquí.'),
    'Si hay algo en el contenido o en tu agenda que está dificultando, cuéntame y vemos cómo destrabamos.', 'Si hay algo en el contenido o en tu agenda que está dificultando, cuéntanos y vemos cómo destrabamos.'),
    'Si necesitas más tiempo o tienes alguna pregunta antes de continuar, respóndeme y resolvemos juntos.', 'Si necesitas más tiempo o tienes alguna pregunta antes de continuar, respóndenos y resolvemos juntos.'),
    'Si decidiste no seguir, solo confírmame por aquí.', 'Si decidiste no seguir, solo confírmanos por aquí.'),
    'Solo quería asegurarme', 'Solo queríamos asegurarnos'),
    'estoy disponible cuando quieras', 'estamos disponibles cuando quieras'),
    'Quedo atenta,', 'Quedamos atentos,'),
    'Quería confirmar', 'Queríamos confirmar'),
    'quería confirmar', 'queríamos confirmar'),
    'Quería saber', 'Queríamos saber'),
    'quería saber', 'queríamos saber'),
    'Te escribo desde', 'Te escribimos desde'),
    'Te escribo para recordarte', 'Te escribimos para recordarte'),
    'Te escribo para avanzar', 'Te escribimos para avanzar'),
    'Cualquier duda me cuentas', 'Cualquier duda nos cuentas'),
    'escríbeme y vemos', 'escríbenos y vemos'),
    'solo escríbeme', 'solo escríbenos'),
    'escríbeme respondiendo', 'escríbenos respondiendo'),
    'escríbeme.', 'escríbenos.'),
    '¿Hay algo en lo que pueda ayudarte?', '¿Hay algo en lo que podamos ayudarte?'),
    'Te recuerdo', 'Te recordamos')
)::jsonb,
    updated_at = NOW()
WHERE templates::text LIKE '%Te escribo%'
   OR templates::text LIKE '%escríbeme%'
   OR templates::text LIKE '%Quedo atenta%'
   OR templates::text LIKE '%mi radar%'
   OR templates::text LIKE '%vuelvo a escribirte%'
   OR templates::text LIKE '%Vuelvo a escribirte%'
   OR templates::text LIKE '%estoy disponible%'
   OR templates::text LIKE '%cuéntame%'
   OR templates::text LIKE '%respóndeme%'
   OR templates::text LIKE '%confírmame%'
   OR templates::text LIKE '%Te recuerdo%'
   OR templates::text LIKE '%pueda ayudarte%'
   OR templates::text LIKE '%Quería %'
   OR templates::text LIKE '%quería %';
