// Comprobación compatible con Edge: solo rechaza marcadores conocidos,
// sin imponer nuevas reglas a claves reales ni revelar la configuración.
const MASKED_VALUES = new Set(['[SENSITIVE]', '[REDACTED]', '[HIDDEN]']);

export function isMaskedCredential(value: string | undefined): boolean {
  return value !== undefined && MASKED_VALUES.has(value.trim().toUpperCase());
}

export function hasMaskedCredentialConfig(config: {
  ADMIN_SECRET?: string;
  CRON_SECRET?: string;
  WXM_SERVICE_SECRET?: string;
  HR_ADMIN_SESSION_SECRET?: string;
  ADMIN_SCRIPTS_SECRET?: string;
}): boolean {
  return isMaskedCredential(config.ADMIN_SECRET) ||
    isMaskedCredential(config.CRON_SECRET) ||
    isMaskedCredential(config.WXM_SERVICE_SECRET) ||
    isMaskedCredential(config.HR_ADMIN_SESSION_SECRET) ||
    isMaskedCredential(config.ADMIN_SCRIPTS_SECRET);
}
