-- NOT APPLIED. Rewrites the reminder voice inside ts_reminder_rules.templates.
-- Spanish addresses the candidate as tú and the team as "nosotros".
-- English drops first person ("Let me know", "I'm available") for the team
-- ("Let us know", "We're available"). It does not change subjects, stages,
-- or the signature line.
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
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
  replace(replace(replace(replace(replace(
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
    'Te recuerdo', 'Te recordamos'),
    'anything I can help with to move forward, just write. I''m here.', 'anything we can help with to move forward, just write. We''re here.'),
    'you''re still on my radar', 'you''re still on our radar'),
    'I''m available whenever you''d like to talk.', 'We''re available whenever you''d like to talk.'),
    'Let me know if you have any questions.', 'Let us know if you have any questions.'),
    'let me know and we''ll figure it out.', 'let us know and we''ll figure it out.'),
    'just message me back', 'just message us back'),
    'Anything I can help with?', 'Anything we can help with?'),
    'Just wanted to make sure you received', 'We just wanted to make sure you received'),
    'Wanted to confirm you received', 'We wanted to confirm you received'),
    'Happy to address any question', 'We''re happy to address any question'),
    'Wanted to check if you ran into', 'We wanted to check if you ran into'),
    ', wanted to check if you had a chance', ', we wanted to check if you had a chance')
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
   OR templates::text LIKE '%quería %'
   OR templates::text LIKE '%Let me know%'
   OR templates::text LIKE '%let me know%'
   OR templates::text LIKE '%on my radar%'
   OR templates::text LIKE '%I''m available%'
   OR templates::text LIKE '%I''m here.%'
   OR templates::text LIKE '%message me back%'
   OR templates::text LIKE '%I can help%'
   OR templates::text LIKE '%Just wanted to make sure%'
   OR templates::text LIKE '%Wanted to confirm you received%'
   OR templates::text LIKE '%Happy to address any question%'
   OR templates::text LIKE '%Wanted to check if you ran into%'
   OR templates::text LIKE '%, wanted to check if you had a chance%';
