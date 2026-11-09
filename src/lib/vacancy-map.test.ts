import assert from "node:assert/strict";
import test from "node:test";
import {
  TS_CLIENT_ID,
  TITLE_HINTS,
  VACANCY_MAP,
  consultaDe,
  resolverVacanteDetallada,
  type LectorVacantes,
} from "./vacancy-map.ts";
import {
  decidirAltaFunnel,
  patronTitulo,
  resolverVacanteCon,
  type ConsultaVacantes,
  type FilaVacante,
} from "./vacancy-resolve.ts";

const SZ = "c37ac6ed-7131-4bf0-b7a0-3bf52a71f0d7";
const GZ = "b78d5ba3-d80e-4f4c-a64e-3b891c9827d4";
const SH = "a7bcd05d-931d-44f3-a606-5a7269552b99";
const EXEC = "81d82ac5-9746-4f80-94d5-4595d09bd7ab";

function fila(id: string, title: string, status: string, clientId: string = TS_CLIENT_ID): FilaVacante {
  return { id, title, status, client_id: clientId };
}

/**
 * Misma regla que ILIKE '%hint%': el título del ATS tiene que contener el
 * texto de la web. No es al revés.
 */
function atsContiene(titulo: string | null, hint: string): boolean {
  return (titulo ?? "").toLowerCase().includes(hint.toLowerCase());
}

function mundo(opts?: { vinculoError?: boolean; tituloError?: boolean }) {
  const vacantes: FilaVacante[] = [
    fila(SZ, "OVERSEAS SALES", "open"),
    fila(GZ, "OVERSEAS SALES", "open"),
    fila(SH, "OVERSEAS SALES", "open"),
    fila(EXEC, "Overseas Sales Executive and Support", "closed"),
  ];
  const vinculos = new Map<number, (string | null)[]>([
    [21, [SZ]],
    [24, [GZ]],
    [25, [SH]],
  ]);
  const llamadas = { vinculo: 0, titulo: 0, hints: [] as string[] };
  const consulta: ConsultaVacantes = {
    async vacantePorId(id) {
      return { fila: vacantes.find((v) => v.id === id) ?? null, error: false };
    },
    async vinculosPorWebJob(jobId) {
      llamadas.vinculo += 1;
      if (opts?.vinculoError) return { vacancyIds: [], error: true };
      return { vacancyIds: vinculos.get(jobId) ?? [], error: false };
    },
    async porTitulo(hint) {
      llamadas.titulo += 1;
      llamadas.hints.push(hint);
      if (opts?.tituloError) return { filas: [], error: true };
      return { filas: vacantes.filter((v) => atsContiene(v.title, hint)), error: false };
    },
  };
  return { vacantes, vinculos, llamadas, consulta };
}

function resolver(
  jobId: number,
  titulo: string | undefined,
  consulta: ConsultaVacantes,
  mapa: Record<number, string> = {},
  hints: Record<number, string> = {},
) {
  return resolverVacanteCon(jobId, titulo, consulta, mapa, hints, TS_CLIENT_ID);
}

test("el título de la web con ciudad no cabe en OVERSEAS SALES; el corto sí cabe en las tres", () => {
  assert.equal(patronTitulo("Overseas Sales — Guangzhou"), "%Overseas Sales — Guangzhou%");
  assert.equal(atsContiene("OVERSEAS SALES", "Overseas Sales — Guangzhou"), false);
  assert.equal(atsContiene("OVERSEAS SALES", "Overseas Sales — Shanghai"), false);
  assert.equal(atsContiene("OVERSEAS SALES", "Overseas Sales"), true);
  assert.equal(atsContiene("Overseas Sales Executive and Support", "Overseas Sales"), true);
});

test("Guangzhou: título distinto y vínculo inequívoco van a b78d5ba3, sin buscar por título", async () => {
  const { consulta, llamadas } = mundo();
  const resuelta = await resolver(24, "Overseas Sales — Guangzhou", consulta);
  assert.equal(resuelta.vacante?.id, GZ);
  assert.equal(resuelta.vacante?.via, "vinculo");
  assert.equal(resuelta.vacante?.cerrada, false);
  assert.equal(resuelta.motivo, null);
  assert.equal(llamadas.titulo, 0);
  assert.notEqual(resuelta.vacante?.id, SZ);
  assert.notEqual(resuelta.vacante?.id, SH);
});

