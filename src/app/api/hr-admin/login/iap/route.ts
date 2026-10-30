/**
 * POST /api/hr-admin/login/iap
 *
 * When the Google load balancer presents x-goog-iap-jwt-assertion, validate it
 * and set the same hr_admin_session cookie. Absent header: no session.
 * Unset IAP_AUDIENCE or an empty allowlist: nobody enters this way.
 */
import { NextRequest, NextResponse } from "next/server";
import { parseAllowlist } from "@/lib/hr-admin-access";
import { noStore, setSessionCookie } from "@/lib/hr-admin-cookies";
import { decideIapAdmin, verifyIapAssertion } from "@/lib/hr-admin-iap";
import { signAdminSession } from "@/lib/hr-admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IAP_HEADER = "x-goog-iap-jwt-assertion";

export async function POST(req: NextRequest) {
  const assertion = req.headers.get(IAP_HEADER);
  if (!assertion) return noStore(NextResponse.json({ ok: false }));

  const audience = (process.env.IAP_AUDIENCE ?? "").trim();
  const secret = (process.env.ADMIN_SECRET ?? "").trim();
  if (!audience || !secret || secret.length < 6) {
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
    setSessionCookie(res, signAdminSession(secret, decision.email));
    return noStore(res);
  } catch {
    console.warn("[hr-admin] iap sign-in failed");
    return noStore(NextResponse.json({ ok: false, error: "iap_invalid" }, { status: 401 }));
  }
}
