/**
 * Operations Specialist · Panamá (form_template_key panama_ops).
 *
 * Hard knock-outs discard (stage rechazado). Soft alerts only send the
 * person to review. Nothing here deletes a row or emails the candidate.
 *
 * Rejection categories are only the ones already in ts_rejection_categories.
 * Work authorization and on-site Panama City have no fitting sub-detail:
 * `ubicacion` is labeled for Barranquilla, so it is not reused. Those two
 * knock-outs are stored on the stage event and in prefilter_data, with
 * rejection_category left null.
 */

export const PANAMA_OPS_YEARS_MIN = 4;
export const PANAMA_OPS_ENGLISH_MIN = "B1";

/** Questions the form asks. salary_usd is intentionally absent. */
export const PANAMA_OPS_FIELDS = [
  "full_name",
  "email",
  "phone",
  "current_city",
  "work_authorized_panama",
  "onsite_panama_city",
  "years_freight_panama",
  "ocean_fcl_lcl",
  "air_freight",
  "bl_awb_docs",
  "warehouse_ftz",
  "english_level",
  "start_within_30_days",
  "why_ts",
  "privacy_consent",
] as const;

const ENGLISH_RANK: Record<string, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};

export type PanamaDecision = "pass" | "review" | "reject";
export type PanamaStage = "prefiltro_pasado" | "prefiltro_revision" | "rechazado";

export type PanamaReason = {
  effect: "knockout" | "review";
  /** Existing ts_rejection_categories.category_key, or null when none fits. */
  category: string | null;
  /** Existing sub_detail key, or null when none fits. */
  sub_detail: string | null;
  text: string;
};

export type PanamaScore = {
  decision: PanamaDecision;
  stage: PanamaStage;
  /** Same words the ATS badge and the internal notice use. */
  decisionLabel: "advance" | "review" | "knocked_out";
  reasons: PanamaReason[];
  /** Knock-outs never email the candidate. Advance and review do not either. */
  emailCandidate: false;
  /** New answers do not collect salary. Stored as null, not scored. */
  salary_usd: null;
};

export type PanamaAnswers = {
  work_authorized_panama?: unknown;
  onsite_panama_city?: unknown;
  english_level?: unknown;
  years_freight_panama?: unknown;
  ocean_fcl_lcl?: unknown;
  air_freight?: unknown;
  bl_awb_docs?: unknown;
  warehouse_ftz?: unknown;
  start_within_30_days?: unknown;
  salary_usd?: unknown;
};

function yes(value: unknown): boolean {
  if (value === true) return true;
  const s = String(value ?? "").trim().toLowerCase();
  return s === "yes" || s === "si" || s === "sí" || s === "true";
}

export function scorePanamaOps(body: PanamaAnswers): PanamaScore {
  const reasons: PanamaReason[] = [];

  if (!yes(body.work_authorized_panama)) {
    reasons.push({
      effect: "knockout",
      category: null,
      sub_detail: null,
      text: "Not legally authorized to work in Panama",
    });
  }
  if (!yes(body.onsite_panama_city)) {
    reasons.push({
      effect: "knockout",
      category: null,
      sub_detail: null,
      text: "Cannot work on-site in Panama City",
    });
  }

  const englishKey = String(body.english_level ?? "").trim().toUpperCase();
  const englishRank = ENGLISH_RANK[englishKey] ?? 0;
  if (englishRank < 3) {
    reasons.push({
      effect: "knockout",
      category: "idioma_insuficiente",
      sub_detail: "ingles_a1_a2",
      text: "English below B1",
    });
  }

  const years = Number(body.years_freight_panama ?? 0);
  if (!Number.isFinite(years) || years < PANAMA_OPS_YEARS_MIN) {
    reasons.push({
      effect: "review",
      category: "experiencia_insuficiente",
      sub_detail: "anos_industria",
      text: "Freight experience under 4 years",
    });
  }
  if (!yes(body.ocean_fcl_lcl)) {
    reasons.push({
      effect: "review",
      category: "experiencia_insuficiente",
      sub_detail: "sin_experiencia_rol",
      text: "No ocean FCL/LCL experience",
    });
  }
  if (!yes(body.air_freight)) {
    reasons.push({
      effect: "review",
      category: "experiencia_insuficiente",
      sub_detail: "sin_experiencia_rol",
      text: "No air freight experience",
    });
  }
  if (!yes(body.bl_awb_docs)) {
    reasons.push({
      effect: "review",
      category: "experiencia_insuficiente",
      sub_detail: "sin_experiencia_rol",
      text: "No BL/AWB experience",
    });
  }
  if (!yes(body.warehouse_ftz)) {
    reasons.push({
      effect: "review",
      category: "experiencia_insuficiente",
      sub_detail: "sin_experiencia_rol",
      text: "No Zona Libre / FTZ experience",
    });
  }
  if (!yes(body.start_within_30_days)) {
    reasons.push({
      effect: "review",
      category: "disponibilidad_movilidad",
      sub_detail: "fecha_inicio",
      text: "Cannot start within 30 days",
    });
  }

  const knockedOut = reasons.some((reason) => reason.effect === "knockout");
  const review = reasons.some((reason) => reason.effect === "review");
  const decision: PanamaDecision = knockedOut ? "reject" : review ? "review" : "pass";
  const stage: PanamaStage = knockedOut
    ? "rechazado"
    : review
      ? "prefiltro_revision"
      : "prefiltro_pasado";
  const decisionLabel = knockedOut ? "knocked_out" : review ? "review" : "advance";

  return {
    decision,
    stage,
    decisionLabel,
    reasons,
    emailCandidate: false,
    salary_usd: null,
  };
}

/** Lines written to the ATS note and copied into the internal notice. */
export function panamaOpsNoticeLines(score: PanamaScore): string[] {
  const head = `Decision ${score.decision} · stage ${score.stage} · ${score.decisionLabel}`;
  if (!score.reasons.length) return [head];
  return [
    head,
    ...score.reasons.map((reason) => {
      const catalog = reason.category
        ? `${reason.category}/${reason.sub_detail}`
        : "no catalog category";
      const effect = reason.effect === "knockout" ? "knocked out" : "review";
      return `${effect}: ${reason.text} (${catalog})`;
    }),
  ];
}

export function panamaPrefilterExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) return false;
  return expires.getTime() < now.getTime();
}

export function panamaOpsAsksSalary(): boolean {
  return (PANAMA_OPS_FIELDS as readonly string[]).includes("salary_usd");
}
