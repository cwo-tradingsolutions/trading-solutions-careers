import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { planRecalculoMatch, type FilaSesionMatch } from "./recalcular-match";
import type { Scores } from "./scoring";

const ID = "b4909310-ccd6-41a1-b7a1-1cd496408e8e";

test("una sesión completed con scores y título IT queda lista para escribir solo perfil y match", () => {
  const plan = planRecalculoMatch(fila());
  assert.equal(plan.accion, "actualizar");
  if (plan.accion !== "actualizar") return;
  assert.equal(plan.perfil_cargo, "it-ops-sec");
  assert.equal(plan.antes.perfil_cargo, null);
  assert.equal(plan.antes.match_global, null);
  assert.equal(plan.match_data.perfil.key, "it-ops-sec");
  assert.equal(typeof plan.match_data.global, "number");
  assert.deepEqual(Object.keys(plan).sort(), [
    "accion",
    "antes",
    "id",
    "match_data",
    "perfil_cargo",
  ]);
});

test("no pisa un perfil distinto, ni una sesión abierta, ni scores vacíos", () => {
  const otro = planRecalculoMatch(fila({ perfil_cargo: "ops-exec" }));
  assert.equal(otro.accion, "omitir");

  const abierta = planRecalculoMatch(fila({ status: "started" }));
  assert.equal(abierta.accion, "omitir");

  const sinScores = planRecalculoMatch(fila({ scores: null }));
  assert.equal(sinScores.accion, "omitir");

  const sinTitulo = planRecalculoMatch(fila({ vacancy_title: "Cargo sin perfil" }));
  assert.equal(sinTitulo.accion, "omitir");
});

test("acepta scores y match_data guardados como texto JSON", () => {
  const plan = planRecalculoMatch(
    fila({
      scores: JSON.stringify(scores()),
      match_data: JSON.stringify({ global: 12 }),
      perfil_cargo: "it-ops-sec",
    }),
  );
  assert.equal(plan.accion, "actualizar");
  if (plan.accion !== "actualizar") return;
  assert.equal(plan.antes.match_global, 12);
  assert.equal(plan.perfil_cargo, "it-ops-sec");
});

test("el script no llama al cierre ni a ningún envío de correo", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const src = readFileSync(join(root, "scripts", "recalcular-match-sesiones.ts"), "utf8");
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const imports = codigo.split("\n").filter((l) => l.startsWith("import "));
  assert.deepEqual(imports, [
    'import postgres from "postgres";',
    'import { planRecalculoMatch, type FilaSesionMatch, type PlanRecalculo } from "../src/lib/bateria/recalcular-match";',
  ]);
  assert.match(codigo, /set perfil_cargo/);
  assert.match(codigo, /match_data/);
  assert.doesNotMatch(codigo, /cerrarSesion|sendViaGmail|resend|createDraft|scores\s*=/);
  assert.match(src, /--commit/);
  assert.match(src, /DATABASE_URL/);
});

function fila(sobre: Partial<FilaSesionMatch> = {}): FilaSesionMatch {
  return {
    id: ID,
    status: "completed",
    vacancy_title: "IT Operations & Security Administrator",
    perfil_cargo: null,
    scores: scores(),
    match_data: null,
    ...sobre,
  };
}

function scores(): Scores {
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
    motivadores: { pct: {}, orden: [] },
    razonamiento: { total: 70, correct: 7, of: 10, bySubdomain: {} },
    integridad: { byDimension: { "INT-ver": 80, "INT-act": 80, "INT-nor": 70 }, permisividadGlobal: 80 },
  };
}
