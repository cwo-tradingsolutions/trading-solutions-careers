import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMP_JOB_OFFER_PREVIEW_ENABLED_ENV,
  COMP_JOB_OFFER_WEBHOOK_URL_ENV,
  buildCompJobOfferPreview,
  deliverCompJobOfferPreview,
  forbiddenPayloadKeys,
  loadOfertaCompSource,
  resolveCompHookPlan,
  sourceFromRows,
  type CompPreviewEnv,
  type OfertaCompSource,
} from "./comp-job-offer-preview";

const CANDIDATE = "cand-1";
const VACANCY = "vac-1";

function previewEnv(overrides: CompPreviewEnv = {}): CompPreviewEnv {
  return {
    VERCEL_ENV: "preview",
    [COMP_JOB_OFFER_PREVIEW_ENABLED_ENV]: "true",
    [COMP_JOB_OFFER_WEBHOOK_URL_ENV]: "https://comp.example/preview",
    ...overrides,
  };
}

function source(partial: Partial<OfertaCompSource> = {}): OfertaCompSource {
  return {
    candidate_id: CANDIDATE,
    name: "Ada Lovelace",
    email: "ada@example.com",
    preferred_language: "es",
    location: "Barranquilla",
    vacancy_id: VACANCY,
    cargo: "Pricing Analyst",
    country: "Colombia",
    region: "Caribe",
    hiring_lead_email: "lead@tradingsolutions.com",
    requisition_id: "req-1",
    reporta_a: "CWO",
    ubicacion_perfil: "Barranquilla, Atlántico",
    ...partial,
  };
}

describe("resolveCompHookPlan", () => {
  it("prepara el preview al entrar a oferta desde terna", () => {
    const plan = resolveCompHookPlan({
      fromStage: "terna",
      toStage: "oferta",
      manualPreview: false,
      candidateId: CANDIDATE,
      vacancyId: VACANCY,
      env: previewEnv(),
    });
    assert.equal(plan.kind, "prepare");
    if (plan.kind === "prepare") assert.equal(plan.idempotency_key, `${CANDIDATE}:${VACANCY}`);
  });

  it("acepta fases de hiring previas y las que quedan entre terna y oferta", () => {
    for (const fromStage of ["pruebas", "recruiter_interview", "prueba_tecnica", "examenes_medicos", "estudio_seguridad", "documentacion_ingreso", "cwo_interview"]) {
      const plan = resolveCompHookPlan({
        fromStage,
        toStage: "oferta",
        manualPreview: false,
        candidateId: CANDIDATE,
        vacancyId: VACANCY,
        env: previewEnv(),
      });
      assert.equal(plan.kind, "prepare", fromStage);
    }
  });

  it("no re-dispara si ya está en oferta", () => {
    const plan = resolveCompHookPlan({
      fromStage: "oferta",
      toStage: "oferta",
      manualPreview: true,
      candidateId: CANDIDATE,
      vacancyId: VACANCY,
      env: previewEnv(),
    });
    assert.equal(plan.kind, "skip");
    if (plan.kind === "skip") assert.equal(plan.result.reason, "already_oferta");
  });

  it("omite aplico y prefiltro salvo flag manual, y nunca sale de terminal", () => {
    const odd = resolveCompHookPlan({
      fromStage: "aplico",
      toStage: "oferta",
      manualPreview: false,
      candidateId: CANDIDATE,
      vacancyId: VACANCY,
      env: previewEnv(),
    });
    assert.equal(odd.kind, "skip");
    if (odd.kind === "skip") assert.equal(odd.result.reason, "odd_from_stage");

    const prefiltro = resolveCompHookPlan({
      fromStage: "prefiltro_pasado",
      toStage: "oferta",
      manualPreview: false,
      candidateId: CANDIDATE,
      vacancyId: VACANCY,
      env: previewEnv(),
    });
    assert.equal(prefiltro.kind, "skip");

    const manual = resolveCompHookPlan({
      fromStage: "prefiltro_enviado",
      toStage: "oferta",
      manualPreview: true,
      candidateId: CANDIDATE,
      vacancyId: VACANCY,
      env: previewEnv(),
    });
    assert.equal(manual.kind, "prepare");

    for (const fromStage of ["rechazado", "contratado", "onboarding", "prefiltro_rechazado"]) {
      const terminal = resolveCompHookPlan({
        fromStage,
        toStage: "oferta",
        manualPreview: true,
        candidateId: CANDIDATE,
        vacancyId: VACANCY,
        env: previewEnv(),
      });
      assert.equal(terminal.kind, "skip", fromStage);
      if (terminal.kind === "skip") assert.equal(terminal.result.reason, "terminal_from_stage");
    }
  });

  it("producción no llama aunque el flag y el URL estén puestos", () => {
    const plan = resolveCompHookPlan({
      fromStage: "terna",
      toStage: "oferta",
      manualPreview: false,
      candidateId: CANDIDATE,
      vacancyId: VACANCY,
      env: previewEnv({ VERCEL_ENV: "production" }),
    });
    assert.equal(plan.kind, "skip");
    if (plan.kind === "skip") assert.equal(plan.result.reason, "prod_hold");
  });

  it("sin flag o sin URL se omite", () => {
    const flagOff = resolveCompHookPlan({
      fromStage: "terna",
      toStage: "oferta",
      manualPreview: false,
      candidateId: CANDIDATE,
      vacancyId: VACANCY,
      env: previewEnv({ [COMP_JOB_OFFER_PREVIEW_ENABLED_ENV]: "" }),
    });
    assert.equal(flagOff.kind, "skip");
    if (flagOff.kind === "skip") assert.equal(flagOff.result.reason, "flag_off");

    const noUrl = resolveCompHookPlan({
      fromStage: "terna",
      toStage: "oferta",
      manualPreview: false,
      candidateId: CANDIDATE,
      vacancyId: VACANCY,
      env: previewEnv({ [COMP_JOB_OFFER_WEBHOOK_URL_ENV]: "  " }),
    });
    assert.equal(noUrl.kind, "skip");
    if (noUrl.kind === "skip") assert.equal(noUrl.result.reason, "url_missing");
  });
});

