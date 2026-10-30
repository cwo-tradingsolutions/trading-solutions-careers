import React, { Suspense } from "react";
import { cookies } from "next/headers";
import { googleLoginHref, safeAdminNext } from "@/lib/hr-admin-access";
import type { LoginLang } from "@/lib/hr-admin-login-copy";
import { LOGIN_LANG_KEY, LoginFallback, LoginPanel } from "./login-form";

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function storedLang(): LoginLang {
  const value = cookies().get(LOGIN_LANG_KEY)?.value;
  return value === "es" ? "es" : "en";
}

export default function HRLoginPage({
  searchParams,
}: {
  searchParams?: { next?: string | string[]; error?: string | string[] };
}) {
  const next = safeAdminNext(first(searchParams?.next));
  const googleHref = googleLoginHref(next);
  const errorCode = first(searchParams?.error);
  const lang = storedLang();
  return (
    <Suspense fallback={<LoginFallback googleHref={googleHref} lang={lang} />}>
      <LoginPanel next={next} googleHref={googleHref} errorCode={errorCode} initialLang={lang} />
    </Suspense>
  );
}
