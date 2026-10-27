import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { claveServicioFirmada } from './clave-servicio';

// ─── Lazy init para que el build de Next.js no requiera las env vars ─
// Se crean los clients al primer uso (request time), no al importar el módulo.
let _admin: SupabaseClient | null = null;
let _anon: SupabaseClient | null = null;

/**
 * Next.js parchea el fetch global y, en el App Router, cachea por defecto las
 * peticiones GET que salen del servidor. supabase-js consulta PostgREST con
 * GET, asi que Next se quedaba con la PRIMERA respuesta de cada consulta y la
 * devolvia despues indefinidamente.
 *
 * Eso es lo que hacia que una sesion apareciera como 'created' y sin puntajes
 * horas despues de haberse cerrado: la base estaba bien, la escritura entraba
 * (los POST no se cachean), pero toda lectura posterior devolvia la foto vieja.
 * Un dato de seleccion desactualizado y sin aviso es peor que no tener dato.
 *
 * Con no-store cada consulta va a la base. Es lo correcto aqui: no hay una
 * sola lectura en esta app que pueda servirse de una copia de hace horas.
 */
const fetchSinCache: typeof fetch = (input, init) =>
  fetch(postgrestDirecto(input), { ...init, cache: 'no-store' });

/**
 * En Google Cloud, PostgREST corre como sidecar en el mismo contenedor y no se
 * publica: NEXT_PUBLIC_SUPABASE_URL apunta a él (http://127.0.0.1:3001) y,
 * con POSTGREST_DIRECTO=1, se quita el /rest/v1 que agrega supabase-js porque
 * PostgREST sirve desde la raíz. En Vercel no hace nada.
 */
function postgrestDirecto(input: Parameters<typeof fetch>[0]): Parameters<typeof fetch>[0] {
  if (process.env.POSTGREST_DIRECTO !== '1') return input;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url.replace('/rest/v1/', '/');
}

function getAdminClient(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Google Cloud: sin llave fija, el token se firma por hora (clave-servicio.ts).
  if (url && !key && claveServicioFirmada()) {
    _admin = createClient(url, claveServicioFirmada() as string, {
      accessToken: async () => claveServicioFirmada() as string,
      global: { fetch: fetchSinCache },
    });
    return _admin;
  }
  if (!url || !key) {
    throw new Error(
      'Supabase admin client not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
    );
  }
  _admin = createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: fetchSinCache },
  });
  return _admin;
}

function getAnonClient(): SupabaseClient {
  if (_anon) return _anon;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase client not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set'
    );
  }
  _anon = createClient(url, key, { global: { fetch: fetchSinCache } });
  return _anon;
}

// ─── Proxies exportados ─────────────────────────────────────────────
// Se mantiene la API antigua (supabaseAdmin.from(...), supabase.from(...))
// pero se resuelve el cliente real al primer acceso en runtime.
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const c = getAdminClient() as unknown as Record<PropertyKey, unknown>;
    const v = c[prop];
    return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(c) : v;
  },
});

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const c = getAnonClient() as unknown as Record<PropertyKey, unknown>;
    const v = c[prop];
    return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(c) : v;
  },
});
