"use client";

import { useState } from "react";
import { Send, ArrowRight, CheckCircle2, AlertTriangle, FileText } from "lucide-react";

const TS_HERO = "https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/691645b652c1e9091b25f59c_FotosWeb_TradingSolutions-14_4_11zon.webp";
const TS_LOGO = "https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/6913594489519813fe9e620e_logo%20web-03.png";

export default function RecomendarHojaDeVidaPage() {
  const [phase, setPhase] = useState<'form' | 'submitting' | 'success'>('form');
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [candidateRole, setCandidateRole] = useState("");
  const [candidateLocation, setCandidateLocation] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [referrerName, setReferrerName] = useState("");
  const [referrerEmail, setReferrerEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [recommendedRole, setRecommendedRole] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPhase('submitting');

    try {
      // Convert CV to base64 if present (kept as cv_url data URI for simplicity)
      let cvUrl: string | null = null;
      let cvFilename: string | null = null;
      if (cvFile) {
        if (cvFile.size > 5 * 1024 * 1024) {
          setError('El CV no puede pesar más de 5MB');
          setPhase('form');
          return;
        }
        cvFilename = cvFile.name;
        const buf = await cvFile.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        cvUrl = `data:${cvFile.type || 'application/octet-stream'};base64,${b64}`;
      }

      const r = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_name: candidateName,
          candidate_email: candidateEmail || null,
          candidate_phone: candidatePhone || null,
          candidate_role: candidateRole || null,
          candidate_location: candidateLocation || null,
          linkedin_url: linkedinUrl || null,
          cv_url: cvUrl,
          cv_filename: cvFilename,
          referrer_name: referrerName,
          referrer_email: referrerEmail || null,
          referrer_relationship: relationship || null,
          recommended_for_role: recommendedRole || null,
          notes: notes || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || 'Error al enviar');
        setPhase('form');
      } else {
        setPhase('success');
      }
    } catch (e: any) {
      setError(e?.message || 'Error de red');
      setPhase('form');
    }
  };

  if (phase === 'success') {
    return (
      <div className="min-h-screen flex font-sans bg-white">
        <div className="hidden md:block md:w-1/2 lg:w-2/5 relative overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${TS_HERO})` }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 100%)' }} />
          <div className="relative z-10 p-10 text-white h-full flex flex-col justify-end">
            <img src={TS_LOGO} alt="Trading Solutions" className="h-9 w-auto mb-auto" />
            <h1 className="text-4xl font-bold tracking-[-0.03em] leading-[0.95]">Gracias por confiar<br />en alguien.</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Recomendación recibida</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Gracias <strong>{referrerName.split(' ')[0]}</strong>. Recibimos la hoja de vida de{' '}
              <strong>{candidateName}</strong>. El equipo de Talent Acquisition la revisará y, si hay match con alguna vacante actual o futura, nos pondremos en contacto directamente con la persona.
            </p>
            <p className="text-xs text-gray-500 mt-4">
              Si quieres recomendar a otra persona, puedes volver a abrir esta página.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex font-sans bg-white">
      {/* Lado izquierdo: hero */}
      <div className="hidden md:flex md:w-1/2 lg:w-2/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${TS_HERO})`, transform: 'scale(1.05)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.7) 100%)' }} />
        <div className="relative z-10 flex flex-col justify-between p-10 text-white w-full">
          <img src={TS_LOGO} alt="Trading Solutions" className="h-9 w-auto" />
          <div>
            <div className="text-[10px] tracking-[3px] uppercase font-semibold opacity-70 mb-3">
              Talent Recommendation
            </div>
            <h1 className="font-bold text-4xl lg:text-5xl tracking-[-0.03em] leading-[0.95]">
              ¿Conocés talento?<br />Recomendalo.
            </h1>
            <div className="flex items-center gap-3 mt-5 max-w-md">
              <div className="h-[1px] flex-1 bg-white/30" />
              <p className="text-sm font-medium opacity-80">
                Cada hoja de vida que llega por acá la revisamos en menos de 5 días.
              </p>
            </div>
          </div>
          <div className="text-[11px] opacity-60">© Trading Solutions · 2026</div>
        </div>
      </div>

      {/* Lado derecho: form */}
      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6 sm:p-10">
          <div className="md:hidden mb-6">
            <img src={TS_LOGO} alt="Trading Solutions" className="h-10 w-auto invert" />
          </div>

          <div className="text-[10px] tracking-[2.5px] uppercase font-semibold text-gray-500 mb-2">Recomienda talento</div>
          <h2 className="text-3xl font-bold tracking-[-0.02em] leading-tight mb-2">Comparte una hoja de vida.</h2>
          <p className="text-sm text-gray-600 mb-8">
            Para evitar el caos por WhatsApp y email, usamos esta página. La revisaremos pronto y te avisamos si avanzamos.
          </p>

          {/* SECTION: Candidato */}
          <SectionTitle>Sobre la persona que recomiendas</SectionTitle>
          <Field label="Nombre completo" required>
            <Input value={candidateName} onChange={setCandidateName} placeholder="Ana López Rodríguez" required />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <Field label="Email">
              <Input type="email" value={candidateEmail} onChange={setCandidateEmail} placeholder="ana@ejemplo.com" />
            </Field>
            <Field label="Teléfono / WhatsApp">
              <Input value={candidatePhone} onChange={setCandidatePhone} placeholder="+57 300 123 4567" />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <Field label="Cargo actual">
              <Input value={candidateRole} onChange={setCandidateRole} placeholder="Ej: Pricing Analyst Senior" />
            </Field>
            <Field label="Ciudad / país">
              <Input value={candidateLocation} onChange={setCandidateLocation} placeholder="Barranquilla, Colombia" />
            </Field>
          </div>
          <Field label="LinkedIn (URL del perfil)">
            <Input value={linkedinUrl} onChange={setLinkedinUrl} placeholder="https://linkedin.com/in/ana-lopez" />
          </Field>
          <Field label="Hoja de vida (PDF, máx 5MB)">
            <label className="flex items-center gap-3 px-3 py-2.5 border-2 border-dashed border-gray-300 hover:border-black rounded-lg cursor-pointer transition-colors">
              <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={e => setCvFile(e.target.files?.[0] || null)}
                className="flex-1 text-xs"
              />
            </label>
            {cvFile && (
              <div className="text-[11px] text-gray-500 mt-1">
                ✓ {cvFile.name} ({(cvFile.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </Field>

          {/* SECTION: Recomendador */}
          <SectionTitle className="mt-6">Tu información</SectionTitle>
          <Field label="Tu nombre" required>
            <Input value={referrerName} onChange={setReferrerName} placeholder="¿Cómo te llamás?" required />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <Field label="Tu email">
              <Input type="email" value={referrerEmail} onChange={setReferrerEmail} placeholder="tu@email.com" />
            </Field>
            <Field label="Cómo conoces a esta persona">
              <select
                value={relationship}
                onChange={e => setRelationship(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-black"
              >
                <option value="">— Elegir —</option>
                <option value="ex-companero">Ex-compañero/a de trabajo</option>
                <option value="amigo">Amigo/a</option>
                <option value="familiar">Familiar</option>
                <option value="ex-jefe">Ex-jefe/a o ex-direct report</option>
                <option value="universidad">Compañero/a de universidad</option>
                <option value="cliente">Cliente o proveedor</option>
                <option value="otro">Otro</option>
              </select>
            </Field>
          </div>

          {/* SECTION: Contexto */}
          <SectionTitle className="mt-6">Contexto (opcional pero útil)</SectionTitle>
          <Field label="¿Para qué tipo de rol crees que sirve?">
            <Input
              value={recommendedRole}
              onChange={setRecommendedRole}
              placeholder="Ej: Pricing, Sales, cualquier vacante operativa…"
            />
          </Field>
          <Field label="¿Por qué la recomiendas?">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Cuéntanos brevemente sobre esta persona — su trayectoria, lo que la destaca, por qué crees que encaja con TS…"
              rows={4}
              maxLength={2000}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black resize-none"
            />
          </Field>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 mt-4 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={phase === 'submitting' || !candidateName || !referrerName}
            className="w-full bg-black hover:bg-gray-800 text-white text-sm font-semibold rounded-full mt-6 py-3.5 flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {phase === 'submitting' ? 'Enviando…' : (
              <>
                <Send className="w-4 h-4" />
                Enviar recomendación
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-[11px] text-gray-400 text-center mt-4 leading-relaxed">
            Trading Solutions revisa cada recomendación. Si hay match con una vacante, contactamos directamente a la persona.
          </p>
        </form>
      </div>
    </div>
  );
}

function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`text-[10px] uppercase tracking-[2px] font-semibold text-gray-500 mb-3 pb-2 border-b border-gray-100 ${className}`}>
      {children}
    </h3>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] uppercase tracking-wider font-semibold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', required }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-black transition-colors"
    />
  );
}
