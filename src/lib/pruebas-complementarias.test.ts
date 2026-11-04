import assert from "node:assert/strict";
import { test } from "node:test";
import {
  armarBorrador,
  registrarBorrador,
  seleccionarPruebas,
  TABLA_REGISTRO,
  type ProveedorCatalogo,
} from "./pruebas-complementarias";

// Catálogo de careers (ts_test_providers, 9 filas) tal como está hoy.
const P = (key: string, nombre: string, categoria: string, portal_url: string, via: string, activo = true): ProveedorCatalogo =>
  ({ key, nombre, categoria, portal_url, via, activo });
const CATALOGO: ProveedorCatalogo[] = [
  P("16personalities", "Test de personalidad · 16personalities", "personalidad", "https://www.16personalities.com/es/test-de-personalidad", "candidato"),
  P("assessment_tally", "Assessment situacional (Tally)", "situacional", "https://tally.so/r/Pdg8EB", "manual"),
  P("betesa", "Betesa", "estilo", "https://app.bluesitehr.com/", "manual"),
  P("disc_free", "DISC · myDISCprofile", "estilo", "https://www.mydiscprofile.com/en-us/free-personality-test.php", "candidato"),
  P("disc_prime", "DISC", "estilo", "https://www.disc-prime.com/login", "manual"),
  P("motivacion", "Test de motivación", "motivacion", "https://motivation-test-production.up.railway.app/", "manual"),
  P("psico_alianza", "Psico Alianza", "personalidad", "https://app.psicoalianza.com", "manual"),
  P("skills_3d", "3D Skills", "cognitiva", "https://app.bluesitehr.com/", "manual"),
  P("turing", "Máquina de Turing", "cognitiva", "https://turinglab-fyqie5kiza-uc.a.run.app/signin", "manual"),
];

const arma = (lang: "es" | "en", catalogo = CATALOGO) =>
  armarBorrador({ catalogo, lang, candidateName: "EJEMPLO Ficticia", firstName: "EJEMPLO", vacancyTitle: "Vacante EJEMPLO" });

test("incluye las 8 pruebas del catálogo con DISC Prime como único DISC", () => {
  const keys = seleccionarPruebas(CATALOGO).map((p) => p.key);
  assert.deepEqual(keys, [
    "disc_prime", "16personalities", "motivacion", "betesa", "skills_3d", "psico_alianza", "turing", "assessment_tally",
  ]);
  assert.equal(keys.filter((k) => k.includes("disc")).length, 1);
});

test("myDISCprofile y miperfildisc no aparecen en el borrador (es/en)", () => {
  for (const lang of ["es", "en"] as const) {
    const b = arma(lang);
    for (const s of [b.html, b.texto]) {
      assert.doesNotMatch(s, /miperfildisc/i);
      assert.doesNotMatch(s, /mydiscprofile/i);
    }
    assert.match(b.html, /DISC Prime/);
  }
});

test("otro DISC agregado al catálogo tampoco entra; inactivas fuera; claves nuevas al final", () => {
  const cat = [
    ...CATALOGO,
    P("miperfildisc", "DISC · miperfildisc", "estilo", "https://miperfildisc.com/", "candidato"),
    P("disc_otro", "Otro DISC", "estilo", "https://x.example/", "candidato"),
    P("nueva", "Prueba nueva", "cognitiva", "https://nueva.example/test", "candidato"),
    P("apagada", "Apagada", "cognitiva", "https://a.example/", "candidato", false),
  ];
  const keys = seleccionarPruebas(cat).map((p) => p.key);
  assert.ok(!keys.includes("miperfildisc") && !keys.includes("disc_otro") && !keys.includes("apagada"));
  assert.equal(keys.at(-1), "nueva");
  assert.match(arma("es", cat).html, /nueva\.example\/test/);
});

test("portales de login no se mandan al candidato: van como placeholder", () => {
  const b = arma("es");
  assert.doesNotMatch(b.html, /disc-prime\.com\/login|bluesitehr|psicoalianza\.com|turinglab/);
  assert.deepEqual(b.placeholders, [
    "DISC (DISC Prime)", "BETESA (Bluesite)", "3D Skills (Bluesite)", "Psicoalianza", "Máquina de Turing (TuringLab)",
  ]);
  assert.match(b.html, /tally\.so\/r\/Pdg8EB/);
  assert.match(b.html, /16personalities\.com\/es\/test-de-personalidad/);
  assert.match(arma("en").html, /16personalities\.com\/free-personality-test/);
  assert.equal((b.html.match(/PEGAR ENLACE PERSONALIZADO/g) || []).length, 5);
});

test("escapa HTML en datos del candidato", () => {
  const b = armarBorrador({ catalogo: CATALOGO, lang: "es", candidateName: "x", firstName: "<b>x", vacancyTitle: "a&b" });
  assert.match(b.html, /&lt;b&gt;x/);
  assert.match(b.html, /a&amp;b/);
});

const fila = {
  candidate_id: "00000000-0000-0000-0000-000000000000", vacancy_id: null, modo: "dry_run" as const, idioma: "es" as const,
  pruebas: ["disc_prime"], placeholders: [], draft_id: null, gmail_email: null, creado_por: null,
};
const cliente = (r: { data?: any; error?: { message: string } | null; throws?: boolean }) => {
  const usadas: string[] = [];
  return {
    usadas,
    from: (t: string) => {
      usadas.push(t);
      return { insert: () => ({ select: () => ({ single: async () => {
        if (r.throws) throw new Error("red caída");
        return { data: r.data ?? null, error: r.error ?? null };
      } }) }) };
    },
  };
};

test("registro: OK devuelve id y usa la tabla nueva", async () => {
  const c = cliente({ data: { id: "abc", created_at: "2026-11-04T00:00:00Z" } });
  const r = await registrarBorrador(c, fila);
  assert.deepEqual(r, { ok: true, id: "abc", created_at: "2026-11-04T00:00:00Z" });
  assert.deepEqual(c.usadas, [TABLA_REGISTRO]);
});

test("registro: el error de PostgREST ya no se traga", async () => {
  const orig = console.error; const logs: string[] = []; console.error = (m: string) => logs.push(m);
  try {
    const r = await registrarBorrador(cliente({ error: { message: "relation does not exist" } }), fila);
    assert.deepEqual(r, { ok: false, error: "relation does not exist" });
    const r2 = await registrarBorrador(cliente({ throws: true }), fila);
    assert.deepEqual(r2, { ok: false, error: "red caída" });
    assert.equal(logs.length, 2);
  } finally { console.error = orig; }
});
