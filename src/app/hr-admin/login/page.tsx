"use client";

import React, { useState } from "react";
import { Lock } from "lucide-react";
import Lockup from "@/components/universe/Lockup";

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
    <div className="hr-login">
      <form onSubmit={submit} className="hr-login-card">
        <div className="mb-7">
          <Lockup />
        </div>
        <p className="hr-login-eyebrow">HR Admin · Talent Acquisition</p>
        <h1 className="hr-login-title">Ingresa a tu portal</h1>
        <p className="hr-login-intro">
          Acceso del equipo de Talent Acquisition. Solo cuentas autorizadas.
        </p>

        <label htmlFor="hr-admin-key" className="hr-login-label">
          Clave de acceso
        </label>
        <div className="hr-login-field">
          <Lock className="w-4 h-4 shrink-0" aria-hidden />
          <input
            id="hr-admin-key"
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {err && <div className="hr-login-error">{err}</div>}

        <button type="submit" disabled={!password || loading} className="hr-login-cta">
          {loading ? "Verificando…" : "Entrar →"}
        </button>

        <p className="hr-login-foot">
          ¿Sin acceso?{" "}
          <a href="mailto:jointheteam@tradingsolutions.com">jointheteam@tradingsolutions.com</a>
        </p>
      </form>
    </div>
  );
}
