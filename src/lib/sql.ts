import { neon as neonHttp } from "@neondatabase/serverless";
import postgres from "postgres";

// Misma forma que neon() de @neondatabase/serverless, para no tocar las rutas:
//   sql`select ... ${valor}`   y   sql("select ... $1", [valor])
// Con una URL de Neon usa su driver HTTP (Vercel). Sin URL, o con un Postgres
// normal, usa postgres.js: en Cloud Run lee PGHOST=/cloudsql/..., PGUSER,
// PGDATABASE y PGPASSWORD, y el search_path lo fija el rol en la base.
type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<any[]>;
  (query: string, params?: unknown[]): Promise<any[]>;
};

let pool: postgres.Sql | null = null;

// El driver de Neon manda los objetos como JSON; postgres.js no, así que se
// serializan aquí para que jsonb reciba lo mismo que antes.
function valor(v: unknown): unknown {
  const plano = (x: unknown) =>
    x !== null && typeof x === "object" && !(x instanceof Date) && !(x instanceof Uint8Array) && !Array.isArray(x);
  if (plano(v)) return JSON.stringify(v);
  if (Array.isArray(v) && v.some(plano)) return JSON.stringify(v);
  return v;
}

// Las rutas mandan `${JSON.stringify(x)}::jsonb`: el texto ya es JSON. El
// serializador de postgres.js lo volvía a envolver y jsonb guardaba un string
// ("{\"a\":1}") en vez del objeto. Un texto pasa tal cual, como con Neon.
const tipos = {
  json: {
    to: 114,
    from: [114, 3802],
    serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)),
    parse: (x: string) => JSON.parse(x),
  },
};

export function neon(url?: string): Sql {
  if (url && /\.neon\.tech/.test(url)) return neonHttp(url) as unknown as Sql;
  pool ??= url ? postgres(url, { max: 5, types: tipos }) : postgres({ max: 5, types: tipos });
  const db = pool;
  return ((primero: TemplateStringsArray | string, ...resto: unknown[]) => {
    if (typeof primero === "string") {
      const params = (resto[0] as unknown[] | undefined) ?? [];
      return db.unsafe(primero, params.map(valor) as postgres.ParameterOrJSON<never>[]).then((r) => [...r]);
    }
    let texto = primero[0];
    for (let i = 1; i < primero.length; i++) texto += `$${i}` + primero[i];
    return db.unsafe(texto, resto.map(valor) as postgres.ParameterOrJSON<never>[]).then((r) => [...r]);
  }) as Sql;
}
