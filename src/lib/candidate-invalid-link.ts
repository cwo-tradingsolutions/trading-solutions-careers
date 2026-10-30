import { CANDIDATE_MAIL } from "./candidate-public-error";

export const INVALID_LINK_ES = `Este enlace no está disponible. Escríbenos a ${CANDIDATE_MAIL} y te ayudamos.`;
export const INVALID_LINK_EN = `This link is not available. Write to us at ${CANDIDATE_MAIL} and we'll help.`;

export const EXPIRED_LINK_ES = `Este enlace ya venció. Escríbenos a ${CANDIDATE_MAIL} y te enviamos uno nuevo.`;
export const EXPIRED_LINK_EN = `This link has expired. Write to us at ${CANDIDATE_MAIL} and we'll send a new one.`;

export const LOAD_FAIL_ES = `No pudimos cargar tu evaluación. Escríbenos a ${CANDIDATE_MAIL} y te ayudamos.`;
export const LOAD_FAIL_EN = `We couldn't load your assessment. Write to us at ${CANDIDATE_MAIL} and we'll help.`;

export function invalidLinkCopy(lang: "es" | "en"): string {
  return lang === "en" ? INVALID_LINK_EN : INVALID_LINK_ES;
}

export function invalidLinkBoth(): string {
  return `${INVALID_LINK_ES} / ${INVALID_LINK_EN}`;
}

export function expiredLinkBoth(): string {
  return `${EXPIRED_LINK_ES} / ${EXPIRED_LINK_EN}`;
}

export function loadFailBoth(): string {
  return `${LOAD_FAIL_ES} / ${LOAD_FAIL_EN}`;
}

export const LOAD_RETRY_ES = "No pudimos cargar. Intenta de nuevo.";
export const LOAD_RETRY_EN = "We couldn't load this. Try again.";

export function loadRetryBoth(): string {
  return `${LOAD_RETRY_ES} / ${LOAD_RETRY_EN}`;
}
