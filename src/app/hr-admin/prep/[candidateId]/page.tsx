"use client";

/**
 * Página de Interview Prep · printable, on-demand.
 *
 * URLs:
 *   /hr-admin/prep/[candidateId]              → modo recruiter (Kelly antes de entrevista)
 *   /hr-admin/prep/[candidateId]?mode=cwo     → modo CWO Handoff (después de recruiter eval)
 *
 * Imprimir: Cmd+P · estilos optimizados con @media print.
 */
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CEO_MANDATES, MANDATE_SCORE_SYMBOLS, MANDATE_SCORE_LABELS, MANDATE_SCORE_COLORS, MandateScore } from "@/lib/ceo-mandates";

const ENGLISH_SCENARIOS = [
  {
    minute: "0:00–0:30",
    prompt: "Tell me a bit about yourself in English · just three or four sentences. Take your time.",
    look: "Estructura básica · vocabulario sales/logistics · pronunciación inteligible",
  },
  {
    minute: "0:30–1:30",
    prompt: "Imagine I'm a US-based importer asking for a quote on a 40' container Shanghai → Miami. Walk me through what info you'd ask me.",
    look: "Léxico técnico (origin, destination, freight, transit time, INCOTERMS, weight) · capacidad de hacer preguntas",
  },
  {
    minute: "1:30–2:30",
    prompt: "A client emails you complaining their cargo is delayed by 5 days. How do you respond?",
    look: "Manejo de conflicto en EN · empatía + assertiveness · voz comercial",
  },
  {
    minute: "2:30–3:00",
    prompt: "Switch back to Spanish. ¿Qué tan cómodo te sentiste? ¿Dónde sientes que necesitas más práctica?",
    look: "Autoconciencia · honestidad · willingness to grow",
  },
];

