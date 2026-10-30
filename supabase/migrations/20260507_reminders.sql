-- ─────────────────────────────────────────────────────────────────
--  Sistema de recordatorios semi-auto · TS Talento
--  9 templates (3 escenarios × 3 iteraciones) en español + inglés.
--  Cron cada 6h crea drafts en Gmail. Helper para WhatsApp click-to-send.
-- ─────────────────────────────────────────────────────────────────

-- 1. Reglas por escenario (1 row por escenario · A/B/C)
CREATE TABLE IF NOT EXISTS ts_reminder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_key TEXT UNIQUE NOT NULL,        -- 'prefilter_pending' | 'assessment_pending' | 'offer_pending'
  scenario_label TEXT NOT NULL,             -- "Prefiltro pendiente"
  stage_codes TEXT[] NOT NULL,              -- stages que disparan este escenario
  active BOOLEAN DEFAULT TRUE,
  reminder_days INTEGER[] NOT NULL,         -- [3, 5, 7] = A1 día 3, A2 día 5, A3 día 7
  max_iterations INTEGER NOT NULL DEFAULT 3,
  -- Templates: { "1": { "es": { ...email/wa fields }, "en": { ... } }, "2": { ... }, "3": { ... } }
  templates JSONB NOT NULL,
  -- Acción cuando se agotaron los recordatorios sin respuesta
  on_exhausted_action TEXT DEFAULT 'mark_paused' CHECK (on_exhausted_action IN ('mark_paused', 'mark_rejected', 'noop')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Log de recordatorios enviados (evita duplicados)
CREATE TABLE IF NOT EXISTS ts_reminders_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ht_candidates(id) ON DELETE CASCADE,
  scenario_key TEXT NOT NULL,
  iteration INTEGER NOT NULL,                -- 1, 2 o 3
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'in_app')),
  language TEXT NOT NULL CHECK (language IN ('es', 'en')),
  draft_id TEXT,                             -- gmail draft id si channel=email
  preview_text TEXT,                         -- primeros 200 chars de lo enviado
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (candidate_id, scenario_key, iteration, channel)
);

CREATE INDEX IF NOT EXISTS idx_reminders_sent_candidate ON ts_reminders_sent(candidate_id);
CREATE INDEX IF NOT EXISTS idx_reminders_sent_scenario ON ts_reminders_sent(scenario_key, iteration);

-- 3. Pausa por candidato (override · ej: candidato de viaje)
CREATE TABLE IF NOT EXISTS ts_candidate_reminders_paused (
  candidate_id UUID PRIMARY KEY REFERENCES ht_candidates(id) ON DELETE CASCADE,
  paused_until TIMESTAMPTZ NOT NULL,
  reason TEXT,
  paused_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Idioma preferido del candidato (si no existe la columna)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ht_candidates' AND column_name = 'preferred_language'
  ) THEN
    ALTER TABLE ht_candidates ADD COLUMN preferred_language TEXT DEFAULT 'es'
      CHECK (preferred_language IN ('es', 'en'));
  END IF;
END $$;

