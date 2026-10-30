import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { STATUS_HINT } from "./requisitions.ts";
import {
  ETIQUETA_SIN_DATO,
  HIDDEN_REASONS,
  POR_CONSTRUIR,
  TARJETAS_CONTEO,
  aplicarVisibilidad,
  clasificarConteo,
  contarTarjetas,
  decidirIncludeHidden,
  etiquetaTarjeta,
  textoConteo,
} from "./requisition-board.ts";
import {
  enlaceConSrc,
  etiquetaLlegada,
  fuentesFallback,
  resolverArrivalSource,
  validarAltaFuente,
  validarCambioFuente,
  validarFuente,
} from "./recruitment-sources.ts";

const RECHAZO = "El CWO no la aprobó";

describe("ocultar", () => {
  it("las dos razones viven en un solo constante", () => {
    assert.deepEqual(
      HIDDEN_REASONS.map((r) => r.key),
      ["duplicada", "fuera_del_ats"],
    );
    assert.deepEqual(
      HIDDEN_REASONS.map((r) => r.label),
      ["Duplicada", "Fuera del ATS"],
    );
  });

  it("la duplicada rechazada no dice que el CWO no la aprobó", () => {
    const et = etiquetaTarjeta({
      status: "rechazada",
      hidden_at: "2026-10-30T17:00:00.000Z",
      hidden_reason: "duplicada",
    });
    assert.equal(et.oculta, true);
    assert.equal(et.label, "Duplicada");
    assert.equal(et.hint, null);
    assert.equal(et.label === STATUS_HINT.rechazada, false);
    assert.equal(String(et.hint ?? "").includes(RECHAZO), false);
    assert.equal(et.label.includes("Rechazada"), false);
  });

  it("flota oculta dice Fuera del ATS y sigue clasificada como oculta", () => {
    const row = {
      status: "pedida",
      hidden_at: "2026-10-30T17:00:00.000Z",
      hidden_reason: "fuera_del_ats",
      vacancy_status: null,
    };
    assert.equal(clasificarConteo(row), "ocultas");
    assert.equal(etiquetaTarjeta({ ...row, status: "pedida" }).label, "Fuera del ATS");
  });

  it("include_hidden=1 sin admin se rechaza; el default no incluye ocultas", () => {
    assert.deepEqual(decidirIncludeHidden({ includeHidden: false, esAdmin: false }), {
      ok: true,
      incluir: false,
    });
    assert.deepEqual(decidirIncludeHidden({ includeHidden: true, esAdmin: false }), {
      ok: false,
      status: 403,
      error: "include_hidden es solo para hr-admin",
    });
    assert.deepEqual(decidirIncludeHidden({ includeHidden: true, esAdmin: true }), {
      ok: true,
      incluir: true,
    });

    const calls: string[] = [];
    const q = {
      is(column: string, value: null) {
        calls.push(`${column}=${value}`);
        return q;
      },
    };
    aplicarVisibilidad(q, false);
    assert.deepEqual(calls, ["hidden_at=null"]);
    calls.length = 0;
    aplicarVisibilidad(q, true);
    assert.deepEqual(calls, []);
  });
});

describe("tarjetas de conteo", () => {
  it("la definición está en un solo lugar", () => {
    assert.deepEqual(
      TARJETAS_CONTEO.map((t) => [t.key, t.label]),
      [
        ["publicadas", "Publicadas"],
        ["archivadas", "Archivadas"],
        ["cerradas", "Cerradas"],
        ["ocultas", "Duplicadas/ocultas"],
      ],
    );
  });

  it("publicada abierta, publicada cerrada, rechazada visible, oculta", () => {
    assert.equal(clasificarConteo({ status: "publicada", hidden_at: null, vacancy_status: "open" }), "publicadas");
    assert.equal(clasificarConteo({ status: "publicada", hidden_at: null, vacancy_status: "closed" }), "archivadas");
    assert.equal(clasificarConteo({ status: "rechazada", hidden_at: null, vacancy_status: null }), "cerradas");
    assert.equal(clasificarConteo({ status: "publicada", hidden_at: null, vacancy_status: "paused" }), null);
    assert.equal(clasificarConteo({ status: "pedida", hidden_at: null, vacancy_status: null }), null);
  });

  it("la línea base de después: 3 abiertas, 6 cerradas de vacante, 0 rechazadas visibles, 2 ocultas", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => ({ status: "publicada", hidden_at: null, vacancy_status: "open" })),
      ...Array.from({ length: 6 }, () => ({ status: "publicada", hidden_at: null, vacancy_status: "closed" })),
      { status: "pedida", hidden_at: "t", hidden_reason: "fuera_del_ats", vacancy_status: null },
      { status: "rechazada", hidden_at: "t", hidden_reason: "duplicada", vacancy_status: null },
    ];
    assert.deepEqual(contarTarjetas(rows), {
      publicadas: 3,
      archivadas: 6,
      cerradas: 0,
      ocultas: 2,
    });
    assert.equal(textoConteo(0), "0");
    assert.equal(textoConteo(null), POR_CONSTRUIR);
  });

  it("sin filas cargadas, las cuatro dicen por construir", () => {
    const counts = contarTarjetas(null);
    for (const tarjeta of TARJETAS_CONTEO) {
      assert.equal(textoConteo(counts[tarjeta.key]), POR_CONSTRUIR);
    }
  });
});

