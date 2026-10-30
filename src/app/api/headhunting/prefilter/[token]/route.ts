/**
 * GET  /api/headhunting/prefilter/[token]  — valida token y devuelve datos del candidato
 * POST /api/headhunting/prefilter/[token]  — guarda respuestas + calcula decisión + crea
 *                                            draft de descarte si aplica
 *
 * Lógica de decisión salarial (regla Kelly):
 *   - salario lower bound ≤ techo            → 'pass'    (sigue en proceso)
 *   - techo < lower bound ≤ techo + 1M       → 'review'  (revisión humana)
 *   - lower bound > techo + 1M               → 'reject'  (auto-descarte + draft email)
 *
 * Ranges del form (lower bound):
 *   "< 3 M" → 0; "3 – 4 M" → 3M; "4 – 5 M" → 4M; ... "8 M+" → 8M
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected, sendViaGmail } from "@/lib/gmail";
import { recordStageEvent } from "@/lib/stage-events";
import { resolveCandidateLang, EN_SIGNATURE_NAME } from "@/lib/candidate-lang";
import { TEMPLATE_ENGLISH_MIN_RANK, TEMPLATE_SALARY_CAP, type TemplateKey } from "@/lib/prefilter-templates";

// Techos por vacancy_id (en COP mensuales)
const SALARY_CAPS: Record<string, number> = {
  "368006e7-98da-46a2-b871-6b741290821b": 4_000_000, // Pricing Senior
  "c25ce70b-9244-4393-aea6-75372a99a6ef": 4_000_000, // Inside Sales
  "6e4838dd-8aea-4426-bd26-ea588f0f493a": 3_000_000, // Customer Documentation
  "d354c55a-eb1c-4aee-bd02-b0a20162e1f1": 3_500_000, // Pricing Junior
  "8c246bb3-8244-4755-bf92-58c0c627821c": 6_000_000, // Lead Accounting Finance
};

const SALARY_LOWER: Record<string, number> = {
  "< 3 M": 0,
  "3 – 4 M": 3_000_000,
  "4 – 5 M": 4_000_000,
  "5 – 6 M": 5_000_000,
  "6 – 7 M": 6_000_000,
  "7 – 8 M": 7_000_000,
  "8 M+": 8_000_000,
};

// Inglés mínimo · DEFAULT B2 para cualquier vacante, con overrides por vacante
// específica (ej: Pricing Senior pide C1). Si el candidato declara un nivel
// inferior → el prefilter lo marca rechazado con motivo "idioma_insuficiente".
const DEFAULT_ENGLISH_MIN_RANK = 4; // B2

const ENGLISH_MIN_RANK_OVERRIDES: Record<string, number> = {
  "368006e7-98da-46a2-b871-6b741290821b": 5, // Pricing Senior · C1

  // ── Especialista SIG-SST · minimo B1 ──────────────────────────────────
  // El aviso pide B2, pero el ingles NO descalifica en este cargo: el filtro
  // real son las credenciales de ley. Decision de Wellness, 7-sep-2026.
  //
  // OJO, ESTA EXCEPCION NUNCA SE APLICO A NADIE. Se escribio apuntando a
  // 52e41180, que es el registro gemelo sin candidatos. Los 47 candidatos
  // reales viven en d369cefb (Integrated Management Systems & HSE
  // Specialist), asi que entre el 7 y el 24 de septiembre el prefiltro
  // siguio rechazando por B1 a seis personas en la vacante real -- entre
  // ellas Edwin Navarro Florian, que despues quedo primero en el ranking
  // con 4.33. Se dejan las tres ids porque el cargo esta duplicado en la
  // base y cualquiera de ellas puede recibir una aplicacion.
  "d369cefb-4f1e-4ba7-bc1e-b050fdf9ae5f": 3, // la viva · 47 candidatos
  "52e41180-79ca-48c5-97d1-f385f4d44dde": 3, // gemela
  "b0ab0b08-8fed-43b1-b083-918d8fb013a6": 3, // gemela cerrada
};

/**
 * El minimo de ingles de una vacante: primero su override, luego el default
 * del template, y solo al final el global.
 *
 * El orden importa. La configuracion por id de vacante es la que fallo en
 * septiembre: el cargo existia dos veces y la excepcion quedo escrita en el
 * gemelo sin candidatos. El default por template viaja con el tipo de cargo,
 * asi que una vacante nueva —o un duplicado— nace con la regla correcta.
 */
function getEnglishMinRank(vacancyId: string, templateKey?: string): number {
  const porVacante = ENGLISH_MIN_RANK_OVERRIDES[vacancyId];
  if (porVacante != null) return porVacante;
  const porTemplate = templateKey
    ? TEMPLATE_ENGLISH_MIN_RANK[templateKey as TemplateKey]
    : undefined;
  return porTemplate ?? DEFAULT_ENGLISH_MIN_RANK;
}

const ENGLISH_RANK: Record<string, number> = {
  "A1 (básico)": 1,
  "A2 (elemental)": 2,
  "B1 (intermedio)": 3,
  "B2 (intermedio alto)": 4,
  "C1 (avanzado)": 5,
  "C2 (nativo / fluido)": 6,
};

// China prefilter usa niveles en inglés cortos (B1/B2/C1/C2). Mínimo B2.
const CHINA_ENGLISH_RANK: Record<string, number> = {
  "B1": 3,
  "B2": 4,
  "C1": 5,
  "C2": 6,
};
const CHINA_ENGLISH_MIN_RANK = 4; // B2

