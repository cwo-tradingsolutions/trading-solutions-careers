/**
 * POST /api/hr-admin/login/iap
 *
 * Cloud Run behind IAP only (K_SERVICE set, and not Vercel). The load balancer
 * presents x-goog-iap-jwt-assertion. Anywhere else the header is ignored.
 */
import { NextRequest, NextResponse } from "next/server";
import { parseAllowlist } from "@/lib/hr-admin-access";
import { cookieIsSecure, noStore, setSessionCookie } from "@/lib/hr-admin-cookies";
import { decideIapAdmin, verifyIapAssertion } from "@/lib/hr-admin-iap";
import { signAdminSession } from "@/lib/hr-admin-session";
import { iapAvailable, readSessionSecret } from "@/lib/hr-admin-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IAP_HEADER = "x-goog-iap-jwt-assertion";

export async function POST(req: NextRequest) {
  if (!iapAvailable()) return noStore(NextResponse.json({ ok: false }));

  const assertion = req.headers.get(IAP_HEADER);
  if (!assertion) return noStore(NextResponse.json({ ok: false }));

  const audience = (process.env.IAP_AUDIENCE ?? "").trim();
  const secret = readSessionSecret();
  if (!audience || !secret) {
    return noStore(NextResponse.json({ ok: false, error: "config" }, { status: 401 }));
  }

  try {
    const claims = await verifyIapAssertion(assertion, audience);
    const decision = decideIapAdmin(claims, {
      audience,
      allowlist: parseAllowlist(process.env.HR_ADMIN_ALLOWED_EMAILS),
      now: Date.now(),
    });
    if (!decision.ok) {
      console.warn(`[hr-admin] iap sign-in denied: ${decision.reason}`);
      return noStore(NextResponse.json({ ok: false, error: "not_allowed" }, { status: 403 }));
    }
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, signAdminSession(secret, decision.email), cookieIsSecure(req));
    return noStore(res);
  } catch {
    console.warn("[hr-admin] iap sign-in failed");
    return noStore(NextResponse.json({ ok: false, error: "iap_invalid" }, { status: 401 }));
  }
}
