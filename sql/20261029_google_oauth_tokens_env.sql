-- Destino: Neon, la base de DATABASE_URL.
-- No es una migración de Supabase. No correrla contra Supabase.
-- No aplicarla desde este cambio: el archivo queda en el repo y alguien
-- con la cadena de Neon la corre a mano cuando el preview deba guardar
-- su propio token.
--
-- Por qué una tabla nueva, y no una columna `environment` en
-- google_oauth_tokens: esa tabla es un singleton
-- (PRIMARY KEY (id) y CHECK (id = 1)). Una segunda fila (preview o
-- development) exigiría DROP CONSTRAINT. Eso no es aditivo.
--
-- Esta sentencia solo crea. No hay UPDATE de la fila id = 1 y no hay DROP.
-- La fila que ya existe sigue siendo la de producción. El código de
-- producción no lee esta tabla. preview y development leen y escriben
-- solo aquí, filtrando por environment. Si no hay fila, no se usa el
-- token de producción.

CREATE TABLE IF NOT EXISTS google_oauth_tokens_env (
  environment TEXT PRIMARY KEY,
  email TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  scope TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT google_oauth_tokens_env_environment_check
    CHECK (environment IN ('preview', 'development'))
);
