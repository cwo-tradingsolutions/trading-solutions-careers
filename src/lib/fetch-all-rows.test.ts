import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchAllRows, MAX_PAGES } from "./fetch-all-rows.ts";

type Row = { id: string; created_at: string };

/** 2,500 filas. Las impares comparten created_at con la anterior, así el id desempata. */
function rows2500(): Row[] {
  return Array.from({ length: 2500 }, (_, i) => ({
    id: `c${String(i).padStart(4, "0")}`,
    created_at: new Date(Date.UTC(2026, 0, 1) + Math.floor(i / 2) * 60_000).toISOString(),
  }));
}

function shuffle(rows: Row[]): Row[] {
  const arr = [...rows];
  let seed = 1;
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 16807) % 2147483647;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function table(rows: Row[], failOnCall?: number) {
  const calls: { from: number; to: number; order: { column: string; ascending: boolean }[] }[] = [];
  let builds = 0;
  const queryBuilderFactory = () => {
    builds += 1;
    const order: { column: string; ascending: boolean }[] = [];
    const builder = {
      order(column: string, options?: { ascending?: boolean }) {
        order.push({ column, ascending: options?.ascending !== false });
        return builder;
      },
      range(from: number, to: number) {
        const snapshot = order.map((spec) => ({ ...spec }));
        calls.push({ from, to, order: snapshot });
        if (failOnCall != null && calls.length === failOnCall) {
          return Promise.resolve({ data: null, error: { message: "boom" } });
        }
        const sorted = [...rows].sort((a, b) => {
          for (const spec of snapshot) {
            const av = a[spec.column as keyof Row];
            const bv = b[spec.column as keyof Row];
            if (av < bv) return spec.ascending ? -1 : 1;
            if (av > bv) return spec.ascending ? 1 : -1;
          }
          return 0;
        });
        return Promise.resolve({ data: sorted.slice(from, to + 1), error: null });
      },
    };
    return builder;
  };
  return { queryBuilderFactory, calls, builds: () => builds };
}

describe("fetchAllRows", () => {
  it("junta 2,500 filas en 3 páginas de 1,000 y se detiene en la corta", async () => {
    const source = rows2500();
    const { queryBuilderFactory, calls, builds } = table(shuffle(source));

    const got = await fetchAllRows<Row>(queryBuilderFactory);

    assert.equal(got.length, 2500);
    assert.equal(builds(), 3);
    assert.deepEqual(
      calls.map((call) => [call.from, call.to, call.order]),
      [
        [0, 999, [
          { column: "created_at", ascending: true },
          { column: "id", ascending: true },
        ]],
        [1000, 1999, [
          { column: "created_at", ascending: true },
          { column: "id", ascending: true },
        ]],
        [2000, 2999, [
          { column: "created_at", ascending: true },
          { column: "id", ascending: true },
        ]],
      ],
    );
    assert.equal(calls[2] && got.length - 2000, 500);
    assert.deepEqual(got, source);
  });

  it("mantiene created_at desc y usa id como desempate", async () => {
    const source = rows2500();
    const { queryBuilderFactory, calls } = table(shuffle(source));

    const got = await fetchAllRows<Row>(queryBuilderFactory, 1000, [
      { column: "created_at", ascending: false },
      { column: "id", ascending: true },
    ]);

    const expected = [...source].sort((a, b) => {
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0].order, [
      { column: "created_at", ascending: false },
      { column: "id", ascending: true },
    ]);
    assert.deepEqual(got, expected);
  });

  it("no sigue paginando si una página falla", async () => {
    const { queryBuilderFactory, calls } = table(rows2500(), 2);
    await assert.rejects(() => fetchAllRows(queryBuilderFactory), /boom/);
    assert.equal(calls.length, 2);
  });

  it("una tabla vacía devuelve [] en una sola página", async () => {
    const { queryBuilderFactory, calls } = table([]);
    const got = await fetchAllRows(queryBuilderFactory);
    assert.deepEqual(got, []);
    assert.deepEqual(calls.map((call) => [call.from, call.to]), [[0, 999]]);
  });

  it("un empate de created_at que cruza 999/1000 no pierde ni duplica", async () => {
    const tie = "2026-06-15T00:00:00.000Z";
    const source: Row[] = Array.from({ length: 1001 }, (_, i) => ({
      id: `c${String(i).padStart(4, "0")}`,
      created_at: i >= 999 ? tie : new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
    }));
    const calls: { from: number; order: string[] }[] = [];
    const queryBuilderFactory = () => {
      const order: { column: string; ascending: boolean }[] = [];
      const builder = {
        order(column: string, options?: { ascending?: boolean }) {
          order.push({ column, ascending: options?.ascending !== false });
          return builder;
        },
        range(from: number, to: number) {
          const snapshot = order.map((spec) => ({ ...spec }));
          calls.push({ from, order: snapshot.map((spec) => spec.column) });
          const decorated = source.map((row, index) => ({ row, index }));
          const hasId = snapshot.some((spec) => spec.column === "id");
          decorated.sort((a, b) => {
            for (const spec of snapshot) {
              const av = a.row[spec.column as keyof Row];
              const bv = b.row[spec.column as keyof Row];
              if (av < bv) return spec.ascending ? -1 : 1;
              if (av > bv) return spec.ascending ? 1 : -1;
            }
            // Sin id, cada página desempata al revés: el par del borde se duplica y se pierde.
            if (hasId) return 0;
            return (a.index - b.index) * (from === 0 ? 1 : -1);
          });
          return Promise.resolve({
            data: decorated.map((item) => item.row).slice(from, to + 1),
            error: null,
          });
        },
      };
      return builder;
    };

    const got = await fetchAllRows<Row>(queryBuilderFactory);
    assert.deepEqual(calls[0]?.order, ["created_at", "id"]);
    assert.equal(got.length, source.length);
    assert.equal(new Set(got.map((row) => row.id)).size, source.length);
    assert.equal(got[999]?.id, "c0999");
    assert.equal(got[1000]?.id, "c1000");
    assert.deepEqual(got, source);
  });

  it("sigue leyendo cuando max-rows es menor que pageSize", async () => {
    const source: Row[] = Array.from({ length: 1200 }, (_, i) => ({
      id: `c${String(i).padStart(4, "0")}`,
      created_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
    }));
    const maxRows = 500;
    const calls: number[] = [];
    const queryBuilderFactory = () => {
      const builder = {
        order() {
          return builder;
        },
        range(from: number, to: number) {
          calls.push(from);
          const window = source.slice(from, to + 1).slice(0, maxRows);
          return Promise.resolve({ data: window, error: null });
        },
      };
      return builder;
    };

    const got = await fetchAllRows<Row>(queryBuilderFactory, 1000);
    assert.deepEqual(got, source);
    assert.deepEqual(calls, [0, 500, 1000, 1200]);
  });

  it("lanza al llegar al tope de páginas si el servidor ignora el range", async () => {
    let calls = 0;
    const queryBuilderFactory = () => ({
      order() {
        return this;
      },
      range() {
        calls += 1;
        return Promise.resolve({ data: [{ id: "x", created_at: "t" }], error: null });
      },
    });
    await assert.rejects(() => fetchAllRows(queryBuilderFactory, 1), new RegExp(String(MAX_PAGES)));
    assert.equal(calls, MAX_PAGES);
  });
});
