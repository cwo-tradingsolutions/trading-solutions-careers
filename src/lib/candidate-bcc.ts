/**
 * Kelly: EMAIL_BCC se vacía.
 * Candidate mail goes out with no BCC. The stored recruiter_config.email_bcc
 * and the EMAIL_BCC env are ignored, even when both are set.
 */
export function candidateMailBcc(
  _envBcc?: string | null,
  _configBcc?: string | null,
): undefined {
  return undefined;
}