export default function InterviewPrepPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const candidateId = params?.candidateId as string;
  const mode = searchParams?.get("mode") === "cwo" ? "cwo" : "recruiter";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!candidateId) return;
    fetch(`/api/admin/candidates/${candidateId}/interview-prep`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (j.error) setError(j.error);
        else setData(j);
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [candidateId]);

  if (loading) return <CenteredMessage>Cargando prep…</CenteredMessage>;
  if (error) return <CenteredMessage>Error: {error}</CenteredMessage>;
  if (!data) return null;

  const c = data.candidate;
  const pf = c.prefilter_data || {};
  const firstName = (c.name || "").split(" ")[0];
  const assessment = data.previous_assessment;
  const isCWOMode = mode === "cwo" && !!assessment;

  return (
    <div className="prep-page bg-white text-gray-900 min-h-screen">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page-break { page-break-after: always; }
        }
        @page { size: letter; margin: 0.5in; }
        .prep-page { font-family: 'Helvetica', 'Arial', sans-serif; }
      `}</style>

      {/* Toolbar (no print) */}
      <div className="no-print sticky top-10 z-10 bg-black text-white px-6 py-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[2.5px] font-bold opacity-80">
          {isCWOMode ? "CWO Handoff" : "Interview Prep"} · {c.name}
        </div>
        <div className="flex gap-2">
          {!isCWOMode && assessment && (
            <a
              href={`/hr-admin/prep/${candidateId}?mode=cwo`}
              className="text-xs font-bold px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              👔 Modo CWO Handoff
            </a>
          )}
          {isCWOMode && (
            <a
              href={`/hr-admin/prep/${candidateId}`}
              className="text-xs font-medium px-4 py-1.5 border border-white/40 rounded hover:bg-white/10"
            >
              ← Modo Recruiter
            </a>
          )}
          <button
            onClick={() => window.print()}
            className="text-xs font-bold px-4 py-1.5 bg-white text-black rounded hover:bg-gray-200"
          >
            🖨️ Imprimir / Guardar PDF
          </button>
          <button
            onClick={() => window.close()}
            className="text-xs font-medium px-4 py-1.5 border border-white/40 rounded hover:bg-white/10"
          >
            Cerrar
          </button>
        </div>
      </div>

      <div className="max-w-[8.5in] mx-auto px-8 py-8 space-y-6">
        {/* Header */}
        <header className="border-b-2 border-black pb-4">
          <div className="text-[10px] uppercase tracking-[2.5px] font-bold text-gray-500 mb-1">
            {isCWOMode
              ? "Trading Solutions · CWO Handoff · Post Recruiter Interview"
              : "Trading Solutions · Recruiter Interview Prep"}
          </div>
          <h1 className="text-3xl font-extrabold leading-tight">{c.name}</h1>
          <div className="text-sm text-gray-700 mt-1">
            {c.vacancy_title} · {pf.city || "—"}
            {pf.availability && <> · Disponibilidad: <strong>{pf.availability}</strong></>}
          </div>
          {isCWOMode && assessment && (
            <div className="text-[11px] text-gray-600 mt-2 italic">
              Recruiter eval: {assessment.interviewer_email || "Kelly Castañeda"} ·
              {assessment.interview_date ? new Date(assessment.interview_date).toLocaleDateString("es-CO") : "—"}
            </div>
          )}
        </header>

        {/* CWO Handoff section · solo en modo CWO */}
        {isCWOMode && assessment && (
          <CWOHandoffSection assessment={assessment} candidate={c} />
        )}

        {/* Quick header stats · si hay assessment usa el inglés real, sino el declarado */}
        <section className="grid grid-cols-4 gap-3 text-xs">
          <Stat
            label={assessment?.english_real ? "Inglés real" : "Inglés decl."}
            value={assessment?.english_real || pf.english_level || "—"}
            highlight={
              assessment?.english_verdict === "pass" ? "good" :
              assessment?.english_verdict === "gap" ? "ok" :
              assessment?.english_verdict === "fail" ? "warn" :
              pf.english_level?.startsWith("C") ? "good" :
              pf.english_level?.startsWith("B2") ? "good" :
              pf.english_level?.startsWith("B1") ? "ok" : "warn"
            }
          />
          <Stat label="Salario solic." value={pf.salary || "—"} />
          <Stat label="Promedio · GPA" value={pf.gpa || pf.avg || "preg en vivo"} />
          <Stat label="Stage actual" value={c.stage} />
        </section>

        {/* Strengths + Red Flags */}
        <section className="grid grid-cols-2 gap-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-800 mb-2">
              ✅ Strengths · qué celebrar
            </div>
            <ul className="text-xs space-y-1.5 list-disc pl-4">
              {data.strengths.length > 0
                ? data.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)
                : <li className="italic text-gray-500">Sin strengths automáticos · explorar en vivo</li>}
            </ul>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-wide font-bold text-red-800 mb-2">
              ⚠️ Red flags · qué probar
            </div>
            <ul className="text-xs space-y-1.5 list-disc pl-4">
              {data.red_flags.length > 0
                ? data.red_flags.map((s: string, i: number) => <li key={i}>{s}</li>)
                : <li className="italic text-gray-500">Sin flags automáticos · probar en vivo</li>}
            </ul>
          </div>
        </section>

        {/* Profile snapshot */}
        <section>
          <SectionTitle>Perfil del candidato</SectionTitle>
          <table className="w-full text-xs border-collapse">
            <tbody>
              <Row k="Email" v={c.email} />
              <Row k="Teléfono" v={c.phone} />
              <Row k="LinkedIn" v={c.linkedin_url || "—"} />
              <Row k="Educación" v={pf.edu_type || "—"} />
              <Row k="Años logística" v={pf.years_logistics ?? "—"} />
              <Row k="Años ventas" v={pf.years_sales ?? "—"} />
              <Row k="Liderazgo" v={pf.leadership ? `Sí · ${pf.team_size || 0} personas` : "No"} />
              <Row k="Pricing exp" v={pf.pricing_exp ? "Sí" : "No"} />
              <Row k="Clientes intl" v={pf.intl_clients ? "Sí" : "No"} />
              <Row k="CRMs" v={pf.crms?.join(", ") || "—"} />
              <Row k="Excel (1-5)" v={pf.excel_level ? `${pf.excel_level}/5` : "—"} />
              <Row k="Reubicación" v={pf.relocate || "—"} />
              <Row k="Cert/contexto inglés" v={pf.english_cert || "—"} />
            </tbody>
          </table>
        </section>

        {/* Sus respuestas a probar */}
        {(pf.why_ts || pf.next_role || pf.extra) && (
          <section>
            <SectionTitle>Sus respuestas (verbatim) · a profundizar</SectionTitle>
            <div className="space-y-2 text-xs">
              {pf.why_ts && (
                <div className="bg-blue-50 border-l-4 border-blue-300 p-3">
                  <div className="font-bold text-[10px] uppercase tracking-wide text-blue-800 mb-1">Why TS</div>
                  <div className="italic text-gray-800">"{pf.why_ts}"</div>
                </div>
              )}
              {pf.next_role && (
                <div className="bg-gray-50 border-l-4 border-gray-300 p-3">
                  <div className="font-bold text-[10px] uppercase tracking-wide text-gray-700 mb-1">Next role</div>
                  <div className="italic text-gray-800">"{pf.next_role}"</div>
                </div>
              )}
              {pf.extra && (
                <div className="bg-amber-50 border-l-4 border-amber-300 p-3">
                  <div className="font-bold text-[10px] uppercase tracking-wide text-amber-800 mb-1">Self-pitch / extra</div>
                  <div className="italic text-gray-800">"{pf.extra}"</div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Tailored questions · solo modo recruiter */}
        {!isCWOMode && (
        <section className="page-break">
          <SectionTitle>Preguntas tailored para {firstName}</SectionTitle>
          <p className="text-xs text-gray-600 mb-3 italic">
            Empezar con estas. Si responde superficial, presionar con "dame un ejemplo concreto · cuándo, cuánto, qué hiciste".
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-black text-white">
                <th className="border border-gray-300 px-2 py-1.5 text-left w-1/4">Tema</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left w-1/2">Pregunta</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left w-1/4">Por qué importa</th>
              </tr>
            </thead>
            <tbody>
              {data.tailored_questions.map((q: any, i: number) => (
                <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                  <td className="border border-gray-300 px-2 py-2 align-top font-bold">{q.topic}</td>
                  <td className="border border-gray-300 px-2 py-2 align-top italic">{q.q}</td>
                  <td className="border border-gray-300 px-2 py-2 align-top text-gray-600">{q.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        )}

        {/* English Fluency Test · solo modo recruiter */}
        {!isCWOMode && (
        <section>
          <SectionTitle>English Fluency Test · 3 minutos</SectionTitle>
          <p className="text-xs text-gray-600 mb-2">
            Switch limpio: <em>"Now let's switch to English for a few minutes — I want to hear how you handle our international context. Take your time."</em>
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-black text-white">
                <th className="border border-gray-300 px-2 py-1.5 text-left w-[15%]">Tiempo</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left w-[55%]">Lo que dices · IN ENGLISH</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left w-[20%]">Qué evaluar</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left w-[10%]">Score</th>
              </tr>
            </thead>
            <tbody>
              {ENGLISH_SCENARIOS.map((s, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-blue-50" : ""}>
                  <td className="border border-gray-300 px-2 py-2 align-top font-bold">{s.minute}</td>
                  <td className="border border-gray-300 px-2 py-2 align-top italic">{s.prompt}</td>
                  <td className="border border-gray-300 px-2 py-2 align-top text-xs text-gray-600">{s.look}</td>
                  <td className="border border-gray-300 px-2 py-2 align-top h-10"></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] mt-2 text-gray-600">
            <strong>Rúbrica express:</strong> ✅ B2+ vocabulario técnico, errores menores · ◐ B1 comunica básico falta técnico · ❌ A2 no sostiene business
          </div>
        </section>
        )}

        {/* 16 Mandatos · llenos en modo CWO con datos del assessment, vacíos en modo recruiter */}
        <section className="page-break">
          <SectionTitle>{isCWOMode ? "16 Mandatos · evaluación del recruiter" : "Rúbrica · 16 Mandatos del CEO"}</SectionTitle>
          <p className="text-xs text-gray-600 mb-3 italic">
            {isCWOMode
              ? "Scores y evidencia de la entrevista con recruiter. Los marcados ◐ partial o ? not_probed son los que conviene profundizar."
              : "Marca durante o justo después de la entrevista. Si no se probó, marca \"?\" y agenda follow-up."}
          </p>
          <MandatesTable assessment={isCWOMode ? assessment : null} />
        </section>

        {/* Decisión final · solo modo recruiter */}
        {!isCWOMode && (
        <section>
          <SectionTitle>Decisión final</SectionTitle>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="border-2 border-emerald-500 bg-emerald-50 px-3 py-3 rounded text-center font-bold text-emerald-800">
              ☐ STRONG YES · avanzar a CWO
            </div>
            <div className="border-2 border-amber-500 bg-amber-50 px-3 py-3 rounded text-center font-bold text-amber-800">
              ☐ MAYBE · más data
            </div>
            <div className="border-2 border-red-500 bg-red-50 px-3 py-3 rounded text-center font-bold text-red-800">
              ☐ NO · descartar
            </div>
          </div>
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wide font-bold text-gray-700 mb-1">Razón principal</div>
            <div className="border border-gray-300 rounded p-2 min-h-[80px] text-xs"></div>
          </div>
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wide font-bold text-gray-700 mb-1">Si avanza · qué probar en CWO</div>
            <div className="border border-gray-300 rounded p-2 min-h-[60px] text-xs"></div>
          </div>
        </section>
        )}

        {/* Eval previa si existe · solo en modo recruiter (en CWO mode ya está arriba) */}
        {!isCWOMode && data.previous_assessment && (
          <section className="page-break">
            <SectionTitle>⚠️ Evaluación previa · ya entrevistada antes</SectionTitle>
            <div className="bg-amber-50 border border-amber-300 rounded p-3 text-xs">
              <div><strong>Fecha:</strong> {new Date(data.previous_assessment.interview_date).toLocaleDateString("es-CO")}</div>
              <div><strong>Verdict previo:</strong> {data.previous_assessment.verdict}</div>
              <div><strong>Resumen:</strong> {data.previous_assessment.verdict_summary}</div>
            </div>
          </section>
        )}

        {/* Resultados Elevare / AI interview si existen */}
        {data.results && data.results.length > 0 && (
          <section>
            <SectionTitle>Resultado prueba virtual</SectionTitle>
            <div className="bg-gray-50 border border-gray-300 rounded p-3 text-xs">
              {data.results.map((r: any, i: number) => (
                <div key={i} className="mb-2">
                  {r.match_percentage != null && <div><strong>Match %:</strong> {r.match_percentage}%</div>}
                  {r.recommendation && <div><strong>Recomendación:</strong> {r.recommendation}</div>}
                  {r.ai_score && <div><strong>AI Score:</strong> {r.ai_score}/100</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="border-t border-gray-300 pt-4 mt-8 text-[10px] text-gray-500 text-center">
          Trading Solutions · Recruiter Interview Prep · Generado {new Date().toLocaleString("es-CO")}
        </footer>
      </div>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-extrabold border-b border-gray-300 pb-1 mb-3">{children}</h2>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <tr>
      <td className="border border-gray-200 px-2 py-1 bg-gray-50 font-semibold w-1/3">{k}</td>
      <td className="border border-gray-200 px-2 py-1">{v == null || v === "" ? "—" : String(v)}</td>
    </tr>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: "good" | "ok" | "warn" }) {
  const bg = highlight === "good" ? "bg-emerald-50 border-emerald-200" :
             highlight === "warn" ? "bg-red-50 border-red-200" :
             highlight === "ok" ? "bg-amber-50 border-amber-200" :
             "bg-gray-50 border-gray-200";
  return (
    <div className={`${bg} border rounded-lg px-3 py-2`}>
      <div className="text-[9px] uppercase font-bold tracking-wider text-gray-600">{label}</div>
      <div className="text-sm font-bold text-gray-900 mt-0.5 truncate">{value}</div>
    </div>
  );
}

/* ──────── CWO Handoff · sección con verdict + razones + probes ──────── */
function CWOHandoffSection({ assessment, candidate }: { assessment: any; candidate: any }) {
  const candidateName = candidate?.name || "";
  const pf = candidate?.prefilter_data || {};
  const meta = candidate?.metadata || {};
  // Cédula puede vivir en metadata o en prefilter_data
  const cedula =
    meta.cedula || meta.identification || meta.document_number ||
    pf.cedula || pf.identification || pf.document_number || "";
  const linkedinUrl = candidate?.linkedin_url || pf.linkedin_url || pf.linkedin || "";
  const cvUrl = candidate?.cv_url || (candidate?.cv_filename ? `/api/cv/${candidate.id}` : "");
  const phone = candidate?.phone || "";
  const email = candidate?.email || "";
  const currentRole = candidate?.current_job_role || pf.current_job_role || pf.current_role || "";
  const city = pf.city || pf.ciudad || "";
  const verdict = assessment.verdict as "strong_yes" | "maybe" | "no" | null;
  const verdictStyles: Record<string, { bg: string; fg: string; border: string; label: string }> = {
    strong_yes: { bg: "bg-emerald-50", fg: "text-emerald-800", border: "border-emerald-500", label: "✅ STRONG YES · avanzar a CWO" },
    maybe: { bg: "bg-amber-50", fg: "text-amber-800", border: "border-amber-500", label: "◐ MAYBE · necesita más data" },
    no: { bg: "bg-red-50", fg: "text-red-800", border: "border-red-500", label: "❌ NO · descartar" },
  };
  const vs = verdict ? verdictStyles[verdict] : null;

  // Generar suggested probes para el CWO basado en partial / not_probed
  const scores = (assessment.mandate_scores || {}) as Record<string, MandateScore>;
  const probesForCWO = CEO_MANDATES.filter(m => {
    const s = scores[String(m.num)] || "not_probed";
    return s === "partial" || s === "not_probed";
  }).map(m => ({
    num: m.num,
    label: m.label,
    score: scores[String(m.num)] || "not_probed",
    probe: m.probe,
    evidence: assessment.mandate_evidence?.[String(m.num)] || "",
  }));

  // ── Story narrativa auto-generada ──
  const firstName = (candidateName || "").split(" ")[0];
  const passCount = Object.values(scores).filter(s => s === "pass").length;
  const partialCount = Object.values(scores).filter(s => s === "partial").length;
  const failCount = Object.values(scores).filter(s => s === "fail").length;
  const passReasonsText = (assessment.pass_reasons || []).slice(0, 3).join(" · ");
  const failReasonsText = (assessment.fail_reasons || []).slice(0, 2).join(" · ");

  const storyOpener =
    verdict === "strong_yes"
      ? `Después de la entrevista con ${firstName}, mi recomendación es avanzar con confianza. Cumplió ${passCount} de los 16 mandatos del CEO con evidencia clara${failCount === 0 ? " y no identifiqué ningún bloqueador estructural" : ""}. La trayectoria que comparte y la forma en que articula sus ejemplos validan el nivel de madurez y autonomía que el rol requiere.`
      : verdict === "maybe"
      ? `El perfil de ${firstName} presenta fortalezas relevantes pero también áreas que requieren validación adicional. Cumplió ${passCount} mandatos con claridad y ${partialCount} quedaron parcialmente probados durante mi entrevista. Sugiero que la conversación con CWO se enfoque en confirmar si esos elementos son riesgo real o falta de evidencia recogida.`
      : `Mi recomendación después de la entrevista es no avanzar con ${firstName}. ${failCount > 0 ? `Identifiqué ${failCount} bloqueadores estructurales que se manifestaron de forma explícita en sus respuestas` : "El perfil no alcanza los mandatos críticos del rol"} y considero que el riesgo de seguir invirtiendo etapas excede el upside potencial. Adjunto el contexto completo por si necesitas referenciarlo.`;

  const storyHighlight = passReasonsText
    ? `Las fortalezas más relevantes que observé: ${passReasonsText}.`
    : "";

  const storyConcerns = failReasonsText
    ? `Las áreas que sí me generan reserva: ${failReasonsText}.`
    : "";

  const storyClosing = probesForCWO.length > 0
    ? `Quedan ${probesForCWO.length} mandato${probesForCWO.length !== 1 ? "s" : ""} sin probar a profundidad. Más abajo encontrarás preguntas sugeridas para cada uno; la intención es optimizar tu tiempo en la entrevista enfocándolo en lo que aún requiere validación, sin redundar sobre lo ya cubierto.`
    : verdict === "strong_yes"
    ? "Los 16 mandatos quedaron probados o validados durante mi entrevista. Tu conversación puede enfocarse en fit cultural y proyección estratégica con la compañía, sin necesidad de revalidar fundamentos."
    : "";

  return (
    <>
      {/* Datos del Candidato · primer bloque · clave para que el CWO tenga todo en un vistazo */}
      <section className="bg-white border-2 border-black rounded-lg p-5">
        <div className="text-[10px] uppercase tracking-[2.5px] font-bold text-gray-500 mb-3">
          Datos del Candidato
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-gray-500 font-semibold text-[11px] uppercase tracking-wide">Nombre completo:</span>{" "}
            <strong className="text-gray-900">{candidateName || "—"}</strong>
          </div>
          <div>
            <span className="text-gray-500 font-semibold text-[11px] uppercase tracking-wide">Cédula:</span>{" "}
            <span className="text-gray-900">{cedula || <em className="text-gray-400">pendiente</em>}</span>
          </div>
          <div>
            <span className="text-gray-500 font-semibold text-[11px] uppercase tracking-wide">Email:</span>{" "}
            {email ? <a href={`mailto:${email}`} className="text-blue-700 hover:underline">{email}</a> : "—"}
          </div>
          <div>
            <span className="text-gray-500 font-semibold text-[11px] uppercase tracking-wide">Teléfono:</span>{" "}
            <span className="text-gray-900">{phone || "—"}</span>
          </div>
          {currentRole && (
            <div className="col-span-2">
              <span className="text-gray-500 font-semibold text-[11px] uppercase tracking-wide">Cargo actual:</span>{" "}
              <span className="text-gray-900 italic">{currentRole}</span>
            </div>
          )}
          {city && (
            <div className="col-span-2">
              <span className="text-gray-500 font-semibold text-[11px] uppercase tracking-wide">Ciudad:</span>{" "}
              <span className="text-gray-900">{city}</span>
            </div>
          )}
          <div className="col-span-2 mt-2 pt-2 border-t border-gray-200 flex gap-3 flex-wrap">
            {linkedinUrl && (
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-[#0a66c2] text-white rounded hover:bg-[#084d92] transition-colors"
              >
                🔗 LinkedIn ↗
              </a>
            )}
            {cvUrl && (
              <a
                href={cvUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-black text-white rounded hover:bg-gray-800 transition-colors"
              >
                📄 Ver CV ↗
              </a>
            )}
            {!linkedinUrl && !cvUrl && (
              <span className="text-xs text-gray-400 italic">
                Sin LinkedIn ni CV cargados · pedirlos al candidato si los necesitas
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Story narrativa · arriba de todo · voz primera persona del recruiter */}
      <section className="bg-gray-50 border-l-4 border-black p-5 rounded-r-lg">
        <div className="text-[10px] uppercase tracking-[2.5px] font-bold text-gray-500 mb-2">
          Resumen ejecutivo · Kelly Castañeda · Talent Acquisition Lead
        </div>
        <p className="text-sm text-gray-900 leading-relaxed mb-3">
          {storyOpener}
        </p>
        {storyHighlight && (
          <p className="text-sm text-gray-800 leading-relaxed mb-3">
            <strong className="text-emerald-800">{storyHighlight.split(": ")[0]}:</strong>{" "}
            {storyHighlight.split(": ").slice(1).join(": ")}
          </p>
        )}
        {storyConcerns && (
          <p className="text-sm text-gray-800 leading-relaxed mb-3">
            <strong className="text-red-800">{storyConcerns.split(": ")[0]}:</strong>{" "}
            {storyConcerns.split(": ").slice(1).join(": ")}
          </p>
        )}
        {storyClosing && (
          <p className="text-sm text-gray-700 italic leading-relaxed">
            {storyClosing}
          </p>
        )}
      </section>

      {/* Verdict box */}
      {vs && (
        <section className={`${vs.bg} border-2 ${vs.border} rounded-lg p-5 text-center`}>
          <div className={`text-2xl font-extrabold ${vs.fg}`}>{vs.label}</div>
          {assessment.verdict_summary && (
            <div className={`text-sm mt-2 italic ${vs.fg}`}>{assessment.verdict_summary}</div>
          )}
        </section>
      )}

      {/* Pasa por · bloqueadores · próximas pruebas */}
      <section className="grid grid-cols-2 gap-4">
        {(assessment.pass_reasons?.length || 0) > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-800 mb-2">
              ✅ Fortalezas observadas
            </div>
            <ul className="text-xs space-y-1.5 list-disc pl-4">
              {assessment.pass_reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
        {(assessment.fail_reasons?.length || 0) > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-wide font-bold text-red-800 mb-2">
              ⚠️ Áreas a validar / reservas
            </div>
            <ul className="text-xs space-y-1.5 list-disc pl-4">
              {assessment.fail_reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
      </section>

      {/* Inglés assessment summary */}
      {assessment.english_real && (
        <section className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs">
          <div className="text-[10px] uppercase tracking-wide font-bold text-blue-800 mb-1">English assessment · recruiter</div>
          <div className="text-gray-800">
            <strong>Declarado:</strong> {assessment.english_declared || "—"} ·{" "}
            <strong>Real:</strong> {assessment.english_real} ·{" "}
            <strong>Verdict:</strong> {assessment.english_verdict || "—"}
          </div>
          {assessment.english_evidence && <div className="mt-1 italic text-gray-700">{assessment.english_evidence}</div>}
        </section>
      )}

      {/* Suggested probes para CWO */}
      {probesForCWO.length > 0 && (
        <section className="bg-amber-50 border-2 border-amber-300 rounded-lg p-5">
          <div className="text-[11px] uppercase tracking-wide font-bold text-amber-800 mb-2">
            Áreas sugeridas para profundizar en CWO
          </div>
          <p className="text-xs text-gray-700 mb-3">
            Los siguientes {probesForCWO.length} mandatos quedaron <strong>parcialmente validados</strong> o <strong>sin probar</strong> durante la entrevista con recruiter. Recomiendo profundizar en cada uno con las preguntas sugeridas.
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-amber-200/50 text-amber-900">
                <th className="border border-amber-300 px-2 py-1.5 text-center w-[6%]">#</th>
                <th className="border border-amber-300 px-2 py-1.5 text-left w-[18%]">Mandato</th>
                <th className="border border-amber-300 px-2 py-1.5 text-center w-[10%]">Score actual</th>
                <th className="border border-amber-300 px-2 py-1.5 text-left w-[36%]">Pregunta sugerida</th>
                <th className="border border-amber-300 px-2 py-1.5 text-left w-[30%]">Lo que ya se sabe</th>
              </tr>
            </thead>
            <tbody>
              {probesForCWO.map((p, i) => (
                <tr key={p.num} className={i % 2 === 0 ? "bg-white" : "bg-amber-50/50"}>
                  <td className="border border-amber-200 px-2 py-1.5 text-center font-bold">{p.num}</td>
                  <td className="border border-amber-200 px-2 py-1.5 align-top font-bold">{p.label}</td>
                  <td className="border border-amber-200 px-2 py-1.5 text-center">
                    {MANDATE_SCORE_SYMBOLS[p.score]} {MANDATE_SCORE_LABELS[p.score]}
                  </td>
                  <td className="border border-amber-200 px-2 py-1.5 italic text-gray-800">{p.probe}</td>
                  <td className="border border-amber-200 px-2 py-1.5 text-gray-600 text-[11px]">{p.evidence || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

/* ──────── Tabla 16 mandatos · vacía para recruiter, llena para CWO ──────── */
function MandatesTable({ assessment }: { assessment: any | null }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-black text-white">
          <th className="border border-gray-300 px-1.5 py-1.5 text-center w-[5%]">#</th>
          <th className="border border-gray-300 px-2 py-1.5 text-left w-[18%]">Mandato</th>
          <th className="border border-gray-300 px-2 py-1.5 text-left w-[35%]">{assessment ? "Pregunta sugerida" : "Pregunta sugerida"}</th>
          <th className="border border-gray-300 px-2 py-1.5 text-center w-[10%]">Score</th>
          <th className="border border-gray-300 px-2 py-1.5 text-left w-[32%]">Evidencia</th>
        </tr>
      </thead>
      <tbody>
        {CEO_MANDATES.map((m, i) => {
          const score = (assessment?.mandate_scores?.[String(m.num)] || "not_probed") as MandateScore;
          const evidence = assessment?.mandate_evidence?.[String(m.num)] || "";
          const quote = assessment?.mandate_quotes?.[String(m.num)] || "";
          const colors = MANDATE_SCORE_COLORS[score];
          return (
            <tr key={m.num} className={i % 2 === 0 ? "bg-gray-50" : ""}>
              <td className="border border-gray-300 px-1.5 py-1.5 text-center font-bold">{m.num}</td>
              <td className="border border-gray-300 px-2 py-1.5 align-top">
                <div className="font-bold">{m.label}</div>
                <div className="text-[10px] text-gray-600 italic">{m.description}</div>
              </td>
              <td className="border border-gray-300 px-2 py-1.5 align-top italic text-gray-800">{m.probe}</td>
              <td
                className="border border-gray-300 px-2 py-1.5 text-center font-bold"
                style={assessment ? { backgroundColor: colors.bg, color: colors.fg } : {}}
              >
                {assessment ? `${MANDATE_SCORE_SYMBOLS[score]} ${MANDATE_SCORE_LABELS[score]}` : ""}
              </td>
              <td className="border border-gray-300 px-2 py-1.5 align-top">
                {assessment ? (
                  <>
                    <div className="text-[11px]">{evidence || "—"}</div>
                    {quote && <div className="text-[10px] italic text-gray-500 mt-1">"{quote}"</div>}
                  </>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
