import { NextResponse } from "next/server";
import { HR_ADMIN_OAUTH_COOKIE, HR_ADMIN_OAUTH_MAX_AGE_SEC } from "./hr-admin-oauth";
import { HR_ADMIN_SESSION_COOKIE, HR_ADMIN_SESSION_MAX_AGE_SEC } from "./hr-admin-session";

type CookieRequest = {
  url?: string;
  headers?: { get(name: string): string | null };
};

/**
 * Secure when the browser request is HTTPS, or when that protocol is missing
 * and the public origin is HTTPS. NODE_ENV is not a signal.
 */
export function cookieIsSecure(req: CookieRequest): boolean {
  const forwarded = (req.headers?.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase();
  if (forwarded === "https") return true;
  if (forwarded === "http") return publicOriginIsHttps();
  try {
    if (req.url) {
      const protocol = new URL(req.url).protocol;
      if (protocol === "https:") return true;
      if (protocol === "http:") return publicOriginIsHttps();
    }
  } catch {
    /* fall through to the configured origin */
  }
  return publicOriginIsHttps();
}

function publicOriginIsHttps(): boolean {
  const raw = readAppUrl();
  if (!raw) return false;
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

function readAppUrl(): string | undefined {
  const fromRuntime = process.env["NEXT_PUBLIC_APP_URL"];
  if (typeof fromRuntime === "string" && fromRuntime.trim()) return fromRuntime.trim();
  const inlined = process.env.NEXT_PUBLIC_APP_URL;
  if (typeof inlined === "string" && inlined.trim()) return inlined.trim();
  return undefined;
}

export function setSessionCookie(res: NextResponse, token: string, secure: boolean): void {
  res.cookies.set(HR_ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: HR_ADMIN_SESSION_MAX_AGE_SEC,
  });
}

export function clearSessionCookie(res: NextResponse, secure: boolean): void {
  res.cookies.set(HR_ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function setOAuthCookie(res: NextResponse, token: string, secure: boolean): void {
  res.cookies.set(HR_ADMIN_OAUTH_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/hr-admin/login",
    maxAge: HR_ADMIN_OAUTH_MAX_AGE_SEC,
  });
}

export function clearOAuthCookie(res: NextResponse, secure: boolean): void {
  res.cookies.set(HR_ADMIN_OAUTH_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/hr-admin/login",
    maxAge: 0,
  });
}

export function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}
