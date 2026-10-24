"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  ShieldCheck,
  Copy,
  KeyRound,
  Globe,
  AlertCircle,
} from "lucide-react";

/**
 * HR Admin → LinkedIn Setup
 * Guía paso a paso para conectar la Company Page de Trading Solutions
 * al ATS usando OAuth 2.0 corporativo (sin credenciales personales).
 */
export default function LinkedInSetupPage() {
  const [step, setStep] = useState(1);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://trading-solutions-careers.vercel.app";
  const redirectUri = `${origin}/api/linkedin/callback`;
  const webhookUrl = `${origin}/api/linkedin/webhook`;

  return (
    <div className="min-h-screen bg-ts-canvas">
      <header className="border-b border-ts-hairline">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <Link href="/hr-admin" className="text-sm text-ts-muted hover:text-ts-accent">
            ← Volver al HR Admin
          </Link>
          <h1 className="ts-heading text-3xl mt-4">
            Conectar LinkedIn Trading Solutions
          </h1>
          <p className="text-ts-muted mt-3 max-w-2xl">
            Integración oficial vía <b>OAuth 2.0 corporativo</b> y{" "}
            <b>LinkedIn Talent Solutions · Recruiter System Connect (RSC)</b>. Nunca
            usamos el usuario y contraseña personales — sólo la App corporativa de
            Trading Solutions asociada a la Company Page.
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Warning sobre credenciales personales */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-8 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-900 mb-1">
              ¿Por qué no usamos tu usuario y contraseña?
            </h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              Compartir credenciales personales viola los <i>Terms of Service</i> de
              LinkedIn y genera riesgos de seguridad (revocación, auditoría, MFA).
              La ruta correcta y productiva es crear una <b>LinkedIn App corporativa</b>{" "}
              vinculada a la Company Page de Trading Solutions. El admin corporativo
              autoriza la app con un click, y a partir de ahí el ATS actúa en nombre
              de la compañía con un <i>access token</i> revocable.
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="space-y-3">
          <SetupStep
            n={1}
            title="Crear la LinkedIn App corporativa"
            active={step === 1}
            onClick={() => setStep(1)}
          >
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
              <li>
                Entra con el admin corporativo (no personal) a{" "}
                <a
                  className="underline inline-flex items-center gap-1"
                  href="https://www.linkedin.com/developers/apps/new"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  linkedin.com/developers/apps/new
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                App name: <code className="bg-gray-100 px-1.5 rounded">Trading Solutions ATS</code>
              </li>
              <li>
                LinkedIn Page: <b>Trading Solutions</b> (la Company Page oficial)
              </li>
              <li>
                Privacy policy URL: <code className="bg-gray-100 px-1.5 rounded">{origin}/privacy</code>
              </li>
              <li>Sube el logo oficial de TS y acepta los términos.</li>
              <li>
                Al crearla, ve a la pestaña <b>Auth</b> y copia{" "}
                <code className="bg-gray-100 px-1.5 rounded">Client ID</code> y{" "}
                <code className="bg-gray-100 px-1.5 rounded">Client Secret</code>.
              </li>
            </ol>
          </SetupStep>

          <SetupStep
            n={2}
            title="Solicitar los productos necesarios"
            active={step === 2}
            onClick={() => setStep(2)}
          >
            <p className="text-sm text-gray-700 mb-3">
              En la pestaña <b>Products</b> de la app, solicita estos productos.
              Los 3 primeros son automáticos; Talent Solutions / RSC requiere
              aprobación comercial (hay que escribirle al <i>account manager</i> de LinkedIn):
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2 items-start">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" /> Sign In with LinkedIn using OpenID Connect
              </li>
              <li className="flex gap-2 items-start">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" /> Share on LinkedIn
              </li>
              <li className="flex gap-2 items-start">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" /> Marketing Developer Platform
              </li>
              <li className="flex gap-2 items-start">
                <Circle className="w-4 h-4 mt-0.5 text-amber-600" /> Talent Solutions · Recruiter System Connect <b className="text-amber-700">(aprobación comercial)</b>
              </li>
            </ul>
          </SetupStep>

          <SetupStep
            n={3}
            title="Whitelist de URLs de Trading Solutions Careers"
            active={step === 3}
            onClick={() => setStep(3)}
          >
            <p className="text-sm text-gray-700 mb-3">
              En la pestaña <b>Auth → OAuth 2.0 settings</b> agrega estos redirect URIs:
            </p>
            <div className="space-y-2">
              <CopyRow label="Redirect URI (producción)" value={redirectUri} />
              <CopyRow label="Redirect URI (desarrollo local)" value="http://localhost:3010/api/linkedin/callback" />
              <CopyRow label="Webhook RSC (Easy Apply)" value={webhookUrl} />
            </div>
          </SetupStep>

          <SetupStep
            n={4}
            title="Guardar las credenciales en Vercel"
            active={step === 4}
            onClick={() => setStep(4)}
          >
            <p className="text-sm text-gray-700 mb-3">
              En <b>Vercel → Project Settings → Environment Variables</b> agrega:
            </p>
            <div className="bg-gray-900 text-gray-200 rounded-xl p-4 text-xs font-mono space-y-1">
              <div>LINKEDIN_CLIENT_ID=<span className="text-amber-300">pegar Client ID</span></div>
              <div>LINKEDIN_CLIENT_SECRET=<span className="text-amber-300">pegar Client Secret</span></div>
              <div>LINKEDIN_COMPANY_ID=<span className="text-amber-300">URN numérico de la Company Page</span></div>
              <div>LINKEDIN_REDIRECT_URI={redirectUri}</div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Después del save, Vercel re-despliega. El Client Secret nunca debe
              aparecer en el código ni en el frontend.
            </p>
          </SetupStep>

          <SetupStep
            n={5}
            title="Autorizar la conexión"
            active={step === 5}
            onClick={() => setStep(5)}
          >
            <p className="text-sm text-gray-700 mb-4">
              Con el admin corporativo loggeado en LinkedIn, click aquí para autorizar.
              LinkedIn pedirá consentimiento para los scopes y te devolverá al HR Admin.
            </p>
            <a
              href="/api/linkedin/auth"
              className="inline-flex items-center gap-2 bg-[#0A66C2] text-white px-5 py-3 rounded-full font-semibold text-sm hover:bg-[#084d94]"
            >
              <Globe className="w-4 h-4" />
              Autorizar Trading Solutions en LinkedIn
            </a>
          </SetupStep>

          <SetupStep
            n={6}
            title="Verificación final"
            active={step === 6}
            onClick={() => setStep(6)}
          >
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2 items-start">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" />
                El HR Admin → LinkedIn TS muestra estado <b>Conectado</b>.
              </li>
              <li className="flex gap-2 items-start">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" />
                Al crear una vacante, aparece la opción <b>Publicar a LinkedIn TS</b>.
              </li>
              <li className="flex gap-2 items-start">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" />
                Las aplicaciones de Easy Apply entran por webhook al pipeline
                dentro de los 30 segundos.
              </li>
              <li className="flex gap-2 items-start">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" />
                El CV Bank se enriquece con metadata de LinkedIn (skills, recomendaciones,
                alumni, Open-to-Work).
              </li>
            </ul>
          </SetupStep>
        </div>

        {/* Security footer */}
        <div className="mt-12 border-t border-gray-200 pt-6 text-xs text-gray-500 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 flex-shrink-0 text-gray-700" />
          <p>
            El access token se almacena cifrado (httpOnly cookie + rotación server-side).
            El Client Secret vive sólo en variables de entorno del servidor. Todas las
            llamadas a LinkedIn son logueadas en <code className="bg-gray-100 px-1 rounded">agent_logs</code>{" "}
            y <code className="bg-gray-100 px-1 rounded">audit_trail</code> con timestamp inmutable.
          </p>
        </div>
      </div>
    </div>
  );
}

/* helpers */
function SetupStep({
  n,
  title,
  active,
  children,
  onClick,
}: {
  n: number;
  title: string;
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      className={`border rounded-2xl transition-colors ${
        active ? "border-black bg-white" : "border-gray-200 bg-gray-50"
      }`}
    >
      <button
        onClick={onClick}
        className="w-full flex items-center gap-4 px-5 py-4 text-left"
      >
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
            active ? "bg-black text-white" : "bg-white border border-gray-300 text-gray-500"
          }`}
        >
          {n}
        </div>
        <div className="flex-1">
          <div className={`font-bold ${active ? "text-black" : "text-gray-700"}`}>{title}</div>
        </div>
        <KeyRound className={`w-4 h-4 ${active ? "text-black" : "text-gray-400"}`} />
      </button>
      {active && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };
  return (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] tracking-wider text-gray-500 uppercase font-semibold">{label}</div>
        <code className="text-xs text-gray-800 break-all">{value}</code>
      </div>
      <button
        onClick={copy}
        className="text-xs flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg hover:border-black font-medium"
      >
        <Copy className="w-3 h-3" />
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
