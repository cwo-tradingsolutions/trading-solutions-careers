/**
 * Lectura y escritura del token de Google, separadas por ambiente.
 *
 * production → google_oauth_tokens WHERE id = 1 (la fila que ya existe).
 * preview | development → google_oauth_tokens_env WHERE environment = $env.
 *
 * La segunda tabla la crea sql/20261029_google_oauth_tokens_env.sql en Neon.
 * Este módulo no la crea y no la migra: si no está, preview no tiene token
 * y no consulta la fila de producción.
 */
import type { GoogleOAuthEnvironment } from "./google-oauth-env";

export type GoogleTokens = {
  email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
};

export type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

export type TokenWrite = {
  email: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
};

const ENV_TABLE = "google_oauth_tokens_env";

export function isMissingEnvTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "42P01") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes(ENV_TABLE) && /does not exist|42P01/i.test(message);
}

function mapRow(row: Record<string, unknown> | undefined): GoogleTokens | null {
  if (!row || !row.refresh_token) return null;
  return {
    email: (row.email as string) ?? "",
    access_token: (row.access_token as string) ?? "",
    refresh_token: row.refresh_token as string,
    expires_at: (row.expires_at as string) ?? new Date(0).toISOString(),
    scope: (row.scope as string) ?? "",
  };
}

async function ensureProductionTable(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS google_oauth_tokens (
      id INTEGER PRIMARY KEY DEFAULT 1,
      email TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expires_at TIMESTAMP WITH TIME ZONE,
      scope TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT singleton CHECK (id = 1)
    )
  `;
}

export async function readStoredTokens(sql: Sql, environment: GoogleOAuthEnvironment): Promise<GoogleTokens | null> {
  if (environment === "production") {
    await ensureProductionTable(sql);
    const rows = await sql`SELECT * FROM google_oauth_tokens WHERE id = 1 LIMIT 1`;
    return mapRow(rows[0]);
  }

  try {
    const rows = await sql`SELECT * FROM google_oauth_tokens_env WHERE environment = ${environment} LIMIT 1`;
    return mapRow(rows[0]);
  } catch (error) {
    if (isMissingEnvTable(error)) return null;
    throw error;
  }
}

export async function writeStoredTokens(sql: Sql, environment: GoogleOAuthEnvironment, tokens: TokenWrite) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  if (environment === "production") {
    await ensureProductionTable(sql);
    await sql`
      INSERT INTO google_oauth_tokens (id, email, access_token, refresh_token, expires_at, scope, updated_at)
      VALUES (1, ${tokens.email}, ${tokens.access_token}, ${tokens.refresh_token}, ${expiresAt}, ${tokens.scope ?? ""}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, google_oauth_tokens.refresh_token),
        expires_at = EXCLUDED.expires_at,
        scope = EXCLUDED.scope,
        updated_at = NOW()
    `;
    return;
  }

  try {
    await sql`
      INSERT INTO google_oauth_tokens_env (environment, email, access_token, refresh_token, expires_at, scope, updated_at)
      VALUES (${environment}, ${tokens.email}, ${tokens.access_token}, ${tokens.refresh_token}, ${expiresAt}, ${tokens.scope ?? ""}, NOW())
      ON CONFLICT (environment) DO UPDATE SET
        email = EXCLUDED.email,
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, google_oauth_tokens_env.refresh_token),
        expires_at = EXCLUDED.expires_at,
        scope = EXCLUDED.scope,
        updated_at = NOW()
    `;
  } catch (error) {
    if (isMissingEnvTable(error)) {
      throw new Error(
        "google_oauth_tokens_env no existe en Neon. Aplica sql/20261029_google_oauth_tokens_env.sql. No se escribió el token de producción.",
      );
    }
    throw error;
  }
}

export async function deleteStoredTokens(sql: Sql, environment: GoogleOAuthEnvironment) {
  if (environment === "production") {
    await ensureProductionTable(sql);
    await sql`DELETE FROM google_oauth_tokens WHERE id = 1`;
    return;
  }
  try {
    await sql`DELETE FROM google_oauth_tokens_env WHERE environment = ${environment}`;
  } catch (error) {
    if (isMissingEnvTable(error)) return;
    throw error;
  }
}
