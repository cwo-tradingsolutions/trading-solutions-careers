"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type SurveyState = {
  survey_id: string;
  outcome: 'rejected' | 'hired' | 'withdrew' | 'other';
  already_submitted: boolean;
  candidate_first_name: string | null;
  vacancy_title: string | null;
};

export default function EncuestaPage() {
  const params = useParams();
  const token = params?.token as string;

  const [state, setState] = useState<SurveyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [processClarity, setProcessClarity] = useState<number | null>(null);
  const [commQuality, setCommQuality] = useState<number | null>(null);
  const [assessmentExp, setAssessmentExp] = useState<number | null>(null);
  const [recruiterHelp, setRecruiterHelp] = useState<number | null>(null);
  const [interviewQ, setInterviewQ] = useState<number | null>(null);
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [comments, setComments] = useState("");
  const [suggestions, setSuggestions] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/candidate-experience/${token}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (r.status === 404) setError("missing");
          else if (r.status === 410) setError("expired");
          else setError("load");
        } else {
          setState(j);
          if (j.already_submitted) setSubmitted(true);
        }
        setLoading(false);
      })
      .catch(() => { setError("load"); setLoading(false); });
  }, [token]);

  const submit = async () => {
    if (npsScore == null) {
      setError("nps");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/candidate-experience/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nps_score: npsScore,
          process_clarity: processClarity,
          comm_quality: commQuality,
          assessment_experience: assessmentExp,
          recruiter_helpfulness: recruiterHelp,
          interview_quality: interviewQ,
          would_recommend_company: wouldRecommend,
          comments: comments || null,
          improvement_suggestions: suggestions || null,
        }),
      });
      await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 409) setError("already");
        else if (r.status === 410) setError("expired");
        else setError("send");
      } else {
        setSubmitted(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      setError("send");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <CenteredCard><div className="text-gray-500 text-sm">Cargando…</div></CenteredCard>;
  }

  if (error && !state) {
    return (
      <CenteredCard>
        <div className="text-center">
          <div className="text-5xl mb-3">😕</div>
          <h2 className="text-xl font-bold mb-2">No pudimos abrir tu encuesta</h2>
          {error === "missing" ? (
            <p className="text-sm text-gray-600">No encontramos esta encuesta. Escríbenos a jointheteam@tradingsolutions.com</p>
          ) : error === "expired" ? (
            <p className="text-sm text-gray-600">Esta encuesta expiró. Escríbenos a jointheteam@tradingsolutions.com</p>
          ) : (
            <SurveyLoadCopy />
          )}
        </div>
      </CenteredCard>
    );
  }

  if (submitted) {
    return (
      <CenteredCard>
        <div className="text-center py-6">
          <div className="text-5xl mb-3">🙏</div>
          <h2 className="text-2xl font-extrabold mb-2">¡Gracias por tu feedback!</h2>
          <p className="text-sm text-gray-600 max-w-sm mx-auto">
            Tu opinión nos ayuda a mejorar la experiencia de futuros candidatos. Te deseamos mucho éxito en tu camino profesional.
          </p>
          <p className="text-xs text-gray-400 mt-6">— Equipo Talent Acquisition · Trading Solutions</p>
        </div>
      </CenteredCard>
    );
  }

  if (!state) return null;

  const greeting = state.outcome === 'hired'
    ? `¡Felicitaciones${state.candidate_first_name ? ', ' + state.candidate_first_name : ''}!`
    : `Hola${state.candidate_first_name ? ', ' + state.candidate_first_name : ''}`;

  const intro = state.outcome === 'hired'
    ? 'Antes de empezar tu nuevo rol, queremos conocer cómo viviste el proceso de selección con nosotros.'
    : 'Gracias por participar en nuestro proceso. Aunque esta vez no avanzamos juntos, tu experiencia importa.';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-black text-white rounded-t-xl px-6 py-4">
          <div className="text-[10px] tracking-[2.5px] font-extrabold opacity-80">TRADING SOLUTIONS</div>
          <div className="text-xs text-white/70 mt-0.5">Encuesta de experiencia · {state.vacancy_title || 'Proceso de selección'}</div>
        </div>

        {/* Body */}
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6 sm:p-8 shadow-sm">
          <h1 className="text-2xl font-extrabold mb-2">{greeting} 👋</h1>
          <p className="text-sm text-gray-600 mb-6">{intro}</p>

          {/* NPS */}
          <Section title="¿Qué tan probable es que recomiendes Trading Solutions como lugar para postular?" required>
            <NPSScale value={npsScore} onChange={setNpsScore} />
          </Section>

          {/* Detailed ratings */}
          <Section title="Califica los siguientes aspectos del proceso (1 = muy malo · 5 = excelente)">
            <RatingRow label="Claridad de la información del proceso" value={processClarity} onChange={setProcessClarity} />
            <RatingRow label="Calidad y velocidad de la comunicación" value={commQuality} onChange={setCommQuality} />
            <RatingRow label="Experiencia con las pruebas" value={assessmentExp} onChange={setAssessmentExp} />
            <RatingRow label="Trato y disponibilidad del equipo de reclutamiento" value={recruiterHelp} onChange={setRecruiterHelp} />
            <RatingRow label="Calidad de las entrevistas" value={interviewQ} onChange={setInterviewQ} />
          </Section>

          {/* Would recommend */}
          <Section title="¿Recomendarías a un colega/amig@ aplicar a Trading Solutions?">
            <div className="flex gap-2">
              <ChoiceButton selected={wouldRecommend === true} onClick={() => setWouldRecommend(true)}>Sí</ChoiceButton>
              <ChoiceButton selected={wouldRecommend === false} onClick={() => setWouldRecommend(false)}>No</ChoiceButton>
              <ChoiceButton selected={wouldRecommend === null} onClick={() => setWouldRecommend(null)}>Prefiero no decir</ChoiceButton>
            </div>
          </Section>

          {/* Comments */}
          <Section title="Comentarios sobre tu experiencia (opcional)">
            <textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Lo que te gustó, lo que destacarías…"
              maxLength={2000}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black resize-none"
            />
          </Section>

          {/* Suggestions */}
          <Section title="¿Qué podríamos mejorar? (opcional)">
            <textarea
              value={suggestions}
              onChange={e => setSuggestions(e.target.value)}
              placeholder="Sugerencias concretas que nos ayudarían a mejorar el proceso…"
              maxLength={2000}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black resize-none"
            />
          </Section>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-800">
              {error === "nps" ? (
                "Por favor, responde el NPS antes de enviar"
              ) : error === "already" ? (
                "Esta encuesta ya fue respondida."
              ) : error === "expired" ? (
                "Esta encuesta expiró. Escríbenos a jointheteam@tradingsolutions.com"
              ) : (
                <SurveySendCopy />
              )}
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting || npsScore == null}
            className="w-full bg-black hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
          >
            {submitting ? 'Enviando…' : 'Enviar encuesta'}
          </button>

          <p className="text-[11px] text-gray-400 text-center mt-3">
            Tus respuestas son confidenciales. Solo se usan agregadas para mejorar el proceso.
          </p>
        </div>
      </div>
    </div>
  );
}

