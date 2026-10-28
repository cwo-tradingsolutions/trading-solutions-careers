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
