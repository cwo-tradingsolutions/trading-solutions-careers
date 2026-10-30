import { OAuth2Client } from "google-auth-library";
import { assertIapClaims, IAP_ISSUER, type IdentityClaims, type IdentityDecision } from "./hr-admin-access";

/**
 * Validates x-goog-iap-jwt-assertion against Google's IAP public keys.
 * iss, aud, exp, and the signature are checked here. The allowlist and hd
 * are checked by assertIapClaims. No audience configured means no IAP login.
 */
export async function verifyIapAssertion(token: string, audience: string): Promise<IdentityClaims> {
  const assertion = token.trim();
  if (!assertion || !audience) throw new Error("iap_unconfigured");
  const client = new OAuth2Client();
  const { pubkeys } = await client.getIapPublicKeys();
  const ticket = await client.verifySignedJwtWithCertsAsync(assertion, pubkeys, audience, [IAP_ISSUER]);
  const payload = ticket.getPayload();
  if (!payload) throw new Error("empty_iap_token");
  return {
    iss: payload.iss,
    aud: payload.aud,
    exp: payload.exp,
    email: payload.email,
    email_verified: payload.email_verified,
    hd: payload.hd,
  };
}

export function decideIapAdmin(
  claims: IdentityClaims,
  opts: { audience: string; allowlist: readonly string[]; now: number },
): IdentityDecision {
  return assertIapClaims(claims, opts);
}
