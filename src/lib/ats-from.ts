/**
 * Display name del buzón jointheteam@tradingsolutions.com.
 *
 * ASCII a propósito. Un From sin RFC 2047 que lleve «ñ» (Kelly Castañeda)
 * llega al candidato como «Kelly CastaÃ±eda».
 *
 * El send-as de Gmail (Configuración → Cuentas e importación → Enviar correo
 * como, o Admin de Workspace en el usuario jointheteam@) puede pisar este
 * header si tiene un display name propio. La API de Gmail lo reporta vacío;
 * el nombre que arma el ATS es esta constante. No hay credenciales de Admin
 * en este repo para cambiar el perfil de Workspace.
 */
export const ATS_FROM_NAME = "Talent Acquisition Team";
export const ATS_FROM_NAME_EN = "Talent Acquisition Team";
export const ATS_FROM_EMAIL = "jointheteam@tradingsolutions.com";

/**
 * Display name of every ATS message. The argument is ignored on purpose:
 * callers, Gmail send-as, and the connected account profile must not
 * put a person's name on the From line. That includes the double-encoded
 * form «Kelly CastaÃƒÂ±eda» left on drafts from 28 Oct 2026.
 */
export function mailboxDisplayName(_requested?: string | null): string {
  return ATS_FROM_NAME;
}

/** RFC 2047 only when the name is not ASCII. The team name is ASCII, so it stays literal. */
export function encodeMailboxDisplayName(name?: string | null): string {
  const chosen = mailboxDisplayName(name);
  if (/[^\x20-\x7E]/.test(chosen)) {
    return `=?UTF-8?B?${Buffer.from(chosen, "utf8").toString("base64")}?=`;
  }
  if (/[",<>()]/.test(chosen)) return `"${chosen.replace(/"/g, "")}"`;
  return chosen;
}

/** From header. The mailbox is jointheteam@, not the Google account's profile name. */
export function atsFromHeader(mailbox: string = ATS_FROM_EMAIL): string {
  const addr = (mailbox || ATS_FROM_EMAIL).trim() || ATS_FROM_EMAIL;
  return `${encodeMailboxDisplayName()} <${addr}>`;
}