-- 5. Seed inicial · 3 escenarios con templates aprobados por Kelly
INSERT INTO ts_reminder_rules (scenario_key, scenario_label, stage_codes, reminder_days, templates)
VALUES (
  'prefilter_pending',
  'Prefiltro pendiente',
  ARRAY['prefiltro_enviado'],
  ARRAY[3, 5, 7],
  '{
    "1": {
      "es": {
        "email_subject": "{firstName}, ¿pudiste ver nuestro mensaje?",
        "email_body": "Hola {firstName},\n\nTe escribimos desde Trading Solutions para retomar tu aplicación a {vacancy}. Tu perfil nos llamó la atención y queremos seguir conociéndote.\n\nHace unos días te enviamos un breve cuestionario de prefiltro · toma menos de 5 minutos:\n{prefilter_url}\n\nSi tienes preguntas o algo que conversar antes, escríbenos respondiendo este correo.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hola {firstName} 👋 Te escribe el Talent Acquisition Team de Trading Solutions. Te escribimos para recordarte que dejaste pendiente el cuestionario de la vacante {vacancy}. Toma 5 min y nos ayuda a seguir avanzando: {prefilter_url}. Cualquier duda nos cuentas por aquí."
      },
      "en": {
        "email_subject": "{firstName}, did you see our message?",
        "email_body": "Hi {firstName},\n\nReaching out from Trading Solutions to follow up on your application for {vacancy}. Your profile caught our attention and we''d love to get to know you better.\n\nA few days ago we sent you a brief questionnaire — takes less than 5 minutes:\n{prefilter_url}\n\nIf you have any questions or want to chat first, just reply.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hi {firstName} 👋 The Talent Acquisition Team at Trading Solutions is writing to you. Just a reminder that you have our pre-screening questionnaire pending for the {vacancy} role. Takes 5 min: {prefilter_url}. Let us know if you have any questions."
      }
    },
    "2": {
      "es": {
        "email_subject": "¿Hay algo que podamos resolver juntos? · {vacancy}",
        "email_body": "Hola {firstName},\n\nVolvemos a escribirte porque sigues en nuestro radar para {vacancy}. A veces el cuestionario se nos pasa entre el correo o un día complicado.\n\nSi quieres retomarlo: {prefilter_url}\n\nY si hay algo en lo que podamos ayudarte para avanzar, escríbenos. Estamos aquí.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hola {firstName}, volvemos a escribirte de Trading Solutions. Queríamos saber si tuviste algún problema con el cuestionario de {vacancy} o si hay algo en lo que podamos ayudarte. Si sigues interesado: {prefilter_url}"
      },
      "en": {
        "email_subject": "Anything we can sort out together? · {vacancy}",
        "email_body": "Hi {firstName},\n\nCircling back because you''re still on our radar for {vacancy}. Sometimes a questionnaire slips through email or a busy day.\n\nIf you want to pick it back up: {prefilter_url}\n\nAnd if there''s anything we can help with to move forward, just write. We''re here.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hi {firstName}, following up from Trading Solutions. We wanted to check if you ran into any issues with the questionnaire for {vacancy}, or if there''s anything we can help with. Here''s the link: {prefilter_url}"
      }
    },
    "3": {
      "es": {
        "email_subject": "{firstName}, hay un lugar para ti en Trading Solutions",
        "email_body": "Hola {firstName},\n\nEn Trading Solutions estamos construyendo el equipo que mueve el comercio internacional desde Colombia hacia el mundo. Cada persona que sumamos lleva ese propósito.\n\nPara {vacancy} estamos a punto de cerrar la primera ronda de candidatos. Si todavía te interesa el rol, este es un buen momento para completar tu aplicación:\n{prefilter_url}\n\nSi necesitas más tiempo, o si quieres que conversemos antes, escríbenos y vemos la mejor forma de avanzar.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hola {firstName}, te escribe el Talent Acquisition Team de Trading Solutions. Estamos cerrando la primera ronda para {vacancy} esta semana. Si sigues interesado: {prefilter_url}. Si necesitas más tiempo o quieres conversar antes, solo escríbenos. Cualquiera funciona."
      },
      "en": {
        "email_subject": "{firstName}, there''s a place for you at Trading Solutions",
        "email_body": "Hi {firstName},\n\nAt Trading Solutions we''re building the team that moves international commerce from Colombia to the world. Every person we bring in carries that mission.\n\nFor {vacancy}, we''re about to close the first round of candidates. If you''re still interested in the role, now''s a good moment to complete your application:\n{prefilter_url}\n\nIf you need more time or want to talk first, reply and we''ll figure out the best way forward.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hi {firstName}, the Talent Acquisition Team at Trading Solutions is writing to you. We''re closing the first round for {vacancy} this week. If you''re still interested: {prefilter_url}. If you need more time or want to chat first, just message us back. Either way works."
      }
    }
  }'::jsonb
)
ON CONFLICT (scenario_key) DO NOTHING;

