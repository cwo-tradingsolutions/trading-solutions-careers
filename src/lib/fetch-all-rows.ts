/**
 * PostgREST corta cada respuesta en max-rows (en este proyecto, 1000) y no
 * avisa. Una lectura sin paginar pierde el resto en silencio: el dashboard y
 * el funnel se ven incompletos.
 *
 * `queryBuilderFactory` tiene que armar la consulta de nuevo en cada página.
 * El builder de supabase-js se ejecuta una sola vez; reusarlo devolvería la
 * misma página. El orden es estable (`created_at`, luego `id`, salvo que se
 * pase otro) para que una fila no se pierda ni se duplique entre páginas.
 *
 * El offset avanza por las filas recibidas, no por `pageSize`. Así un
 * max-rows menor que `pageSize` no se confunde con el final de la tabla: se
 * corta en una página vacía, o en una página corta solo después de haber
 * visto una página del tamaño pedido (el servidor respetó el range). Si el
 * servidor ignora el range, el tope de páginas lanza en vez de ciclar.
 */
export const MAX_PAGES = 200;
export type RowOrder = { column: string; ascending?: boolean };

interface Pageable<T> {
  order(column: string, options?: { ascending?: boolean }): Pageable<T>;
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

const DEFAULT_ORDER: RowOrder[] = [
  { column: "created_at", ascending: true },
  { column: "id", ascending: true },
];

export async function fetchAllRows<T>(
  queryBuilderFactory: () => unknown,
  pageSize = 1000,
  order: readonly RowOrder[] = DEFAULT_ORDER,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`fetchAllRows: pageSize inválido (${pageSize})`);
  }

  const all: T[] = [];
  let from = 0;
  // Una página del tamaño pedido prueba que el servidor aplicó el range.
  // Antes de eso, una página corta puede ser el tope de max-rows.
  let serverHonorsRange = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    let query = queryBuilderFactory() as Pageable<T>;
    for (const spec of order) {
      query = query.order(spec.column, { ascending: spec.ascending !== false });
    }
    const to = from + pageSize - 1;
    const { data, error } = await query.range(from, to);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) return all;
    all.push(...rows);
    if (rows.length < pageSize && serverHonorsRange) return all;
    if (rows.length === pageSize) serverHonorsRange = true;
    from += rows.length;
  }

  throw new Error(`fetchAllRows: excedió ${MAX_PAGES} páginas de ${pageSize}`);
}