// Que tan firme es el dato detras de cada regla. Lo que el candidato declara
// sobre si mismo es blando; lo que se verifica contra un documento es duro.
const SEVERIDAD_POR_REGLA: Record<string, Severidad> = {
  sin_licencia_sst: "duro",
  licencia_vencida: "duro",
  sin_curso_50_horas: "duro",
  sin_autorizacion_trabajo_china: "duro",
  sin_autorizacion_trabajo_panama: "duro",
  sin_tarjeta_profesional: "duro",
  ingles_a1_a2: "blando",
  ingles_b1: "blando",
  ingles_b2_para_c1: "blando",
  sobre_banda: "blando",
  pretension_salarial: "blando",
  sin_disponibilidad_presencial: "blando",
  sin_experiencia_rol: "blando",
  anos_industria: "blando",
  anos_freight_panama: "blando",
  // Customer Documentation · todo lo que declara el candidato de si mismo
  sin_experiencia_doc_comex: "blando",
  sin_conciliacion_facturas: "blando",
  sin_documentos_comex: "blando",
  criterio_caso_documental: "blando",
};

// Normaliza un valor Yes/No (bool o string) a booleano.
function isYes(v: unknown): boolean {
  if (v === true) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "yes" || s === "si" || s === "sí" || s === "true";
}

type Decision = "pass" | "review" | "reject";

// Un dato "blando" lo escribio el candidato sobre si mismo y se equivoca a
// menudo: nivel de idioma, aspiracion, disponibilidad. Un dato "duro" se
// verifica contra un hecho: sin licencia vigente no se puede ejercer el
// cargo, sin autorizacion no se puede trabajar en el pais. La severidad no
// decide nada; ordena la cola de revision, porque un no equivocado sobre un
// dato blando es el que sale caro.
type Severidad = "duro" | "blando";

type Bloqueo = {
  regla: string;
  severidad: Severidad;
  categoria: string;
  sub_detail: string;
  valor?: string | null;
  contradiccion?: string | null;
};

const PRUEBAS_IDIOMA =
  /\b(ielts|toefl|toeic|cet[\s-]?[46]|tem[\s-]?[48]|cambridge|fce|cae|cpe|duolingo|pte|aptis|efset)\b/i;
const SENALES_IDIOMA =
  /(main working language|working language|multinational|native speaker|lived abroad|living abroad|studied abroad|medium of instruction|bilingual)/i;

/**
 * Busca en el texto libre una senal que obligue a mirar el nivel que el
 * candidato marco en el desplegable antes de creerselo.
 *
 * El caso que origino esto: Charlotte Cheng, la segunda del ranking de China,
 * marco "B1" y en el campo de al lado escribio "IELTS 7.5 overall, more than
 * 7 years in multinational companies with English as the main working
 * language". El formulario la descarto solo. IELTS 7.5 es C1.
 *
 * No afirma que el nivel este mal: dice que hay algo que una persona tiene
 * que leer. CET-4 tambien entra, porque su puntaje decide si llega a B2.
 */
function senalContrariaIdioma(texto: unknown): string | null {
  const t = String(texto ?? "").trim();
  if (t.length < 8) return null;
  const prueba = t.match(PRUEBAS_IDIOMA);
  if (prueba) return `menciona ${prueba[0].toUpperCase()} - verificar el puntaje`;
  const senal = t.match(SENALES_IDIOMA);
  if (senal) return `menciona "${senal[0]}"`;
  return null;
}

function decideFromSalary(salaryRange: string, vacancyId: string, templateKey?: string): { decision: Decision; cap: number | null; lowerBound: number | null } {
  const cap =
    SALARY_CAPS[vacancyId] ??
    (templateKey ? TEMPLATE_SALARY_CAP[templateKey as TemplateKey] ?? null : null);
  const lower = SALARY_LOWER[salaryRange] ?? null;
  if (cap == null || lower == null) {
    // Sin cap configurado o rango desconocido → review (humano decide)
    return { decision: "review", cap, lowerBound: lower };
  }
  if (lower <= cap) return { decision: "pass", cap, lowerBound: lower };
  if (lower <= cap + 1_000_000) return { decision: "review", cap, lowerBound: lower };
  return { decision: "reject", cap, lowerBound: lower };
}

/**
 * Devuelve el sub-detalle de rechazo según el nivel del candidato vs requerido.
 * null si el candidato cumple el mínimo.
 */
function checkEnglishLevel(englishLevel: string | undefined, vacancyId: string, templateKey?: string): { fails: boolean; sub_detail: string | null; minRank: number; candidateRank: number } {
  const minRank = getEnglishMinRank(vacancyId, templateKey);
  const candidateRank = ENGLISH_RANK[String(englishLevel || "")] ?? 0;
  if (candidateRank === 0) {
    return { fails: false, sub_detail: null, minRank, candidateRank };
  }
  if (candidateRank >= minRank) {
    return { fails: false, sub_detail: null, minRank, candidateRank };
  }
  // Falla · pick sub_detail
  let sub: string;
  if (candidateRank <= 2) sub = "ingles_a1_a2";
  else if (candidateRank === 3) sub = "ingles_b1";
  else if (candidateRank === 4) sub = "ingles_b2_para_c1";
  else sub = "ingles_b1";
  return { fails: true, sub_detail: sub, minRank, candidateRank };
}

