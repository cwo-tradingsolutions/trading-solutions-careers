"use client";

import React, { useState } from "react";
import { Lock } from "lucide-react";
import UniverseMark from "@/components/universe/Mark";

export default function HRLoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next") || "/hr-admin";
        window.location.href = next;
      } else {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? "Clave incorrecta");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo verificar la clave");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ts-canvas text-ts-ink flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <form onSubmit={submit} className="w-full max-w-sm">
          <UniverseMark className="mb-8" />
          <p className="text-[13px] text-ts-accent mb-3">Panel HR</p>
          <h1 className="ts-display font-light text-4xl mb-2">Ingresa a Careers.</h1>
          <p className="text-sm text-ts-muted mb-8">
            Acceso del equipo de selección.
          </p>

          <label className="block text-sm text-ts-secondary mb-2">
            Clave de acceso
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ts-ink-mute" />
            <input
              type="password"
              autoFocus
              className="w-full border border-ts-hairline rounded-ts-md px-10 py-3 text-sm bg-ts-surface focus:border-ts-accent focus:outline-none"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {err && (
            <div className="bg-[var(--ts-red-bg)] border border-[var(--ts-red-border)] rounded-ts-sm p-3 text-xs text-[var(--ts-red)] mt-3">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={!password || loading}
            className="pill-btn pill-btn-primary w-full justify-center mt-5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Verificando…" : "Entrar"}
          </button>

          <p className="text-[12px] text-ts-muted text-center mt-8">
            ¿Sin acceso?{" "}
            <a className="text-ts-accent" href="mailto:jointheteam@tradingsolutions.com">
              jointheteam@tradingsolutions.com
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