test("Shenzhen y Shanghai con títulos parecidos no se mezclan", async () => {
  const { consulta, llamadas } = mundo();
  const shenzhen = await resolver(21, "Overseas Sales", consulta);
  const shanghai = await resolver(25, "Overseas Sales — Shanghai", consulta);
  assert.equal(shenzhen.vacante?.id, SZ);
  assert.equal(shanghai.vacante?.id, SH);
  assert.equal(shenzhen.vacante?.via, "vinculo");
  assert.equal(shanghai.vacante?.via, "vinculo");
  assert.equal(llamadas.titulo, 0);
  assert.notEqual(shenzhen.vacante?.id, shanghai.vacante?.id);
  assert.notEqual(shenzhen.vacante?.id, GZ);
  assert.notEqual(shanghai.vacante?.id, GZ);
});

test("sin vínculo, el título corto de Shenzhen no elige la primera vacante abierta", async () => {
  const base = mundo();
  base.vinculos.clear();
  const resuelta = await resolver(21, "Overseas Sales", base.consulta);
  assert.equal(resuelta.vacante, null);
  assert.match(resuelta.motivo ?? "", /3 vacantes abiertas/);
  assert.match(resuelta.motivo ?? "", new RegExp(SZ));
  assert.match(resuelta.motivo ?? "", new RegExp(GZ));
  assert.match(resuelta.motivo ?? "", new RegExp(SH));
  assert.equal(resuelta.motivo?.includes(EXEC), false);
  assert.equal(base.llamadas.titulo, 1);
});

test("sin vínculo, Guangzhou no entra por título y el fallo nombra el título", async () => {
  const base = mundo();
  base.vinculos.clear();
  const resuelta = await resolver(24, "Overseas Sales — Guangzhou", base.consulta);
  assert.equal(resuelta.vacante, null);
  assert.match(resuelta.motivo ?? "", /sin vínculo web_vacancy_id/);
  assert.match(resuelta.motivo ?? "", /Overseas Sales — Guangzhou/);
  assert.equal(base.llamadas.hints[0], "Overseas Sales — Guangzhou");
});

test("dos requisiciones que apuntan al mismo vacancy_id siguen siendo un destino", async () => {
  const base = mundo();
  base.vinculos.set(24, [GZ, GZ]);
  const resuelta = await resolver(24, "Overseas Sales — Guangzhou", base.consulta);
  assert.equal(resuelta.vacante?.id, GZ);
  assert.equal(base.llamadas.titulo, 0);
});

test("vínculo ambiguo no cae al título ni elige una ciudad", async () => {
  const base = mundo();
  base.vinculos.set(24, [GZ, SH]);
  const resuelta = await resolver(24, "Overseas Sales — Guangzhou", base.consulta);
  assert.equal(resuelta.vacante, null);
  assert.match(resuelta.motivo ?? "", /ambiguo/);
  assert.equal(base.llamadas.titulo, 0);
});

test("vínculo sin vacancy_id no se adivina por título aunque el título corto coincida", async () => {
  const base = mundo();
  base.vinculos.set(21, [null]);
  const resuelta = await resolver(21, "Overseas Sales", base.consulta);
  assert.equal(resuelta.vacante, null);
  assert.match(resuelta.motivo ?? "", /sin vacancy_id/);
  assert.equal(base.llamadas.titulo, 0);
});

test("si la lectura del vínculo falla, no hay fallback por título", async () => {
  const base = mundo({ vinculoError: true });
  const resuelta = await resolver(21, "Overseas Sales", base.consulta);
  assert.equal(resuelta.vacante, null);
  assert.match(resuelta.motivo ?? "", /falló la lectura/);
  assert.equal(base.llamadas.titulo, 0);
});

test("un vínculo a una vacante cerrada no salta a otra ciudad abierta", async () => {
  const base = mundo();
  const shenzhen = base.vacantes.find((v) => v.id === SZ);
  if (shenzhen) shenzhen.status = "closed";
  const resuelta = await resolver(21, "Overseas Sales", base.consulta);
  assert.equal(resuelta.vacante?.id, SZ);
  assert.equal(resuelta.vacante?.cerrada, true);
  assert.equal(resuelta.vacante?.via, "vinculo");
  assert.equal(base.llamadas.titulo, 0);
});