describe("buildCompJobOfferPreview", () => {
  it("arma el payload de preview y deja fuera salario, empleador, ESC2 y EC", () => {
    const dirty = source() as OfertaCompSource & {
      salary_aspiration_cop: number;
      salary_cap_cop: number;
      salario_propuesto: number;
      empleador: string;
      esc2: string;
      ec: string;
    };
    dirty.salary_aspiration_cop = 4_000_000;
    dirty.salary_cap_cop = 5_000_000;
    dirty.salario_propuesto = 4_500_000;
    dirty.empleador = "Trading Solutions";
    dirty.esc2 = "ESC2";
    dirty.ec = "EC";

    const built = buildCompJobOfferPreview(dirty);
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.deepEqual(forbiddenPayloadKeys(built.payload), []);
    assert.deepEqual(Object.keys(built.payload).sort(), [
      "candidate_id",
      "cargo",
      "country",
      "email",
      "hiring_lead_email",
      "idioma",
      "name",
      "preview",
      "region",
      "reporta_a",
      "requisition_id",
      "stage",
      "ubicacion",
      "vacancy_id",
    ]);
    assert.equal(built.payload.stage, "oferta");
    assert.equal(built.payload.preview, true);
    assert.equal(built.payload.idioma, "es");
    assert.equal(built.payload.ubicacion, "Barranquilla");
    assert.equal(built.payload.cargo, "Pricing Analyst");
    const serialized = JSON.stringify(built.payload);
    assert.equal(serialized.includes("ESC2"), false);
    assert.equal(serialized.includes("4000000"), false);
    assert.equal(serialized.includes("empleador"), false);
    assert.equal(serialized.includes("\"ec\""), false);
  });

  it("no inventa name, email ni cargo", () => {
    const built = buildCompJobOfferPreview(source({ name: "  ", email: "", cargo: null }));
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.deepEqual(built.missing, ["name", "email", "cargo"]);
  });

  it("usa la ubicación del perfil solo si el candidato no tiene location", () => {
    const built = buildCompJobOfferPreview(source({ location: null, country: null, region: null }));
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.payload.ubicacion, "Barranquilla, Atlántico");
    assert.equal(built.payload.country, null);
    assert.equal(built.payload.region, null);
  });

  it("lee reporta_a del lead_profile y no copia el tope", () => {
    const row = sourceFromRows(
      {
        id: CANDIDATE,
        name: "Ada",
        email: "ada@example.com",
        location: null,
        preferred_language: "en",
        vacancy_id: VACANCY,
      },
      {
        id: VACANCY,
        title: "Analyst",
        country: null,
        hiring_lead_email: "lead@tradingsolutions.com",
        requisition_id: "req-9",
      },
      {
        id: "req-9",
        lead_profile: {
          reporta_a: "Gerencia",
          ubicacion: "Medellín",
          region: "Andina",
          salario_tope: "COP 6.000.000",
          esc2: "no",
          ec: "no",
        },
      },
    );
    const built = buildCompJobOfferPreview(row);
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.payload.reporta_a, "Gerencia");
    assert.equal(built.payload.ubicacion, "Medellín");
    assert.equal(built.payload.region, "Andina");
    assert.equal(built.payload.idioma, "en");
    assert.equal(JSON.stringify(built.payload).includes("salario_tope"), false);
    assert.equal(JSON.stringify(built.payload).includes("esc2"), false);
  });
});

