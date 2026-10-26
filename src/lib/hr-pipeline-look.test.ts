import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accionHoy,
  compEventNote,
  compStatusOf,
  daysSince,
  mergeCompStatus,
  nombreCorto,
  paisDe,
  shortCandidateId,
  stageLabelUi,
  stageTechTip,
} from "./hr-pipeline-look";

describe("stage labels humanos", () => {
  it("muestra Pruebas de batería y deja el code en el tooltip", () => {
    assert.equal(stageLabelUi("pruebas"), "Pruebas de batería");
    assert.equal(stageLabelUi("bateria_psicometrica"), "Pruebas de batería");
    assert.equal(stageTechTip("bateria_psicometrica"), "stage: bateria_psicometrica");
  });

  it("traduce Terna y la entrevista a español de la vista", () => {
    assert.equal(stageLabelUi("terna"), "Terna para el líder");
    assert.equal(stageLabelUi("recruiter_interview"), "Entrevista con reclutador");
    assert.equal(stageLabelUi("prefiltro_enviado"), "Prefiltro enviado");
  });
});

describe("SLA · rojo solo acción hoy", () => {
  it("dentro del SLA queda calmado", () => {
    assert.equal(accionHoy(3, 5), false);
    assert.equal(accionHoy(5, 5), false);
  });

  it("pasado el SLA es acción hoy", () => {
    assert.equal(accionHoy(6, 5), true);
    assert.equal(accionHoy(54, 5), true);
  });

  it("cuenta días enteros desde la fecha", () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    assert.equal(daysSince("2026-10-20T12:00:00Z", now), 6);
    assert.equal(daysSince(null, now), 0);
  });
});

describe("meta de la card", () => {
  it("arma id corto, país y dueño", () => {
    assert.equal(shortCandidateId("10482abc-0000-4000-8000-000000000000"), "ATS-10482");
    assert.equal(paisDe({ vacancyCountry: "Colombia", location: "Lima, Perú" }), "Colombia");
    assert.equal(paisDe({ location: "Barranquilla, Atlántico, Colombia" }), "Colombia");
    assert.deepEqual(nombreCorto("Kelly Castañeda"), { initials: "KC", short: "Kelly C." });
    assert.equal(nombreCorto("").short, "Sin dueño");
  });
});

describe("chips Comp", () => {
  it("traduce sent y fail, y no inventa un estado", () => {
    assert.equal(compStatusOf("sent"), "sent");
    assert.equal(compStatusOf("comp:fail"), "fail");
    assert.equal(compStatusOf("error"), "fail");
    assert.equal(compStatusOf("skipped"), null);
    assert.equal(compEventNote("sent"), "comp:sent");
    assert.equal(compEventNote("error"), "comp:fail");
    assert.equal(compEventNote("skipped"), null);
  });

  it("prefiere la fila y si no, el último evento", () => {
    const merged = mergeCompStatus(
      [
        { id: "a", comp_preview_status: "sent" },
        { id: "b" },
        { id: "c" },
      ],
      [
        { candidate_id: "b", note: "comp:fail" },
        { candidate_id: "b", note: "comp:sent" },
      ],
    );
    assert.equal(merged[0].comp_preview_status, "sent");
    assert.equal(merged[1].comp_preview_status, "fail");
    assert.equal(merged[2].comp_preview_status, null);
  });
});