INSERT INTO ts_reminder_rules (scenario_key, scenario_label, stage_codes, reminder_days, templates)
VALUES (
  'assessment_pending',
  'Assessment virtual pendiente',
  ARRAY['assessment_invitado', 'assessment_en_progreso'],
  ARRAY[3, 5, 7],
  '{
    "1": {
      "es": {
        "email_subject": "{firstName}, Assessment virtual pendiente · {vacancy}",
        "email_body": "Hola {firstName},\n\nTe escribimos para avanzar tu proceso de {vacancy} en Trading Solutions.\n\nPasaste el prefiltro, así que el siguiente paso para conocerte mejor es nuestro Assessment virtual · son ~30 minutos desde tu computador:\n{assessment_url}\n\nCualquier duda técnica o sobre el contenido, escríbenos.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hola {firstName}, te escribe el Talent Acquisition Team de Trading Solutions. Te recordamos que dejaste pendiente el Assessment virtual para {vacancy}. Son ~30 min desde tu computador y nos permite avanzar a entrevistas. Link: {assessment_url}"
      },
      "en": {
        "email_subject": "{firstName}, Virtual Assessment pending · {vacancy}",
        "email_body": "Hi {firstName},\n\nReaching out to keep your {vacancy} process moving at Trading Solutions.\n\nYou passed the pre-screening, so the next step to get to know you better is our Virtual Assessment · about 30 minutes from your computer:\n{assessment_url}\n\nAny technical or content questions, just reply.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hi {firstName}, the Talent Acquisition Team at Trading Solutions is writing to you. Just a reminder that you have our Virtual Assessment pending for {vacancy}. Around 30 min from your computer. Link: {assessment_url}"
      }
    },
    "2": {
      "es": {
        "email_subject": "¿Necesitas ayuda con el Assessment virtual? · {vacancy}",
        "email_body": "Hola {firstName},\n\nEl Assessment virtual para {vacancy} sigue abierto. Solo queríamos confirmar que el link funciona y que no hay nada bloqueándote.\n\nSi tienes 30 minutos hoy o mañana: {assessment_url}\n\nSi hay algo en el contenido o en tu agenda que está dificultando, cuéntanos y vemos cómo destrabamos.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hola {firstName}, te escribe el Talent Acquisition Team de Trading Solutions. El Assessment virtual para {vacancy} sigue pendiente. ¿Hay algo en lo que podamos ayudarte? Link: {assessment_url}"
      },
      "en": {
        "email_subject": "Need help with the Virtual Assessment? · {vacancy}",
        "email_body": "Hi {firstName},\n\nThe Virtual Assessment for {vacancy} is still open. Just confirming the link works and nothing''s blocking you.\n\nIf you have 30 minutes today or tomorrow: {assessment_url}\n\nIf there''s anything about the content or your schedule that''s making it hard, let us know and we''ll figure it out.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hi {firstName}, the Talent Acquisition Team at Trading Solutions is writing to you. The Virtual Assessment for {vacancy} is still pending. Anything we can help with? Link: {assessment_url}"
      }
    },
    "3": {
      "es": {
        "email_subject": "{firstName}, hay un lugar para ti en Trading Solutions",
        "email_body": "Hola {firstName},\n\nEn Trading Solutions estamos eligiendo al equipo que se sumará a mover el comercio internacional desde Colombia. Para {vacancy} esta semana definimos quiénes avanzan a entrevistas.\n\nSi sigues interesado en sumarte, este es el día para completar el Assessment virtual:\n{assessment_url}\n\nSi necesitas más tiempo o tienes alguna pregunta antes de continuar, respóndenos y resolvemos juntos.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hola {firstName}, esta semana definimos quiénes pasan a entrevistas para {vacancy}. Si sigues interesado, completa el Assessment virtual hoy: {assessment_url}. Si decidiste no seguir, solo confírmanos por aquí."
      },
      "en": {
        "email_subject": "{firstName}, there''s a place for you at Trading Solutions",
        "email_body": "Hi {firstName},\n\nAt Trading Solutions we''re choosing the team that will help move international commerce from Colombia to the world. For {vacancy} this week we''re defining who advances to interviews.\n\nIf you''re still interested in joining, today''s the day to complete the Virtual Assessment:\n{assessment_url}\n\nIf you need more time or have questions, reply and we''ll figure it out together.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hi {firstName}, we''re defining who moves to interviews for {vacancy} this week. If you''re still interested, complete the Virtual Assessment today: {assessment_url}. Need more time or have questions? Just reply."
      }
    }
  }'::jsonb
)
ON CONFLICT (scenario_key) DO NOTHING;