/**
 * Tope mensual (USD bruto) aprobado para el cargo de China.
 *
 * NO descarta: quien pide más queda en revisión con la bandera puesta. El
 * salario se negocia y el presupuesto puede moverse; lo que no puede pasar es
 * que alguien que pide el doble aparezca como «pasó el prefiltro» y se le
 * gaste una entrevista sin que nadie lo haya visto.
 */
const CHINA_SALARY_CAP_USD = 1500;

/**
 * Tope mensual USD (bruto) para Panama Operations Specialist.
 * Igual que China: sobre el tope = flag/review, NUNCA auto-reject.
 */
const PANAMA_OPS_SALARY_CAP_USD = 1500;

/** Inglés corto EN (A1–C2). Mínimo soft B1 para panama_ops. */
const PANAMA_OPS_ENGLISH_RANK: Record<string, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};
const PANAMA_OPS_ENGLISH_MIN_RANK = 3; // B1
const PANAMA_OPS_YEARS_MIN = 4;

/**
 * Lee un monto o un rango en USD.
 * "USD 2,500" y "2.300" → 2500 / 2300 (el punto de miles no es decimal).
 * "1800-2000" → min 1800, max 2000. "1.500,00" → 1500. Sin número → null.
 * El tope se compara contra `min`: un rango que empieza bajo el techo no lo supera.
 */
function parseSalaryRangeUsd(raw: unknown): { min: number; max: number } | null {
  const toks = String(raw ?? "").match(/\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g) ?? [];
  const nums = toks.map((t) => {
    const m = t.match(/^(\d{1,3}(?:[.,]\d{3})+)(?:[.,]\d{1,2})?$/);
    return m ? Number(m[1].replace(/[.,]/g, "")) : Number(t.replace(",", "."));
  }).filter((n) => Number.isFinite(n) && n > 0).slice(0, 2);
  return nums.length ? { min: Math.min(...nums), max: Math.max(...nums) } : null;
}

const TS_LINKEDIN_URL = "https://www.linkedin.com/company/trading-sol/";

// Auto-detección sencilla ES/EN basada en frecuencia de palabras-función.
function detectLanguage(...texts: (string | null | undefined)[]): "es" | "en" {
  const blob = texts.filter(Boolean).join(" ").toLowerCase();
  if (!blob.trim()) return "es";
  const ES = [" la ", " el ", " de ", " que ", " y ", " es ", " en ", " un ", " una ", " por ", " para ", " con ", " mi ", " soy ", "á", "é", "í", "ó", "ú", "ñ"];
  const EN = [" the ", " and ", " is ", " of ", " to ", " for ", " with ", " my ", " i ", " you ", " we ", " in ", " on ", " have ", " am "];
  let es = 0, en = 0;
  ES.forEach(w => { if (blob.includes(w)) es++; });
  EN.forEach(w => { if (blob.includes(w)) en++; });
  return en > es ? "en" : "es";
}