function SurveyLoadCopy() {
  return (
    <>
      <p className="text-sm text-gray-700">
        No pudimos cargar la encuesta. Escríbenos a{" "}
        <a className="underline" href="mailto:jointheteam@tradingsolutions.com">jointheteam@tradingsolutions.com</a>
      </p>
      <p className="mt-3 text-sm text-gray-600">
        We couldn&apos;t load the survey. Write to us at{" "}
        <a className="underline" href="mailto:jointheteam@tradingsolutions.com">jointheteam@tradingsolutions.com</a>
      </p>
    </>
  );
}

function SurveySendCopy() {
  return (
    <>
      <p>No pudimos enviar la encuesta. Escríbenos a jointheteam@tradingsolutions.com</p>
      <p className="mt-2">We couldn&apos;t send the survey. Write to us at jointheteam@tradingsolutions.com</p>
    </>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-md w-full shadow-sm">{children}</div>
    </div>
  );
}

function Section({ title, required, children }: { title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <label className="block text-sm font-bold text-gray-900 mb-2">
        {title} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
    </div>
  );
}

function NPSScale({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  const labels = ['Nada probable', '', '', '', '', '', '', '', '', '', 'Muy probable'];
  return (
    <div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => {
          const isSelected = value === i;
          const color = i <= 6 ? 'red' : i <= 8 ? 'amber' : 'emerald';
          const colorClasses: Record<string, string> = {
            red: isSelected ? 'bg-red-500 text-white border-red-600' : 'border-red-200 text-red-700 hover:bg-red-50',
            amber: isSelected ? 'bg-amber-500 text-white border-amber-600' : 'border-amber-200 text-amber-700 hover:bg-amber-50',
            emerald: isSelected ? 'bg-emerald-500 text-white border-emerald-600' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
          };
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i)}
              className={`aspect-square rounded-lg border-2 font-bold text-sm transition-colors ${colorClasses[color]}`}
            >
              {i}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-1.5 px-1">
        <span>{labels[0]}</span>
        <span>{labels[10]}</span>
      </div>
    </div>
  );
}

function RatingRow({ label, value, onChange }: { label: string; value: number | null; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-700 flex-1">{label}</span>
      <div className="flex gap-1 flex-shrink-0">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`w-8 h-8 rounded-full border-2 text-xs font-bold transition-colors ${
              value === n
                ? 'bg-black text-white border-black'
                : 'border-gray-300 text-gray-500 hover:border-gray-500'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-lg border-2 text-sm font-bold transition-colors ${
        selected ? 'bg-black text-white border-black' : 'border-gray-300 text-gray-700 hover:border-gray-500'
      }`}
    >
      {children}
    </button>
  );
}