INSERT INTO ts_reminder_rules (scenario_key, scenario_label, stage_codes, reminder_days, templates)
VALUES (
  'offer_pending',
  'Oferta sin respuesta',
  ARRAY['oferta'],
  ARRAY[4, 7, 10],
  '{
    "1": {
      "es": {
        "email_subject": "{firstName}, sobre la oferta para {vacancy}",
        "email_body": "Hola {firstName},\n\nSolo queríamos asegurarnos de que recibiste la propuesta económica para la posición de {vacancy} en Trading Solutions.\n\nSi tienes alguna pregunta sobre los detalles, beneficios o el proceso de incorporación, estamos disponibles cuando quieras hablar.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hola {firstName}, te escribe el Talent Acquisition Team de Trading Solutions. Queríamos confirmar que recibiste la propuesta para {vacancy} en Trading Solutions. Si tienes preguntas sobre la oferta o los beneficios, podemos hablar cuando gustes."
      },
      "en": {
        "email_subject": "{firstName}, about your offer for {vacancy}",
        "email_body": "Hi {firstName},\n\nWe just wanted to make sure you received the offer we sent for the {vacancy} role at Trading Solutions.\n\nIf you have any questions about the details, benefits, or onboarding, We''re available whenever you''d like to talk.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hi {firstName}, the Talent Acquisition Team at Trading Solutions is writing to you. We wanted to confirm you received the offer for {vacancy} at Trading Solutions. Any questions about the offer or benefits, we can hop on a call whenever works for you."
      }
    },
    "2": {
      "es": {
        "email_subject": "{firstName}, ¿podemos conversar sobre la oferta?",
        "email_body": "Hola {firstName},\n\nHan pasado unos días desde que te enviamos la propuesta para {vacancy}, y queremos asegurarnos de que tienes toda la información para tomar la mejor decisión.\n\n¿Tienes 15 minutos esta semana para una llamada? Podemos resolver cualquier duda — del rol, el equipo, la compensación.\n\nQuedamos atentos,\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hola {firstName}, queríamos saber si tuviste oportunidad de revisar la oferta para {vacancy}. Si te ayuda, podemos agendar 15 min para resolver cualquier duda — del rol, equipo, compensación, lo que necesites. ¿Te queda bien esta semana?"
      },
      "en": {
        "email_subject": "{firstName}, can we talk about the offer?",
        "email_body": "Hi {firstName},\n\nIt''s been a few days since we sent the offer for {vacancy}, and we want to make sure you have all the info to make the best decision.\n\nDo you have 15 minutes this week for a quick call? We''re happy to address any question — role, team, compensation.\n\nLooking forward,\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hi {firstName}, we wanted to check if you had a chance to review the offer for {vacancy}. If it helps, we can set up 15 min to address any question — role, team, compensation, whatever you need. Does this week work?"
      }
    },
    "3": {
      "es": {
        "email_subject": "{firstName}, retomemos la conversación sobre la oferta",
        "email_body": "Hola {firstName},\n\nHan pasado 10 días desde que te enviamos la propuesta para {vacancy}, y queremos retomar contigo para entender en qué momento estás.\n\nCualquiera de estas tres respuestas nos ayuda a avanzar contigo:\n\n1. Te interesa aceptar la oferta\n2. Decidiste seguir otro camino\n3. Necesitas más tiempo (con una fecha aproximada)\n\nSea cual sea, está bien. Solo nos ayuda saber para acompañarte mejor.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hola {firstName}, sobre la oferta para {vacancy}: queremos retomar contigo para entender en qué momento estás. Cualquiera de estas tres respuestas nos ayuda — aceptas, sigues otro camino, o necesitas más tiempo. Sea cual sea, está bien."
      },
      "en": {
        "email_subject": "{firstName}, let''s pick the offer conversation back up",
        "email_body": "Hi {firstName},\n\nIt''s been 10 days since we sent the offer for {vacancy}, and we''d like to reconnect to understand where you''re at.\n\nAny of these three answers helps us move forward with you:\n\n1. You''d like to accept the offer\n2. You''ve decided to take another path\n3. You need more time (with an approximate date)\n\nWhatever it is, it''s fine. Knowing helps us support you better.\n\nTalent Acquisition Team · Trading Solutions",
        "whatsapp": "Hi {firstName}, about the offer for {vacancy}: we''d like to reconnect to understand where you''re at. Any of these three answers helps — accepting, declining, or needing more time. Whatever it is, it''s fine."
      }
    }
  }'::jsonb
)
ON CONFLICT (scenario_key) DO NOTHING;