describe("fuentes", () => {
  it("el fallback cubre la semilla, incluido otro, para que los 14 postings sigan siendo válidos", () => {
    const keys = fuentesFallback().map((f) => f.key);
    for (const key of ["careers", "linkedin", "turpial", "magneto", "referidos", "otro"]) {
      assert.equal(keys.includes(key), true, key);
    }
  });

  it("marcar exige una fuente activa; desmarcar deja pasar una inactiva", () => {
    const catalogo = [
      { key: "careers", active: true },
      { key: "turpial", active: false },
    ];
    assert.equal(validarFuente("careers", catalogo, "marcar").ok, true);
    const inactiva = validarFuente("turpial", catalogo, "marcar");
    assert.equal(inactiva.ok, false);
    assert.equal(validarFuente("turpial", catalogo, "desmarcar").ok, true);
    assert.equal(validarFuente("no-existe", catalogo, "marcar").ok, false);
    assert.equal(validarFuente("linkedin", catalogo, "marcar").ok, false);
  });

  it("alta y cambio no aceptan borrar", () => {
    assert.equal(validarAltaFuente({ key: "Elempleo", label: "elempleo" }).ok, true);
    assert.equal(validarAltaFuente({ key: "con espacio", label: "X" }).ok, false);
    assert.equal(validarCambioFuente({ key: "turpial", active: false }).ok, true);
    assert.equal(validarCambioFuente({ key: "turpial", label: "Turpial Jobs" }).ok, true);
    assert.equal(validarCambioFuente({ key: "turpial" }).ok, false);
  });
});

describe("src de llegada", () => {
  const activas = ["careers", "linkedin", "turpial"];

  it("guarda ?src= solo si la fuente está activa y no toca el canal source", () => {
    assert.equal(resolverArrivalSource("turpial", activas), "turpial");
    assert.equal(resolverArrivalSource("TURPIAL", activas), "turpial");
    assert.equal(resolverArrivalSource("magneto", activas), null);
    assert.equal(resolverArrivalSource("", activas), null);
    assert.equal(resolverArrivalSource("no-existe", activas), null);
    assert.equal(resolverArrivalSource("public_form", activas), null);
  });

  it("el enlace externo lleva src y careers directo no", () => {
    assert.equal(
      enlaceConSrc("https://careers.example/vacantes/20", "linkedin"),
      "https://careers.example/vacantes/20?src=linkedin",
    );
    assert.equal(enlaceConSrc("https://careers.example/vacantes/20", "careers"), "https://careers.example/vacantes/20");
  });

  it("llegada null se lee sin dato", () => {
    assert.equal(etiquetaLlegada(null, fuentesFallback()), ETIQUETA_SIN_DATO);
    assert.equal(etiquetaLlegada("linkedin", fuentesFallback()), "LinkedIn");
  });
});

describe("migraciones", () => {
  const oculta = readFileSync("supabase/migrations/20261030_requisicion_oculta.sql", "utf8");
  const fuentes = readFileSync("supabase/migrations/20261030_recruitment_sources.sql", "utf8");

  it("oculta las dos filas sin cambiar status y deja la canónica fuera de los UPDATE", () => {
    assert.match(oculta, /22c60d38-590b-4789-a1df-fe3d8f77d2ec/);
    assert.match(oculta, /8e597f02-a1dd-47ba-94f6-db4521224077/);
    assert.match(oculta, /hidden_reason = 'duplicada'/);
    assert.match(oculta, /hidden_reason = 'fuera_del_ats'/);
    assert.match(oculta, /cwo@tradingsolutions.com/);
    assert.match(oculta, /hidden_reason in \('duplicada','fuera_del_ats'\)/);
    assert.match(oculta, /ht_requisitions_backup_20261030/);
    assert.equal(/delete\s+from\s+ht_requisitions\b/i.test(oculta), false);
    assert.equal(/delete\s+from\s+ht_requisition_events\b/i.test(oculta), false);

    const updates = [...oculta.matchAll(/update\s+ht_requisitions[\s\S]*?;/gi)].map((m) => m[0]);
    assert.equal(updates.length, 2);
    for (const update of updates) {
      assert.equal(update.includes("63f67118"), false);
      assert.equal(/\bstatus\s*=/.test(update), false);
    }
  });

  it("reemplaza el CHECK de postings por FK y siembra las seis claves", () => {
    assert.match(fuentes, /create table if not exists ht_recruitment_sources/i);
    assert.match(fuentes, /drop constraint if exists ht_vacancy_postings_source_check/);
    assert.match(fuentes, /foreign key \(source\) references ht_recruitment_sources \(key\)/);
    assert.match(fuentes, /arrival_source/);
    for (const key of ["careers", "linkedin", "turpial", "magneto", "referidos", "otro"]) {
      assert.match(fuentes, new RegExp(`'${key}'`));
    }
    assert.equal(/delete\s+from\s+ht_vacancy_postings\b/i.test(fuentes), false);
    assert.equal(/delete\s+from\s+ht_candidates\b/i.test(fuentes), false);
  });
});
