export type LoginLang = "en" | "es";

export type LoginCopy = {
  kicker: string;
  title: string;
  toolLine: string;
  tagline: string;
  heroLead: string;
  heroRest: string;
  subtitle: string;
  google: string;
  emergency: string;
  passwordLabel: string;
  enter: string;
  verifying: string;
  help: string;
  notAllowed: string;
  googleFailed: string;
  state: string;
  config: string;
  iapInvalid: string;
  badPassword: string;
  passwordOff: string;
  network: string;
};

export const LOGIN_COPY: Record<LoginLang, LoginCopy> = {
  en: {
    kicker: "HR Admin",
    title: "Welcome.",
    toolLine: "Talent Acquisition · Internal Tool",
    tagline: "Where vision meets execution.",
    heroLead: "Talent that",
    heroRest: "moves the world.",
    subtitle: "Restricted access · Talent Acquisition.",
    google: "Continue with Google",
    emergency: "emergency key",
    passwordLabel: "Access key",
    enter: "Enter",
    verifying: "Checking…",
    help: "No access? Email",
    notAllowed: "Your Google account does not have access to HR Admin.",
    googleFailed: "Google sign-in did not finish. Try again.",
    state: "That sign-in expired or did not match. Try again.",
    config: "Google sign-in is not configured.",
    iapInvalid: "Corporate network access could not be checked.",
    badPassword: "That key is not right.",
    passwordOff: "The shared key is turned off.",
    network: "We couldn't sign you in. Email jointheteam@tradingsolutions.com and we'll help.",
  },
  es: {
    kicker: "HR Admin",
    title: "Te damos la bienvenida.",
    toolLine: "Talent Acquisition Team",
    tagline: "Donde la visión se encuentra con la ejecución.",
    heroLead: "El talento que",
    heroRest: "mueve al mundo.",
    subtitle: "Acceso restringido · Equipo de Talent Acquisition.",
    google: "Continuar con Google",
    emergency: "clave de emergencia",
    passwordLabel: "Clave de acceso",
    enter: "Entrar",
    verifying: "Verificando…",
    help: "¿Sin acceso? Escribe a",
    notAllowed: "Tu cuenta de Google no tiene acceso a HR Admin.",
    googleFailed: "No se pudo completar el ingreso con Google. Intenta de nuevo.",
    state: "El ingreso venció o no coincide. Vuelve a intentarlo.",
    config: "El ingreso con Google no está configurado.",
    iapInvalid: "No se pudo validar el acceso de la red corporativa.",
    badPassword: "Esa clave no es la correcta.",
    passwordOff: "La clave compartida está apagada.",
    network: "No pudimos ingresarte. Escribe a jointheteam@tradingsolutions.com y te ayudamos.",
  },
};

export function loginCopy(lang: LoginLang): LoginCopy {
  return LOGIN_COPY[lang] ?? LOGIN_COPY.en;
}

export function loginErrorText(lang: LoginLang, code: string | null | undefined): string | null {
  if (!code) return null;
  const copy = loginCopy(lang);
  const known: Record<string, string> = {
    not_allowed: copy.notAllowed,
    google: copy.googleFailed,
    state: copy.state,
    config: copy.config,
    iap_invalid: copy.iapInvalid,
  };
  return known[code] ?? null;
}
