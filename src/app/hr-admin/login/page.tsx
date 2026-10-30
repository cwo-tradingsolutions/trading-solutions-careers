"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, ArrowRight } from "lucide-react";
import { safeAdminNext } from "@/lib/hr-admin-access";

const TS_HERO = "https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/691645b652c1e9091b25f59c_FotosWeb_TradingSolutions-14_4_11zon.webp";
const TS_LOGO_WHITE = "https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/6913594489519813fe9e620e_logo%20web-03.png";

const ERROR_TEXT: Record<string, string> = {
  not_allowed: "Tu cuenta de Google no tiene acceso a HR Admin.",
  google: "No se pudo completar el ingreso con Google. Intenta de nuevo.",
  state: "El ingreso venció o no coincide. Vuelve a intentarlo.",
  config: "El ingreso con Google no está configurado.",
  iap_invalid: "No se pudo validar el acceso de la red corporativa.",
};

function Hero() {
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
            Talent that<br />moves the world.
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

function LoginPanel() {
  const params = useSearchParams();
  const next = safeAdminNext(params.get("next"));
  const queryError = params.get("error");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [err, setErr] = useState<string | null>(queryError ? ERROR_TEXT[queryError] ?? null : null);

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
        if (!queryError && iapRes.status === 403) setErr(ERROR_TEXT.not_allowed);
        else if (!queryError && iap?.error === "iap_invalid") setErr(ERROR_TEXT.iap_invalid);
      } catch {
        // The Google button still works. The password form stays hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [next, queryError]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/hr-admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (r.ok) {
        window.location.assign(next);
      } else {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? "Clave incorrecta");
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="md:hidden flex flex-col items-center mb-8">
        <img src={TS_LOGO_WHITE} alt="Trading Solutions" className="h-10 w-auto invert" />
      </div>

      <div className="mb-7">
        <div className="text-sm font-medium text-ts-muted mb-2">
          HR Admin
        </div>
        <h2 className="text-3xl font-light tracking-[-0.02em] leading-tight text-ts-ink">
          Bienvenida.
        </h2>
        <p className="text-sm text-ts-secondary mt-2">
          Acceso restringido · Equipo de Talent Acquisition.
        </p>
      </div>

      <a
        href={`/api/hr-admin/login/google?next=${encodeURIComponent(next)}`}
        className="w-full border border-[color:var(--ts-line)] bg-ts-surface hover:bg-white text-ts-ink text-sm font-medium rounded-ts-sm py-3 flex items-center justify-center gap-2 transition-colors"
      >
        Continuar con Google
      </a>

      {passwordEnabled && (
        <form onSubmit={submit}>
          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-[color:var(--ts-line)]" />
            <span className="text-[11px] text-ts-muted">clave de emergencia</span>
            <div className="h-px flex-1 bg-[color:var(--ts-line)]" />
          </div>

          <label className="block text-sm font-medium text-ts-secondary mb-2">
            Clave de acceso
          </label>
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
            {loading ? "Verificando…" : (
              <>
                Entrar
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
          ¿Sin acceso? Contacta a{" "}
          <a className="text-ts-accent hover:underline font-medium" href="mailto:jointheteam@tradingsolutions.com">
            jointheteam@tradingsolutions.com
          </a>
        </p>
      </div>
    </div>
  );
}

export default function HRLoginPage() {
  return (
    <div className="min-h-screen flex font-sans bg-ts-ink">
      <Hero />
      <div className="flex-1 flex items-center justify-center p-6 bg-ts-canvas">
        <Suspense
          fallback={
            <div className="w-full max-w-sm">
              <div className="mb-7">
                <div className="text-sm font-medium text-ts-muted mb-2">HR Admin</div>
                <h2 className="text-3xl font-light tracking-[-0.02em] leading-tight text-ts-ink">Bienvenida.</h2>
              </div>
              <a
                href="/api/hr-admin/login/google"
                className="w-full border border-[color:var(--ts-line)] bg-ts-surface text-ts-ink text-sm font-medium rounded-ts-sm py-3 flex items-center justify-center"
              >
                Continuar con Google
              </a>
            </div>
          }
        >
          <LoginPanel />
        </Suspense>
      </div>
    </div>
  );
}