describe("loadOfertaCompSource", () => {
  it("no selecciona salario ni ESC2 y resuelve la requisición por vacancy_id", async () => {
    const selects: string[] = [];
    const db = {
      from(table: string) {
        return {
          select(columns: string) {
            selects.push(`${table}:${columns}`);
            return {
              eq(column: string) {
                return {
                  maybeSingle: async () => {
                    if (table === "ht_candidates") {
                      return {
                        data: {
                          id: CANDIDATE,
                          name: "Ada",
                          email: "ada@example.com",
                          location: "Barranquilla",
                          preferred_language: "es",
                          vacancy_id: VACANCY,
                        },
                        error: null,
                      };
                    }
                    if (table === "ht_vacancies") {
                      return {
                        data: {
                          id: VACANCY,
                          title: "Analyst",
                          country: "Colombia",
                          hiring_lead_email: "lead@tradingsolutions.com",
                          requisition_id: null,
                        },
                        error: null,
                      };
                    }
                    if (column === "vacancy_id") {
                      return {
                        data: { id: "req-2", lead_profile: { reporta_a: "CFO" } },
                        error: null,
                      };
                    }
                    return { data: null, error: null };
                  },
                  order() {
                    return {
                      limit() {
                        return {
                          maybeSingle: async () => ({
                            data: { id: "req-2", lead_profile: { reporta_a: "CFO" } },
                            error: null,
                          }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    const loaded = await loadOfertaCompSource(db as unknown as SupabaseClient, CANDIDATE);
    assert.ok(loaded);
    assert.equal(loaded?.reporta_a, "CFO");
    assert.equal(loaded?.requisition_id, "req-2");
    assert.equal(selects.some((s) => /salary|esc2|empleador|\bec\b/i.test(s)), false);
    assert.ok(selects.some((s) => s.startsWith("ht_requisitions:")));
  });
});

describe("deliverCompJobOfferPreview", () => {
  it("manda preview:true y no sigue redirects", async () => {
    const built = buildCompJobOfferPreview(source());
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const calls: Array<{ url: string; body: string; redirect?: RequestRedirect }> = [];
    const sent = await deliverCompJobOfferPreview(built.payload, {
      url: "https://comp.example/preview",
      idempotencyKey: `${CANDIDATE}:${VACANCY}`,
      fetchImpl: async (url, init) => {
        calls.push({
          url: String(url),
          body: String(init?.body ?? ""),
          redirect: init?.redirect,
        });
        return new Response("ok", { status: 202 });
      },
    });
    assert.equal(sent.status, "sent");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].redirect, "manual");
    const body = JSON.parse(calls[0].body) as Record<string, unknown>;
    assert.equal(body.preview, true);
    assert.equal(body.stage, "oferta");
    assert.equal(body.auto_send, undefined);
    assert.equal(forbiddenPayloadKeys(body).length, 0);

    const redirected = await deliverCompJobOfferPreview(built.payload, {
      url: "https://comp.example/preview",
      idempotencyKey: `${CANDIDATE}:${VACANCY}`,
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://comp.example/send" } }),
    });
    assert.equal(redirected.status, "error");

    const down = await deliverCompJobOfferPreview(built.payload, {
      url: "https://comp.example/preview",
      idempotencyKey: `${CANDIDATE}:${VACANCY}`,
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    assert.equal(down.status, "error");
    if (down.status === "error") assert.match(down.detail, /network down/);
  });
});
