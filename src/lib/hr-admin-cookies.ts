import { NextResponse } from "next/server";
import { HR_ADMIN_OAUTH_COOKIE, HR_ADMIN_OAUTH_MAX_AGE_SEC } from "./hr-admin-oauth";
import { HR_ADMIN_SESSION_COOKIE, HR_ADMIN_SESSION_MAX_AGE_SEC } from "./hr-admin-session";

function secure(): boolean {
  return process.env.NODE_ENV === "production";
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(HR_ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: HR_ADMIN_SESSION_MAX_AGE_SEC,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(HR_ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function setOAuthCookie(res: NextResponse, token: string): void {
  res.cookies.set(HR_ADMIN_OAUTH_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/api/hr-admin/login",
    maxAge: HR_ADMIN_OAUTH_MAX_AGE_SEC,
  });
}

export function clearOAuthCookie(res: NextResponse): void {
  res.cookies.set(HR_ADMIN_OAUTH_COOKIE, "", {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/api/hr-admin/login",
    maxAge: 0,
  });
}

export function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}
