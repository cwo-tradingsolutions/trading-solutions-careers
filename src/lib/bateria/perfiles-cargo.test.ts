import assert from "node:assert/strict";
import test from "node:test";
import { calcularMatch } from "./match";
import { LISTA_PERFILES, PERFILES, perfilDe, perfilPorTitulo } from "./perfiles-cargo";
import type { Scores } from "./scoring";

const TITULO = "IT Operations & Security Administrator";

const OTROS: [string, string | null][] = [
  ["Especialista SIG-SST", "sig-sst"],
  ["HSE Specialist", "sig-sst"],
  ["sst coordinator", "sig-sst"],
  ["Talent Acquisition Specialist", "talent-acquisition"],
  ["FullStack Developer Junior", "fullstack-jr"],
  ["full stack engineer", "fullstack-jr"],
  ["Administration & Office Setup Lead — China", "china-admin"],
  ["office setup", "china-admin"],
  ["Customer Documentation and Support", "customer-doc"],
  ["Operations Executive and Support", "ops-exec"],
  ["Operations Executive", "ops-exec"],
  ["IT Operations", null],
  ["Security Administrator", null],
  ["IT Administrator", null],
  ["Administrator", null],
  ["Administrador de sistemas", null],
];

test("IT Operations & Security Administrator mapea a it-ops-sec", () => {
  assert.equal(perfilPorTitulo(TITULO), "it-ops-sec");
  assert.equal(perfilPorTitulo("it operations & security administrator"), "it-ops-sec");
  assert.equal(perfilPorTitulo("IT OPERATIONS & SECURITY ADMINISTRATOR"), "it-ops-sec");
  assert.equal(perfilPorTitulo("  IT   Operations  &  Security   Administrator  "), "it-ops-sec");
  assert.equal(perfilPorTitulo("ÍT Óperátions & Sécurity Ádministrátor"), "it-ops-sec");
  assert.equal(perfilPorTitulo("it operations and security administrator"), "it-ops-sec");
});

test("el titulo de IT no se lleva perfiles que ya existian", () => {
  assert.equal(
    perfilPorTitulo("HSE — IT Operations & Security Administrator"),
    "sig-sst",
  );
  assert.equal(
    perfilPorTitulo("Operations Executive — IT Operations & Security Administrator"),
    "ops-exec",
  );
  assert.equal(
    perfilPorTitulo("Developer — IT Operations & Security Administrator"),
    "fullstack-jr",
  );
  assert.equal(
    perfilPorTitulo("Administration — IT Operations & Security Administrator"),
    "china-admin",
  );
});

test("los otros titulos siguen mapeando igual", () => {
  assert.equal(perfilPorTitulo(null), null);
  assert.equal(perfilPorTitulo(""), null);
  assert.equal(perfilPorTitulo("   "), null);
  for (const [titulo, key] of OTROS) {
    assert.equal(perfilPorTitulo(titulo), key, titulo);
  }
});

test("it-ops-sec usa el mismo esquema que el resto y los pesos suman 1", () => {
  const perfil = perfilDe("it-ops-sec");
  assert.ok(perfil);
  assert.equal(perfil.nombre, "IT Operations & Security");
  assert.equal(perfil.key, "it-ops-sec");

  const referencia = PERFILES["ops-exec"];
  assert.deepEqual(Object.keys(perfil).sort(), Object.keys(referencia).sort());
  assert.deepEqual(Object.keys(perfil.pesos).sort(), Object.keys(referencia.pesos).sort());
  assert.deepEqual(Object.keys(perfil.pisos).sort(), Object.keys(referencia.pisos).sort());
  assert.deepEqual(Object.keys(perfil.disc).sort(), ["C", "D", "I", "S"]);
  assert.deepEqual(Object.keys(perfil.bigfive).sort(), ["AMA", "APE", "EST", "EXT", "RES"]);

  const suma = Object.values(perfil.pesos).reduce((a, n) => a + n, 0);
  assert.equal(Math.round(suma * 100), 100);
  assert.ok(perfil.fundamento.length > 40);
  assert.ok(perfil.fundamentoPesos.length > 40);
  assert.ok(LISTA_PERFILES.some((p) => p.key === "it-ops-sec" && p.nombre === perfil.nombre));
});

test("calcularMatch corre contra it-ops-sec con scores ya guardados", () => {
  const match = calcularMatch(scoresDeEjemplo(), "it-ops-sec");
  assert.ok(match);
  assert.equal(match.perfil.key, "it-ops-sec");
  assert.equal(match.perfil.nombre, "IT Operations & Security");
  assert.equal(typeof match.global, "number");
  assert.ok(Number.isFinite(match.global));
  const claves = match.componentes.map((c) => c.key).sort();
  assert.deepEqual(claves, ["estilo", "integridad", "personalidad", "razonamiento"]);
});

function scoresDeEjemplo(): Scores {
  const eje = (seg: number) => ({ pct: 25, seg });
  return {
    personalidad: {
      factores: { EXT: 50, APE: 60, AMA: 50, RES: 85, EST: 75 },
      facetas: {},
      arquetipo: "x",
      arquetipoAlterno: null,
      itemsRespondidos: 1,
    },
    disc: {
      natural: { D: eje(4), I: eje(4), S: eje(5), C: eje(7) },
      mascara: {},
      presion: {},
      patron: "",
      tetradasRespondidas: 1,
      afinidades: [],
    },
    motivadores: { pct: { "MOT-log": 70, "MOT-seg": 70, "MOT-rec": 30 }, orden: ["MOT-log"] },
    razonamiento: { total: 70, correct: 7, of: 10, bySubdomain: {} },
    integridad: {
      byDimension: { "INT-act": 80, "INT-ver": 80, "INT-nor": 80 },
      permisividadGlobal: 80,
    },
  };
}
