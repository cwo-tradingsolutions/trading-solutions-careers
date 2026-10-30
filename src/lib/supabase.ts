import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { hideSoftDeleted, SOFT_DELETE_TABLES } from './soft-delete';

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
  fetch(input, { ...init, cache: 'no-store' });

function getAdminClient(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

function wrapClient(getClient: () => SupabaseClient): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_t, prop) {
      const c = getClient() as unknown as Record<PropertyKey, unknown>;
      if (prop === 'from') {
        return (table: string) => {
          const builder = (c.from as (name: string) => object).call(c, table);
          if (!SOFT_DELETE_TABLES.has(table)) return builder;
          return hideSoftDeleted(builder);
        };
      }
      const v = c[prop];
      return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(c) : v;
    },
  });
}

// ─── Proxies exportados ─────────────────────────────────────────────
// Se mantiene la API antigua (supabaseAdmin.from(...), supabase.from(...))
// pero se resuelve el cliente real al primer acceso en runtime.
// from() de las tablas de candidato esconde deleted_at IS NOT NULL.
export const supabaseAdmin: SupabaseClient = wrapClient(getAdminClient);

export const supabase: SupabaseClient = wrapClient(getAnonClient);

/** Lecturas que tienen que ver también lo oculto: dedup por email y restaurar. */
export function supabaseFromIncludingDeleted(table: string) {
  return getAdminClient().from(table);
}