test("un vínculo que apunta a una vacante inexistente no se adivina por título", async () => {
  const base = mundo();
  base.vinculos.set(24, ["00000000-0000-0000-0000-000000000000"]);
  const resuelta = await resolver(24, "Overseas Sales — Guangzhou", base.consulta);
  assert.equal(resuelta.vacante, null);
  assert.match(resuelta.motivo ?? "", /no existe/);
  assert.equal(base.llamadas.titulo, 0);
});

test("sin vínculo, un error al buscar por título no se disfraza de cero coincidencias silenciosas", async () => {
  const base = mundo({ tituloError: true });
  base.vinculos.clear();
  const resuelta = await resolver(10, "Full Stack Developer Junior", base.consulta, {}, { 10: "full stack" });
  assert.equal(resuelta.vacante, null);
  assert.match(resuelta.motivo ?? "", /falló la búsqueda por título/);
});

test("un vínculo a otro cliente no se usa", async () => {
  const base = mundo();
  const ajena = base.vacantes.find((v) => v.id === GZ);
  if (ajena) ajena.client_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const resuelta = await resolver(24, "Overseas Sales — Guangzhou", base.consulta);
  assert.equal(resuelta.vacante, null);
  assert.match(resuelta.motivo ?? "", /otro cliente/);
  assert.equal(base.llamadas.titulo, 0);
});

test("un job del mapa no consulta el vínculo y no se deja pisar por él", async () => {
  const base = mundo();
  base.vinculos.set(8, [GZ]);
  base.vacantes.push(fila(EXEC, "Overseas Sales Executive and Support", "open"));
  const resuelta = await resolver(8, "Overseas Sales Executive and Support", base.consulta, { 8: EXEC });
  assert.equal(resuelta.vacante?.id, EXEC);
  assert.equal(resuelta.vacante?.via, "mapa");
  assert.equal(base.llamadas.vinculo, 0);
});

test("sin vínculo, un título único sigue resolviendo (Full Stack)", async () => {
  const full = "11111111-1111-1111-1111-111111111111";
  const vacantes = [fila(full, "Full Stack Developer Junior", "open")];
  const consulta: ConsultaVacantes = {
    async vacantePorId() {
      return { fila: null, error: false };
    },
    async vinculosPorWebJob() {
      return { vacancyIds: [], error: false };
    },
    async porTitulo(hint) {
      return { filas: vacantes.filter((v) => atsContiene(v.title, hint)), error: false };
    },
  };
  const resuelta = await resolver(10, "Full Stack Developer Junior", consulta, {}, { 10: "full stack" });
  assert.equal(resuelta.vacante?.id, full);
  assert.equal(resuelta.vacante?.via, "titulo");
});

test("el mapa cerrado sigue pudiendo reemplazarse por la abierta del mismo nombre", async () => {
  const vieja = "22222222-2222-2222-2222-222222222222";
  const nueva = "33333333-3333-3333-3333-333333333333";
  const vacantes = [
    fila(vieja, "Customer Documentation Specialist", "closed"),
    fila(nueva, "Customer Documentation Specialist", "open"),
  ];
  const consulta: ConsultaVacantes = {
    async vacantePorId(id) {
      return { fila: vacantes.find((v) => v.id === id) ?? null, error: false };
    },
    async vinculosPorWebJob() {
      throw new Error("el mapa no debería leer el vínculo");
    },
    async porTitulo(hint) {
      return { filas: vacantes.filter((v) => atsContiene(v.title, hint)), error: false };
    },
  };
  const resuelta = await resolver(
    3,
    "Customer Documentation Specialist",
    consulta,
    { 3: vieja },
    { 3: "customer documentation specialist" },
  );
  assert.equal(resuelta.vacante?.id, nueva);
  assert.equal(resuelta.vacante?.via, "mapa_reemplazado");
});

test("21, 24 y 25 no están en el mapa de producción: los resuelve el vínculo", () => {
  assert.equal(VACANCY_MAP[21], undefined);
  assert.equal(VACANCY_MAP[24], undefined);
  assert.equal(VACANCY_MAP[25], undefined);
  assert.equal(TITLE_HINTS[21], undefined);
  assert.equal(TITLE_HINTS[24], undefined);
  assert.equal(TITLE_HINTS[25], undefined);
});

