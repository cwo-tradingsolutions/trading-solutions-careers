"use client";

import React, { useEffect, useState } from "react";
import { Lock, ArrowRight } from "lucide-react";
import { loginCopy, loginErrorText, type LoginLang } from "@/lib/hr-admin-login-copy";

const HELP_EMAIL = "jointheteam@tradingsolutions.com";
export const LOGIN_LANG_KEY = "hr-admin-lang";

export function persistLoginLang(lang: LoginLang) {
  try {
    window.localStorage.setItem(LOGIN_LANG_KEY, lang);
  } catch {
    /* private mode */
  }
  document.cookie = `${LOGIN_LANG_KEY}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function LoginFallback({ googleHref, lang = "en" }: { googleHref: string; lang?: LoginLang }) {
  const copy = loginCopy(lang);
  return (
    <div className="w-full max-w-sm">
      <div className="mb-7">
        <div className="text-sm font-medium text-ts-muted mb-2">{copy.kicker}</div>
        <h2 className="text-3xl font-light tracking-[-0.02em] leading-tight text-ts-ink">{copy.title}</h2>
        <p className="text-sm text-ts-secondary mt-2">{copy.subtitle}</p>
      </div>
      <a
        href={googleHref}
        className="w-full border border-[color:var(--ts-line)] bg-ts-surface text-ts-ink text-sm font-medium rounded-ts-sm py-3 flex items-center justify-center"
      >
        {copy.google}
      </a>
    </div>
  );
}

export function LoginPanel({
  next,
  googleHref,
  errorCode,
  initialLang = "en",
}: {
  next: string;
  googleHref: string;
  errorCode: string | null;
  initialLang?: LoginLang;
}) {
  const [lang, setLang] = useState<LoginLang>(initialLang);
  const copy = loginCopy(lang);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [err, setErr] = useState<string | null>(loginErrorText(lang, errorCode));

  useEffect(() => {
    setErr(loginErrorText(lang, errorCode));
  }, [lang, errorCode]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOGIN_LANG_KEY);
      if (saved === "en" || saved === "es") setLang(saved);
    } catch {
      /* private mode */
    }
  }, []);

  const chooseLang = (nextLang: LoginLang) => {
    setLang(nextLang);
    persistLoginLang(nextLang);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfgRes, iapRes] = await Promise.all([
          fetch("/api/hr-admin/login", { cache: "no-store" }),
          fetch("/api/hr-admin/login/iap", { method: "POST", cache: "no-store" }),
        ]);
        const cfg = cfgRes.ok ? await cfgRes.json() : null;
        const iap = await iapRes.json().catch(() => null);
        if (cancelled) return;
        if (iap?.ok) {
          window.location.assign(next);
          return;
        }
        if (cfg && cfg.passwordEnabled === true) setPasswordEnabled(true);
        if (!errorCode && iapRes.status === 403) setErr(loginCopy(lang).notAllowed);
        else if (!errorCode && iap?.error === "iap_invalid") setErr(loginCopy(lang).iapInvalid);
      } catch {
        // The Google button still works. The password form stays hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [next, errorCode, lang]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const response = await fetch("/api/hr-admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        window.location.assign(next);
        return;
      }
      if (response.status === 401) setErr(copy.badPassword);
      else if (response.status === 403) setErr(copy.passwordOff);
      else setErr(copy.network);
    } catch {
      setErr(copy.network);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="flex justify-end gap-2 text-xs mb-4">
        <button
          type="button"
          onClick={() => chooseLang("en")}
          aria-pressed={lang === "en"}
          className={lang === "en" ? "font-semibold text-ts-ink" : "text-ts-muted"}
        >
          EN
        </button>
        <span className="text-ts-muted" aria-hidden>|</span>
        <button
          type="button"
          onClick={() => chooseLang("es")}
          aria-pressed={lang === "es"}
          className={lang === "es" ? "font-semibold text-ts-ink" : "text-ts-muted"}
        >
          ES
        </button>
      </div>

      <div className="mb-7">
        <div className="text-sm font-medium text-ts-muted mb-2">{copy.kicker}</div>
        <h2 className="text-3xl font-light tracking-[-0.02em] leading-tight text-ts-ink">{copy.title}</h2>
        <p className="text-sm text-ts-secondary mt-2">{copy.subtitle}</p>
      </div>

      <a
        href={googleHref}
        className="w-full border border-[color:var(--ts-line)] bg-ts-surface hover:bg-white text-ts-ink text-sm font-medium rounded-ts-sm py-3 flex items-center justify-center gap-2 transition-colors"
      >
        {copy.google}
      </a>

      {passwordEnabled && (
        <form onSubmit={submit}>
          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-[color:var(--ts-line)]" />
            <span className="text-[11px] text-ts-muted">{copy.emergency}</span>
            <div className="h-px flex-1 bg-[color:var(--ts-line)]" />
          </div>

          <label className="block text-sm font-medium text-ts-secondary mb-2">{copy.passwordLabel}</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="password"
              autoFocus
              className="w-full border border-[color:var(--ts-line)] rounded-ts-sm px-10 py-3 text-sm bg-ts-surface focus:border-ts-accent focus:outline-none transition-colors"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={!password || loading}
            className="w-full bg-ts-accent hover:bg-[var(--ts-accent-hover)] text-white text-sm font-medium rounded-ts-sm mt-5 py-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? copy.verifying : (
              <>
                {copy.enter}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}

      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 mt-3">
          {err}
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-gray-100">
        <p className="text-[11px] text-gray-400 text-center leading-relaxed">
          {copy.help}{" "}
          <a className="text-ts-accent hover:underline font-medium" href={`mailto:${HELP_EMAIL}`}>
            {HELP_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
