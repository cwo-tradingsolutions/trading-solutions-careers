/**
 * PostgREST corta cada respuesta en max-rows (en este proyecto, 1000) y no
 * avisa. Una lectura sin paginar pierde el resto en silencio: el dashboard y
 * el funnel se ven incompletos.
 *
 * `queryBuilderFactory` tiene que armar la consulta de nuevo en cada página.
 * El builder de supabase-js se ejecuta una sola vez; reusarlo devolvería la
 * misma página. El orden es estable (`created_at`, luego `id`, salvo que se
 * pase otro) para que una fila no se pierda ni se duplique entre páginas.
 * `pageSize` no puede superar el max-rows del servidor: si la página vuelve
 * más corta por el tope del servidor, el loop cree que ya terminó.
 */
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
  for (let from = 0; ; from += pageSize) {
    let query = queryBuilderFactory() as Pageable<T>;
    for (const spec of order) {
      query = query.order(spec.column, { ascending: spec.ascending !== false });
    }
    const to = from + pageSize - 1;
    const { data, error } = await query.range(from, to);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}
