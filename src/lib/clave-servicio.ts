import { createHmac } from 'node:crypto';

// Llave service_role para PostgREST en Google Cloud.
// En Vercel viene lista en SUPABASE_SERVICE_ROLE_KEY. En Google se firma aquí
// con SUPABASE_JWT_SECRET (Secret Manager), el mismo secreto con que PostgREST
// valida los tokens: así no hay una llave larga guardada aparte. Vive 1 hora
// y se renueva sola.

let cache: { token: string; vence: number } | null = null;

const b64url = (v: string) => Buffer.from(v).toString('base64url');

export function claveServicioFirmada(): string | undefined {
  const secreto = process.env.SUPABASE_JWT_SECRET;
  if (!secreto) return undefined;

  const ahora = Math.floor(Date.now() / 1000);
  if (cache && cache.vence - 300 > ahora) return cache.token;

  const vence = ahora + 3600;
  const cuerpo = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ role: 'service_role', iss: 'careers', iat: ahora, exp: vence }),
  )}`;
  const firma = createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  cache = { token: `${cuerpo}.${firma}`, vence };
  return cache.token;
}
