import { CANDIDATE_MAIL } from "./candidate-public-error";

export const INVALID_LINK_ES = `Este enlace no está disponible. Escríbenos a ${CANDIDATE_MAIL} y te ayudamos.`;
export const INVALID_LINK_EN = `This link is not available. Write to us at ${CANDIDATE_MAIL} and we will help.`;

export const EXPIRED_LINK_ES = `Este enlace ya venció. Escríbenos a ${CANDIDATE_MAIL} y te enviamos uno nuevo.`;
export const EXPIRED_LINK_EN = `This link has expired. Write to us at ${CANDIDATE_MAIL} and we will send a new one.`;

export function invalidLinkCopy(lang: "es" | "en"): string {
  return lang === "en" ? INVALID_LINK_EN : INVALID_LINK_ES;
}

export function invalidLinkBoth(): string {
  return `${INVALID_LINK_ES} ${INVALID_LINK_EN}`;
}

export function expiredLinkBoth(): string {
  return `${EXPIRED_LINK_ES} ${EXPIRED_LINK_EN}`;
}