test("reintento: el mismo destino no inserta otro candidato ni otro evento", async () => {
  const { consulta } = mundo();
  const primera = await resolver(24, "Overseas Sales — Guangzhou", consulta);
  const segunda = await resolver(24, "Overseas Sales — Guangzhou", consulta);
  assert.equal(primera.vacante?.id, GZ);
  assert.equal(segunda.vacante?.id, primera.vacante?.id);

  const eventos: string[] = [];
  const alta = decidirAltaFunnel([], false);
  assert.equal(alta.accion, "insertar");
  assert.equal(alta.registrarEvento, true);
  if (alta.accion === "insertar" && alta.registrarEvento) eventos.push("aplico");

  const reintento = decidirAltaFunnel([{ id: "cand-gz" }], false);
  assert.equal(reintento.accion, "actualizar");
  assert.equal(reintento.registrarEvento, false);
  if (reintento.accion === "actualizar") assert.equal(reintento.candidateId, "cand-gz");
  assert.deepEqual(eventos, ["aplico"]);

  const lecturaRota = decidirAltaFunnel(null, true);
  assert.equal(lecturaRota.accion, "detener");
  assert.equal(lecturaRota.registrarEvento, false);
  assert.deepEqual(eventos, ["aplico"]);

  const duplicados = decidirAltaFunnel([{ id: "cand-gz" }, { id: "cand-extra" }], false);
  assert.equal(duplicados.accion, "actualizar");
  if (duplicados.accion === "actualizar") {
    assert.equal(duplicados.candidateId, "cand-gz");
    assert.equal(duplicados.duplicadosPrevios, true);
    assert.equal(duplicados.registrarEvento, false);
  }
  assert.deepEqual(eventos, ["aplico"]);
});

test("el fallo de vínculo ambiguo queda en el log y no devuelve vacante", async () => {
  const base = mundo();
  base.vinculos.set(25, [SH, SZ]);
  const errores: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errores.push(args);
  };
  try {
    const resuelta = await resolverVacanteDetallada(25, "Overseas Sales — Shanghai", base.consulta);
    assert.equal(resuelta.vacante, null);
    assert.match(resuelta.motivo, /ambiguo/);
    assert.equal(errores.length, 1);
    assert.match(String(errores[0][0]), /\[vacancy-map\]/);
    assert.match(String(errores[0][0]), /ambiguo/);
  } finally {
    console.error = original;
  }
});

test("la consulta de producción filtra por web_vacancy_id del cliente y el patrón de título", async () => {
  type Llamada = {
    tabla: string;
    select?: string;
    eqs: [string, unknown][];
    ilike?: [string, string];
    maybeSingle: boolean;
  };
  const llamadas: Llamada[] = [];
  const db: LectorVacantes = {
    from(tabla) {
      const llamada: Llamada = { tabla, eqs: [], maybeSingle: false };
      llamadas.push(llamada);
      const cadena = {
        select(columnas: string) {
          llamada.select = columnas;
          return cadena;
        },
        eq(columna: string, valor: unknown) {
          llamada.eqs.push([columna, valor]);
          return cadena;
        },
        ilike(columna: string, patron: string) {
          llamada.ilike = [columna, patron];
          return cadena;
        },
        maybeSingle() {
          llamada.maybeSingle = true;
          return Promise.resolve({ data: null, error: null });
        },
        then<T>(onFulfilled: (value: { data: unknown; error: null }) => T) {
          return Promise.resolve({ data: [], error: null }).then(onFulfilled);
        },
      };
      return cadena;
    },
  };

  const consulta = consultaDe(db);
  await consulta.vinculosPorWebJob(24);
  assert.equal(llamadas[0].tabla, "ht_requisitions");
  assert.equal(llamadas[0].select, "vacancy_id");
  assert.deepEqual(llamadas[0].eqs, [
    ["client_id", TS_CLIENT_ID],
    ["web_vacancy_id", 24],
  ]);

  await consulta.porTitulo("Overseas Sales — Guangzhou");
  assert.equal(llamadas[1].tabla, "ht_vacancies");
  assert.deepEqual(llamadas[1].eqs, [["client_id", TS_CLIENT_ID]]);
  assert.deepEqual(llamadas[1].ilike, ["title", "%Overseas Sales — Guangzhou%"]);
  assert.equal(atsContiene("OVERSEAS SALES", "Overseas Sales — Guangzhou"), false);

  await consulta.vacantePorId(GZ);
  assert.equal(llamadas[2].tabla, "ht_vacancies");
  assert.equal(llamadas[2].maybeSingle, true);
  assert.deepEqual(llamadas[2].eqs, [["id", GZ]]);
});