function buildRejectionHtmlEs(name: string, clientName: string, vacancyTitle: string): string {
  const firstName = (name || "").split(" ")[0] || "candidato";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Inter, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; padding: 24px; background: #f9f9f9; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border-radius: 12px; }
  a { color: #2C64ED; }
</style></head><body>
  <div class="container">
    <p>Hola <strong>${firstName}</strong>,</p>
    <p>Gracias por tomarte el tiempo de aplicar a la posición de <strong>${vacancyTitle}</strong> en ${clientName}. Después de revisar tu aplicación, hemos decidido avanzar con otros candidatos cuyo perfil se ajusta más a la posición en este momento. Sin embargo, ${clientName} sigue creciendo y nos encantaría mantenernos en contacto.</p>
    <p>Tu información queda en nuestra base de datos para futuras oportunidades. También te invitamos a seguirnos en LinkedIn para enterarte de nuevas vacantes: <a href="${TS_LINKEDIN_URL}">${TS_LINKEDIN_URL}</a></p>
    <p>Apreciamos tu interés en ${clientName} y te deseamos mucho éxito en tus próximos pasos.</p>
    <p>Un abrazo,<br><strong>Talent Acquisition Team</strong><br>${clientName}</p>
  </div>
</body></html>`;
}

function buildRejectionHtmlEn(name: string, clientName: string, vacancyTitle: string): string {
  const firstName = (name || "").split(" ")[0] || "candidate";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Inter, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; padding: 24px; background: #f9f9f9; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border-radius: 12px; }
  a { color: #2C64ED; }
</style></head><body>
  <div class="container">
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>Thank you for taking the time to apply for the <strong>${vacancyTitle}</strong> position at ${clientName}. After reviewing your application, we have decided to move forward with other candidates whose profile is a closer match for the position at this time. However, ${clientName} is always growing and we'd love to keep in touch.</p>
    <p>Your information stays in our database for future opportunities. We also invite you to follow us on LinkedIn to stay updated on new openings: <a href="${TS_LINKEDIN_URL}">${TS_LINKEDIN_URL}</a></p>
    <p>We appreciate your interest in ${clientName} and thank you again. We sincerely wish you all the best in your future endeavors.</p>
    <p>Best regards,<br><strong>Talent Team</strong><br>${clientName}</p>
  </div>
</body></html>`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { data: candidate, error } = await supabaseAdmin
    .from("ht_candidates")
    .select("id, name, email, prefilter_token_expires_at, prefilter_completed_at, ht_vacancies(title, form_template_key), ht_clients(name)")
    .eq("prefilter_token", params.token)
    .single();

  if (error || !candidate) return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  if (candidate.prefilter_completed_at) {
    return NextResponse.json({ error: "already_completed" }, { status: 409 });
  }

  // Token evergreen · si el candidato hace click, extendemos 7 días más.
  // Razón: drafts de Gmail pueden sentarse días antes de enviar · si el link
  // expira en el camino, candidato recibe link muerto sin culpa. Cada click
  // del candidato vivo re-activa el reloj.
  if (candidate.prefilter_token_expires_at) {
    const expires = new Date(candidate.prefilter_token_expires_at as string);
    const now = new Date();
    if (expires < now || (expires.getTime() - now.getTime()) < 3 * 24 * 60 * 60 * 1000) {
      const fresh = new Date();
      fresh.setDate(fresh.getDate() + 7);
      await supabaseAdmin
        .from("ht_candidates")
        .update({ prefilter_token_expires_at: fresh.toISOString() })
        .eq("id", candidate.id);
    }
  }

  return NextResponse.json({
    candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
    vacancy: {
      // @ts-expect-error supabase relation
      title: candidate.ht_vacancies?.title || "la vacante",
      // @ts-expect-error supabase relation
      form_template_key: candidate.ht_vacancies?.form_template_key || "comex",
    },
    // @ts-expect-error supabase relation
    client: { name: candidate.ht_clients?.name || "Trading Solutions" },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const body = await req.json();

  const { data: candidate, error } = await supabaseAdmin
    .from("ht_candidates")
    .select("id, name, email, vacancy_id, stage, preferred_language, prefilter_token_expires_at, prefilter_completed_at, ht_clients(name), ht_vacancies(title, form_template_key, country)")
    .eq("prefilter_token", params.token)
    .single();

  if (error || !candidate) return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  // Token evergreen · ya no chequeamos expiración en POST · si el candidato
  // alcanzó a llegar al form vivo, debe poder submitir. completed_at sigue
  // bloqueando duplicados.
  if (candidate.prefilter_completed_at) {
    return NextResponse.json({ error: "already_completed" }, { status: 409 });
  }

  // @ts-expect-error supabase relation
  const templateKey = String(candidate.ht_vacancies?.form_template_key || "comex");

  let decision: Decision;
  let rejectionReason: { category: string; sub_detail: string } | null = null;
  let meta: Record<string, unknown>;
  const bloqueos: Bloqueo[] = [];

  if (templateKey === "china") {
    // ─── Rama CHINA · knock-outs solamente ──────────────────────────
    //   - Consentimiento PIPL es OBLIGATORIO · sin él no se procesa.
    //   - Salario (salary_usd) nunca descarta. Sobre el tope (mínimo del
    //     rango) entra como bloqueo blando y la decisión pasa a revisión.
    //   - Knock-outs: work_authorized, inglés (>=B2), onsite_available.
    if (!isYes(body.pipl_consent)) {
      return NextResponse.json({ error: "pipl_consent_required" }, { status: 400 });
    }

    const englishRank = CHINA_ENGLISH_RANK[String(body.english_level || "").trim().toUpperCase()] ?? 0;
    const englishFails = englishRank > 0 && englishRank < CHINA_ENGLISH_MIN_RANK;
    const workAuthorized = isYes(body.work_authorized);
    const onsiteAvailable = isYes(body.onsite_available);

    // Se recogen todos los bloqueos, no solo el primero: si alguien falla en
    // dos cosas, quien decide tiene que ver las dos. Antes el else-if
    // escondia el segundo motivo.
    if (!workAuthorized) {
      bloqueos.push({
        regla: "autorizacion_trabajo",
        severidad: "duro",
        categoria: "requisito_excluyente",
        sub_detail: "sin_autorizacion_trabajo_china",
        valor: String(body.work_authorized ?? ""),
      });
    }
    if (englishFails) {
      bloqueos.push({
        regla: "ingles_minimo",
        severidad: "blando",
        categoria: "idioma_insuficiente",
        sub_detail: englishRank <= 3 ? "ingles_b1" : "ingles_b2_para_c1",
        valor: String(body.english_level ?? ""),
        contradiccion: senalContrariaIdioma(body.english_cert),
      });
    }
    if (!onsiteAvailable) {
      bloqueos.push({
        regla: "disponibilidad_presencial",
        severidad: "blando",
        categoria: "requisito_excluyente",
        sub_detail: "sin_disponibilidad_presencial",
        valor: String(body.onsite_available ?? ""),
      });
    }
    decision = bloqueos.length ? "review" : "pass";

    // Presupuesto · se compara el mínimo del rango. Sobre el tope no se
    // rechaza: queda un bloqueo blando y, si iba a pasar, pasa a revisión.
    const salaryRange = parseSalaryRangeUsd(body.salary_usd);
    const salaryOverBudget = salaryRange !== null && salaryRange.min > CHINA_SALARY_CAP_USD;
    if (salaryOverBudget) {
      bloqueos.push({
        regla: "salario_sobre_tope",
        severidad: "blando",
        categoria: "pretension_salarial",
        sub_detail: "salario_sobre_tope",
        valor: String(body.salary_usd),
      });
      if (decision === "pass") decision = "review";
    }

    meta = {
      china: true,
      salary_usd_expectation: body.salary_usd ?? null, // dato · no descarta
      salary_usd_parsed: salaryRange?.min ?? null,
      salary_usd_max: salaryRange?.max ?? null,
      salary_cap_usd: CHINA_SALARY_CAP_USD,
      salary_over_budget: salaryOverBudget,
      english_min_required_rank: CHINA_ENGLISH_MIN_RANK,
      english_candidate_rank: englishRank,
      english_fails: englishFails,
      work_authorized: workAuthorized,
      onsite_available: onsiteAvailable,
      pipl_consent: true,
    };
  } else if (templateKey === "panama_ops") {
    // ─── Rama PANAMA OPS · freight knock-outs (EN) ──────────────────
    //   - Consentimiento privacy EN obligatorio (no PIPL, no habeas CO).
    //   - Salario (salary_usd) nunca descarta. Sobre el tope (mínimo del
    //     rango) entra como bloqueo blando y la decisión pasa a revisión.
    //   - Knock-outs → review flags: work_authorized_panama, onsite_panama_city.
    //   - Soft mark: years_freight_panama < 4, english below B1.
    if (!isYes(body.privacy_consent)) {
      return NextResponse.json({ error: "privacy_consent_required" }, { status: 400 });
    }

    const englishKey = String(body.english_level || "").trim().toUpperCase();
    const englishRank = PANAMA_OPS_ENGLISH_RANK[englishKey] ?? 0;
    const englishFails = englishRank > 0 && englishRank < PANAMA_OPS_ENGLISH_MIN_RANK;
    const workAuthorized = isYes(body.work_authorized_panama);
    const onsitePanama = isYes(body.onsite_panama_city);
    const yearsFreight = Number(body.years_freight_panama ?? 0);
    const yearsShort = Number.isFinite(yearsFreight) && yearsFreight < PANAMA_OPS_YEARS_MIN;

    if (!workAuthorized) {
      bloqueos.push({
        regla: "autorizacion_trabajo",
        severidad: "duro",
        categoria: "requisito_excluyente",
        sub_detail: "sin_autorizacion_trabajo_panama",
        valor: String(body.work_authorized_panama ?? ""),
      });
    }
    if (!onsitePanama) {
      bloqueos.push({
        regla: "disponibilidad_presencial",
        severidad: "duro",
        categoria: "requisito_excluyente",
        sub_detail: "sin_disponibilidad_presencial",
        valor: String(body.onsite_panama_city ?? ""),
      });
    }
    if (englishFails) {
      bloqueos.push({
        regla: "ingles_minimo",
        severidad: "blando",
        categoria: "idioma_insuficiente",
        sub_detail: englishRank <= 2 ? "ingles_a1_a2" : "ingles_b1",
        valor: String(body.english_level ?? ""),
      });
    }
    if (yearsShort) {
      bloqueos.push({
        regla: "anos_freight_panama",
        severidad: "blando",
        categoria: "experiencia_insuficiente",
        sub_detail: "anos_freight_panama",
        valor: String(body.years_freight_panama ?? ""),
      });
    }

    decision = bloqueos.length ? "review" : "pass";

    const salaryRange = parseSalaryRangeUsd(body.salary_usd);
    const salaryOverBudget = salaryRange !== null && salaryRange.min > PANAMA_OPS_SALARY_CAP_USD;
    if (salaryOverBudget) {
      bloqueos.push({
        regla: "salario_sobre_tope",
        severidad: "blando",
        categoria: "pretension_salarial",
        sub_detail: "salario_sobre_tope",
        valor: String(body.salary_usd),
      });
      if (decision === "pass") decision = "review";
    }

    meta = {
      panama_ops: true,
      salary_usd_expectation: body.salary_usd ?? null,
      salary_usd_parsed: salaryRange?.min ?? null,
      salary_usd_max: salaryRange?.max ?? null,
      salary_cap_usd: PANAMA_OPS_SALARY_CAP_USD,
      salary_over_budget: salaryOverBudget,
      english_min_required_rank: PANAMA_OPS_ENGLISH_MIN_RANK,
      english_candidate_rank: englishRank,
      english_fails: englishFails,
      work_authorized_panama: workAuthorized,
      onsite_panama_city: onsitePanama,
      years_freight_panama: yearsFreight,
      years_freight_short: yearsShort,
      ocean_fcl_lcl: isYes(body.ocean_fcl_lcl),
      air_freight: isYes(body.air_freight),
      bl_awb_docs: isYes(body.bl_awb_docs),
      warehouse_ftz: isYes(body.warehouse_ftz),
      privacy_consent: true,
    };
  } else if (templateKey === "sig_sst") {
    // ─── Rama SIG-SST · credenciales de ley + salario + inglés ──────
    //   La licencia vigente en SST es knock-out duro: sin ella el cargo no
    //   se puede ejercer. El curso de 50 horas tambien es de ley. El resto
    //   (años liderando, ciclos de auditoría) no descarta: manda a review.
    const salaryResult = decideFromSalary(
      String(body.salary || ""),
      String(candidate.vacancy_id),
      templateKey
    );
    const englishCheck = checkEnglishLevel(body.english_level, String(candidate.vacancy_id), templateKey);

    const licenseStatus = String(body.license_status || "").trim().toLowerCase();
    const licenseValid = licenseStatus === "si";
    const course50 = isYes(body.course_50h);
    const course20 = isYes(body.course_20h);
    const yearsLeading = Number(body.years_leading_sig ?? 0);
    const certCycles = Number(body.cert_audit_cycles ?? 0);

    if (!licenseValid) {
      decision = "reject";
      rejectionReason = {
        category: "requisito_excluyente",
        sub_detail:
          licenseStatus === "vencida" ? "licencia_sst_vencida"
          : licenseStatus === "tramite" ? "licencia_sst_en_tramite"
          : "sin_licencia_sst",
      };
    } else if (englishCheck.fails) {
      decision = "reject";
      rejectionReason = { category: "idioma_insuficiente", sub_detail: englishCheck.sub_detail || "ingles_b1" };
    } else if (!course50) {
      decision = "reject";
      rejectionReason = { category: "requisito_excluyente", sub_detail: "sin_curso_50_horas" };
    } else if (salaryResult.decision === "reject") {
      decision = "reject";
      rejectionReason = { category: "pretension_salarial", sub_detail: "sobre_banda" };
    } else if (!course20 || yearsLeading < 3 || certCycles < 1) {
      // Cumple lo de ley pero le falta recorrido · lo ve un humano
      decision = "review";
    } else {
      decision = salaryResult.decision;
    }

    meta = {
      sig_sst: true,
      license_status: licenseStatus,
      license_number: body.license_number ?? null,
      license_expiry: body.license_expiry ?? null,
      course_50h: course50,
      course_20h: course20,
      years_leading_sig: yearsLeading,
      cert_audit_cycles: certCycles,
      auditor_certs: body.auditor_certs ?? [],
      systems_managed: body.systems_managed ?? [],
      cap_used: salaryResult.cap,
      salary_lower_bound: salaryResult.lowerBound,
      english_min_required_rank: englishCheck.minRank,
      english_candidate_rank: englishCheck.candidateRank,
      english_fails: englishCheck.fails,
    };
  } else if (templateKey === "customer_doc") {
    // ─── Rama Customer Documentation · experiencia documental ───────
    //   Dos innegociables, definidos con Talent el 7-oct: experiencia
    //   documental en comercio exterior y haber conciliado facturas contra
    //   ordenes. Los dos son datos que la persona declara de si misma, asi
    //   que son blandos: marcan la ficha, no la cierran. Las plataformas, los
    //   cursos y el tipo de empresa suman y nunca bloquean, porque en la
    //   costa hay buenos perfiles documentales que aprendieron en la
    //   operacion y no en un diplomado.
    const salaryResult = decideFromSalary(
      String(body.salary || ""),
      String(candidate.vacancy_id),
      templateKey
    );
    const englishCheck = checkEnglishLevel(body.english_level, String(candidate.vacancy_id), templateKey);

    const anosDoc = String(body.years_doc_comex || "").trim();          // "0" | "-1" | "1-2" | "2-4" | "+4"
    const conciliacion = String(body.invoice_reconciliation || "").trim(); // central | ocasional | no
    const documentos: string[] = Array.isArray(body.docs_handled) ? body.docs_handled : [];
    const plataformas: string[] = Array.isArray(body.platforms_used) ? body.platforms_used : [];
    const eleccionCaso = String(body.case_choice || "").trim();
    const relocateVal = String(body.relocate || "");

    if (relocateVal === "No me puedo mudar") {
      bloqueos.push({
        regla: "sin_disponibilidad_presencial",
        severidad: "blando",
        categoria: "requisito_excluyente",
        sub_detail: "sin_disponibilidad_presencial",
        valor: relocateVal,
      });
    }
    if (salaryResult.decision !== "pass") {
      bloqueos.push({
        regla: "sobre_banda",
        severidad: "blando",
        categoria: "pretension_salarial",
        sub_detail: "sobre_banda",
        valor: String(body.salary || ""),
      });
    }
    if (englishCheck.fails) {
      bloqueos.push({
        regla: englishCheck.sub_detail || "ingles_b1",
        severidad: "blando",
        categoria: "idioma_insuficiente",
        sub_detail: englishCheck.sub_detail || "ingles_b1",
        valor: String(body.english_level || ""),
        // El mismo detector que salvo a Charlotte Cheng: si en el campo de al
        // lado menciona una prueba o anos leyendo documentos en ingles, hay
        // algo que una persona tiene que leer antes de creerle al chip.
        contradiccion: senalContrariaIdioma(body.english_cert),
      });
    }
    if (anosDoc === "0") {
      bloqueos.push({
        regla: "sin_experiencia_doc_comex",
        severidad: "blando",
        categoria: "experiencia_insuficiente",
        sub_detail: "sin_experiencia_doc_comex",
        valor: anosDoc,
        // Decir que no tiene experiencia y marcar plataformas aduaneras no
        // cuadra: o se subestimo o marco por marcar. En los dos casos se
        // pregunta antes de cerrar.
        contradiccion: plataformas.some((x) => ["MUISCA", "VUCE", "Federal Maritime Commission", "CargoWise u otro TMS"].includes(x))
          ? "marco plataformas aduaneras - verificar la hoja de vida"
          : null,
      });
    }
    if (conciliacion === "no") {
      bloqueos.push({
        regla: "sin_conciliacion_facturas",
        severidad: "blando",
        categoria: "experiencia_insuficiente",
        sub_detail: "sin_conciliacion_facturas",
        valor: conciliacion,
        // Mucha gente concilia todos los dias sin llamarlo conciliar. Si el
        // relato de la diferencia esta escrito, hay que leerlo.
        contradiccion: String(body.difference_story || "").trim().length >= 80
          ? "escribio un caso de diferencia detectada - leerlo antes de cerrar"
          : null,
      });
    }
    if (documentos.includes("Ninguno de estos")) {
      bloqueos.push({
        regla: "sin_documentos_comex",
        severidad: "blando",
        categoria: "experiencia_insuficiente",
        sub_detail: "sin_documentos_comex",
      });
    }
    // El caso no bloquea por si mismo: es una senal de criterio para la
    // entrevista. Radicar o pagar con una diferencia sin resolver es
    // exactamente lo que el cargo existe para no hacer.
    const criterioFlojo = ["radico", "pago", "espero"].includes(eleccionCaso);
    if (criterioFlojo) {
      bloqueos.push({
        regla: "criterio_caso_documental",
        severidad: "blando",
        categoria: "match_cultural",
        sub_detail: "criterio_caso_documental",
        valor: eleccionCaso,
      });
    }

    decision = bloqueos.length ? "review" : "pass";

    meta = {
      customer_doc: true,
      years_doc_comex: anosDoc,
      docs_handled: documentos,
      company_types: Array.isArray(body.company_types) ? body.company_types : [],
      invoice_reconciliation: conciliacion,
      platforms_used: plataformas,
      courses: Array.isArray(body.doc_courses) ? body.doc_courses : [],
      excel_level: Number(body.excel_level ?? 0),
      case_choice: eleccionCaso,
      case_ok: eleccionCaso === "soporte",
      cap_used: salaryResult.cap,
      salary_lower_bound: salaryResult.lowerBound,
      english_min_required_rank: englishCheck.minRank,
      english_candidate_rank: englishCheck.candidateRank,
      english_fails: englishCheck.fails,
    };
  } else {
    // ─── Rama estándar (comex/hr/finance/tech) · salario + inglés ────
    const salaryResult = decideFromSalary(
      String(body.salary || ""),
      String(candidate.vacancy_id),
      templateKey
    );

    // Check de inglés mínimo por vacante
    const englishCheck = checkEnglishLevel(body.english_level, String(candidate.vacancy_id), templateKey);

    // Decisión final · si el inglés no llega al mínimo → reject (sobrescribe pass)
    // Si el inglés es menor → priorizamos rechazo por idioma sobre salario
    decision = salaryResult.decision;

    if (englishCheck.fails) {
      decision = "reject";
      rejectionReason = {
        category: "idioma_insuficiente",
        sub_detail: englishCheck.sub_detail || "ingles_b1",
      };
    } else if (decision === "reject") {
      rejectionReason = {
        category: "pretension_salarial",
        sub_detail: "sobre_banda",
      };
    }

    // ─── Knock-outs propios de HR / Talent Acquisition ───────────────
    // El perfil pide mínimo 1 año aplicando e interpretando psicometría y
    // formación en entrevista por competencias. Sin esto el prefiltro dejaba
    // pasar a cualquiera con años de reclutamiento pero sin criterio técnico,
    // que es justo lo que la vacante NO busca.
    if (templateKey === "hr_lead" && decision !== "reject") {
      const psychYears = Number(body.psychometrics_years ?? 0);
      const bei = String(body.bei_certified || "").trim().toLowerCase();

      if (psychYears < 1) {
        decision = "reject";
        rejectionReason = {
          category: "experiencia_insuficiente",
          sub_detail: "sin_psicometria",
        };
      } else if (bei === "no" || bei === "") {
        // No descarta: la formación en BEI se puede validar o cerrar en el
        // proceso. Pero obliga a que una persona lo mire.
        decision = "review";
      }
    }

    meta = {
      cap_used: salaryResult.cap,
      salary_lower_bound: salaryResult.lowerBound,
      english_min_required_rank: englishCheck.minRank,
      english_candidate_rank: englishCheck.candidateRank,
      english_fails: englishCheck.fails,
    };
  }

  // ─── Ningun descarte automatico ─────────────────────────────────────
  // Decision de Kelly, 29-sep-2026: el prefiltro no rechaza a nadie. Marca
  // en rojo con el motivo y una persona decide.
  //
  // Lo que lo motivo: las cinco unicas personas que el prefiltro descarto por
  // idioma en China son las cinco que marcaron "B1", y ninguna marco A1 ni
  // A2. El chip "B1" estaba funcionando como "no estoy seguro". Una de ellas
  // tenia IELTS 7.5 escrito en el campo de al lado y era la segunda del
  // ranking; otra se cerro con correo enviado antes de que alguien leyera que
  // llevaba diez anos viviendo en el exterior.
  //
  // El rechazo sigue existiendo, pero lo firma una persona en
  // /api/admin/candidates/[candidateId]/reject-with-reason.
  if (rejectionReason) {
    bloqueos.push({
      regla: rejectionReason.sub_detail,
      severidad: SEVERIDAD_POR_REGLA[rejectionReason.sub_detail] ?? "blando",
      categoria: rejectionReason.category,
      sub_detail: rejectionReason.sub_detail,
    });
  }
  if (decision === "reject") decision = "review";

  // La prioridad ordena la mesa de decision. Arriba lo que puede estar mal y
  // cuesta caro: dato blando con una senal que lo contradice. Abajo el hecho
  // verificable, que solo necesita un clic de confirmacion.
  const prioridadRevision = bloqueos.reduce((max, b) => {
    const p = b.severidad === "blando" ? (b.contradiccion ? 3 : 2) : 1;
    return p > max ? p : max;
  }, 0);

  meta = {
    ...meta,
    bloqueos,
    rojo: bloqueos.length > 0,
    prioridad_revision: prioridadRevision,
  };

  const updates: Record<string, unknown> = {
    prefilter_data: {
      ...body,
      _meta: meta,
    },
    prefilter_decision: decision,
    prefilter_completed_at: new Date().toISOString(),
  };

  // Ya no se escribe rejection_category ni rejected_at desde aca, ni se crea
  // el borrador del correo: el candidato no esta rechazado, esta en rojo
  // esperando decision. Escribirle "rechazado" en la ficha a alguien que
  // nadie ha revisado es lo que dejo a doce personas esperando en silencio.

  // Actualizar stage según decisión
  if (decision === "pass") updates.stage = "prefiltro_pasado";
  else if (decision === "review") updates.stage = "prefiltro_revision";

  const { error: updateErr } = await supabaseAdmin
    .from("ht_candidates")
    .update(updates)
    .eq("id", candidate.id);

  if (updateErr) {
    return NextResponse.json({ error: "save_failed", detail: updateErr.message }, { status: 500 });
  }

  // El submit del prefiltro decide la etapa por sí solo. Sin registrar el
  // evento, el candidato que pasa a revisión arranca el contador de días
  // desde cero cada vez que alguien lo edita.
  if (updates.stage) {
    await recordStageEvent({
      candidateId: candidate.id as string,
      fromStage: (candidate.stage as string) ?? null,
      toStage: updates.stage as string,
      vacancyId: (candidate.vacancy_id as string) ?? null,
      source: "system",
      note: `prefiltro: ${decision}`,
    });
  }

  // ─── Notificación a Kelly (no bloqueante) ─────────────────────────
  try {
    const gmail = await isGmailConnected();
    if (gmail.connected) {
      // @ts-expect-error supabase relation
      const vacancyTitle = candidate.ht_vacancies?.title || "vacante";
      const salarioRaw = body.salary || body.salary_usd;
      const salarioTxt = salarioRaw ? String(salarioRaw) : "Salario no informado";
      // Salario desconocido no pinta la ficha de rojo. Revisión amarilla si
      // el único bloqueo es el tope, o si no hay bloqueos y aun así no pasó.
      const soloSalario = bloqueos.length > 0 && bloqueos.every((b) => b.regla === "salario_sobre_tope");
      const decisionLabel = decision === "pass" ? "PASA"
        : soloSalario || bloqueos.length === 0 ? "REVISIÓN" : "EN ROJO · decide tú";
      const decisionEmoji = decision === "pass" ? "✅"
        : soloSalario || bloqueos.length === 0 ? "🟡" : "🔴";
      const listaBloqueos = bloqueos
        .map((b) => `<li>${b.sub_detail.replace(/_/g, " ")} — dato ${b.severidad}${b.valor ? ` (marcó: ${b.valor})` : ""}${b.contradiccion ? ` · <strong>${b.contradiccion}</strong>` : ""}</li>`)
        .join("");
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";
      await sendViaGmail({
        to: "jointheteam@tradingsolutions.com",
        subject: `[Prefiltro ${decisionLabel}] ${candidate.name} · ${vacancyTitle}`,
        html: `<!DOCTYPE html><html><body style="font-family: Inter, sans-serif; padding: 16px; color: #1a1a1a;">
          <p>Kelly, <strong>${candidate.name}</strong> acaba de completar el prefiltro.</p>
          <table style="border-collapse: collapse; margin: 12px 0;">
            <tr><td style="padding: 4px 12px 4px 0; color: #666;">Vacante:</td><td><strong>${vacancyTitle}</strong></td></tr>
            <tr><td style="padding: 4px 12px 4px 0; color: #666;">Email:</td><td>${candidate.email}</td></tr>
            <tr><td style="padding: 4px 12px 4px 0; color: #666;">Decisión:</td><td><strong>${decisionEmoji} ${decisionLabel}</strong></td></tr>
            <tr><td style="padding: 4px 12px 4px 0; color: #666;">Salario que pidió:</td><td>${salarioTxt}</td></tr>
            <tr><td style="padding: 4px 12px 4px 0; color: #666;">Inglés:</td><td>${body.english_level || "—"}</td></tr>
            <tr><td style="padding: 4px 12px 4px 0; color: #666;">Ciudad:</td><td>${body.city || "—"}</td></tr>
          </table>
          ${bloqueos.length > 0 ? `<div style="background: ${soloSalario ? "#FFFBEB" : "#FEF2F2"}; padding: 10px 14px; border-radius: 6px; color: ${soloSalario ? "#92400E" : "#991B1B"}; font-size: 13px;"><strong>No se rechazó a nadie.</strong> ${soloSalario ? "Quedó en revisión por el salario:" : "Quedó en rojo esperando tu decisión:"}<ul style="margin: 8px 0 0; padding-left: 18px;">${listaBloqueos}</ul></div>` : ""}
          <p><a href="${baseUrl}/hr-admin?tab=prefiltros" style="color: #2C64ED;">Ver en HR Admin →</a></p>
        </body></html>`,
        fromName: "Trading Solutions ATS",
      });
    }
  } catch (e) {
    console.error("Failed to send notification:", e);
  }

  // El candidato no ve la decisión — siempre recibe success.
  return NextResponse.json({ success: true });
}
