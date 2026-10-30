import React, { Suspense } from "react";
import { cookies } from "next/headers";
import { googleLoginHref, safeAdminNext } from "@/lib/hr-admin-access";
import { loginCopy, type LoginLang } from "@/lib/hr-admin-login-copy";
import { LOGIN_LANG_KEY, LoginFallback, LoginPanel } from "./login-form";

const TS_HERO = "https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/691645b652c1e9091b25f59c_FotosWeb_TradingSolutions-14_4_11zon.webp";
const TS_LOGO_WHITE = "https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/6913594489519813fe9e620e_logo%20web-03.png";

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function storedLang(): LoginLang {
  const value = cookies().get(LOGIN_LANG_KEY)?.value;
  return value === "es" ? "es" : "en";
}

function Hero({ lang }: { lang: LoginLang }) {
  const copy = loginCopy(lang);
  return (
    <div className="hidden md:flex md:w-1/2 lg:w-3/5 relative overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${TS_HERO})`,
          transform: "scale(1.05)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(var(--ts-ink-rgb),0.72) 0%, rgba(var(--ts-ink-rgb),0.28) 50%, rgba(var(--ts-ink-rgb),0.78) 100%)",
        }}
      />
      <div className="relative z-10 flex flex-col justify-between p-10 text-white w-full">
        <div className="flex items-center gap-3">
          <img src={TS_LOGO_WHITE} alt="Trading Solutions" className="h-9 w-auto" />
        </div>

        <div>
          <div className="ts-kicker ts-kicker-on-dark mb-3">
            <span className="ts-mark" aria-hidden />
            Talent Acquisition · Internal Tool
          </div>
          <h1 className="font-light text-5xl lg:text-6xl tracking-[-0.03em] leading-[0.95]">
            {copy.heroLead}<br />{copy.heroRest}
          </h1>
          <div className="flex items-center gap-3 mt-5 max-w-md">
            <div className="h-[1px] flex-1 bg-white/30" />
            <p className="text-sm font-medium opacity-80">
              Where vision meets execution.
            </p>
          </div>
        </div>

        <div className="text-[11px] opacity-60 font-medium">
          © Trading Solutions · 2026
        </div>
      </div>
    </div>
  );
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
    <div className="min-h-screen flex font-sans bg-ts-ink">
      <Hero lang={lang} />
      <div className="flex-1 flex items-center justify-center p-6 bg-ts-canvas">
        <Suspense fallback={<LoginFallback googleHref={googleHref} lang={lang} />}>
          <LoginPanel next={next} googleHref={googleHref} errorCode={errorCode} initialLang={lang} />
        </Suspense>
      </div>
    </div>
  );
}
