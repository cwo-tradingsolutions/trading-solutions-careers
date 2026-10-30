"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, ArrowRight, HelpCircle, AlertTriangle } from "lucide-react";
import { stageLabel } from "@/lib/stage-labels";
import { REJECTION_CATEGORIES } from "@/lib/rejection-rules";
import { invalidLinkBoth, loadRetryBoth } from "@/lib/candidate-invalid-link";
import { CANDIDATE_MAIL } from "@/lib/candidate-public-error";

const TS_HERO = "https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/691645b652c1e9091b25f59c_FotosWeb_TradingSolutions-14_4_11zon.webp";
const TS_LOGO = "https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/6913594489519813fe9e620e_logo%20web-03.png";

type DecisionState = {
  decision_id: string;
  already_responded: boolean;
  decision: string | null;
  interview_type: string;
  recipient_role: string;
  recipient_name: string;
  candidate: { name: string; current_role: string | null; current_company: string | null; headline: string | null; stage: string } | null;
  vacancy: { id: string; title: string; area: string } | null;
  ai_insights: { summary: string; score: number | null; recommendation: string } | null;
  open_vacancies: { id: string; title: string; area: string }[];
};

export default function DecisionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params?.token as string;
  const presetDecision = searchParams?.get('d');

  const [state, setState] = useState<DecisionState | null>(null);
  const [phase, setPhase] = useState<'loading' | 'choose' | 'confirm' | 'submitting' | 'done' | 'saved' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [decision, setDecision] = useState<string | null>(presetDecision);
  const [targetStage, setTargetStage] = useState<string>('');
  const [recommendedVacancyId, setRecommendedVacancyId] = useState<string>('');
  const [moveNow, setMoveNow] = useState(true);
  const [reasoning, setReasoning] = useState('');
  const [categoryKey, setCategoryKey] = useState('');

  useEffect(() => {
    fetch(`/api/decision/${token}`)
      .then(async r => {
        const j = await r.json();
        if (!r.ok) {
          setError(r.status >= 500 ? loadRetryBoth() : invalidLinkBoth());
          setPhase('error');
        } else {
          setState(j);
          if (j.already_responded) {
            setPhase('done');
            setDecision(j.decision);
          } else {
            setPhase('choose');
          }
        }
      })
      .catch(() => { setError(loadRetryBoth()); setPhase('error'); });
  }, [token]);

  const submit = async () => {
    setPhase('submitting');
    try {
      const r = await fetch(`/api/decision/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          target_stage: targetStage || undefined,
          recommended_vacancy_id: recommendedVacancyId || undefined,
          move_now: moveNow,
          reasoning,
          category_key: categoryKey || undefined,
        }),
      });
      if (r.status === 409) {
        setPhase('saved');
      } else if (!r.ok) {
        setError(`No pudimos registrar la decisión. Escríbenos a ${CANDIDATE_MAIL}. / We couldn't save this decision. Write to us at ${CANDIDATE_MAIL}.`);
        setPhase('choose');
      } else {
        setPhase('done');
      }
    } catch {
      setError(`No pudimos registrar la decisión. Escríbenos a ${CANDIDATE_MAIL}. We couldn't save this decision. Write to us at ${CANDIDATE_MAIL}.`);
      setPhase('choose');
    }
  };

  if (phase === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Cargando…</div>;
  }

  if (phase === 'saved') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">Ya registramos tu respuesta</h2>
          <p className="text-sm text-gray-600">We already saved your answer.</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-md text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-xl font-bold mb-2">No pudimos abrir este enlace</h2>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (phase === 'done' && state) {
    const decisionLabel: Record<string, string> = {
      avanza: '✓ Avanza',
      no_avanza: '✗ No avanza',
      recommend_other_vacancy: '→ Recomendaste otra vacante',
      needs_more_info: '? Necesitás más info',
    };
    return (
      <div className="min-h-screen flex font-sans bg-white">
        <div className="hidden md:flex md:w-2/5 relative overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${TS_HERO})` }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.35) 100%)' }} />
          <div className="relative z-10 p-10 text-white h-full flex flex-col justify-end">
            <img src={TS_LOGO} alt="Trading Solutions" className="h-9 w-auto mb-auto" />
            <h1 className="text-3xl font-bold tracking-[-0.03em] leading-[0.95]">Decisión registrada.</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <div className="text-[10px] uppercase tracking-[2px] font-semibold text-gray-500 mb-1">Tu decisión</div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">{decisionLabel[decision || ''] || decision}</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Gracias por responder. El stage del candidato se actualizó automáticamente.
              Si necesitás cambiar la decisión, escribí a jointheteam@tradingsolutions.com.
            </p>
            {state.candidate && (
              <p className="text-xs text-gray-400 mt-4">
                Candidato: <strong className="text-gray-700">{state.candidate.name}</strong>
                {state.vacancy && ` · ${state.vacancy.title}`}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!state) return null;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="max-w-2xl mx-auto p-6 sm:p-10">
        <img src={TS_LOGO} alt="Trading Solutions" className="h-8 w-auto invert mb-8" />

        <div className="text-[10px] tracking-[2.5px] uppercase font-semibold text-gray-500 mb-2">Decisión requerida</div>
        <h1 className="text-3xl font-bold tracking-[-0.02em] leading-tight mb-2">¿{state.candidate?.name} avanza?</h1>
        <p className="text-sm text-gray-600 mb-6">
          Tipo: <span className="capitalize font-semibold">{state.interview_type.replace('_', ' ')}</span> · Vacante: <strong>{state.vacancy?.title || '—'}</strong>
        </p>

        {/* Candidate context */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <div className="text-[10px] uppercase tracking-[1.5px] font-semibold text-gray-500 mb-2">Sobre {state.candidate?.name?.split(' ')[0]}</div>
          {state.candidate?.headline && <p className="text-sm text-gray-700 mb-2">{state.candidate.headline}</p>}
          {state.candidate?.current_role && (
            <p className="text-xs text-gray-600">
              <strong>Cargo actual:</strong> {state.candidate.current_role}
              {state.candidate.current_company && ` en ${state.candidate.current_company}`}
            </p>
          )}
          {state.ai_insights?.summary && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-baseline gap-2 mb-1">
                <div className="text-[10px] uppercase tracking-wider font-bold text-purple-700">Resumen IA</div>
                {state.ai_insights.score && (
                  <span className="text-[10px] font-bold text-purple-700">Score {state.ai_insights.score}/100 · {state.ai_insights.recommendation}</span>
                )}
              </div>
              <p className="text-xs text-gray-700 italic">"{state.ai_insights.summary}"</p>
            </div>
          )}
        </div>

        {/* Decision options */}
        {!decision && (
          <div className="space-y-2">
            <DecisionButton
              decision="avanza"
              onSelect={setDecision}
              color="emerald"
              icon={<CheckCircle2 className="w-5 h-5" />}
              title="Sí, avanza para esta vacante"
              desc="El candidato sigue al siguiente paso del proceso para esta posición."
            />
            <DecisionButton
              decision="recommend_other_vacancy"
              onSelect={setDecision}
              color="blue"
              icon={<ArrowRight className="w-5 h-5" />}
              title="No para esta, pero sí para otra vacante"
              desc="No encaja aquí pero sí en otra posición. Tendrás que indicar cuál."
            />
            <DecisionButton
              decision="no_avanza"
              onSelect={setDecision}
              color="red"
              icon={<XCircle className="w-5 h-5" />}
              title="No, no avanza"
              desc="El candidato no sigue. Marcará automáticamente como rechazado."
            />
            <DecisionButton
              decision="needs_more_info"
              onSelect={setDecision}
              color="gray"
              icon={<HelpCircle className="w-5 h-5" />}
              title="Necesito otra entrevista o más info"
              desc="No te alcanza la info actual para decidir. Podrás explicar qué necesitás."
            />
          </div>
        )}

        {decision && (
          <DecisionForm
            decision={decision}
            state={state}
            targetStage={targetStage}
            setTargetStage={setTargetStage}
            recommendedVacancyId={recommendedVacancyId}
            setRecommendedVacancyId={setRecommendedVacancyId}
            moveNow={moveNow}
            setMoveNow={setMoveNow}
            reasoning={reasoning}
            setReasoning={setReasoning}
            categoryKey={categoryKey}
            setCategoryKey={setCategoryKey}
            onBack={() => setDecision(null)}
            onSubmit={submit}
            submitting={phase === 'submitting'}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

function DecisionButton({
  decision, onSelect, color, icon, title, desc,
}: {
  decision: string; onSelect: (d: string) => void; color: string;
  icon: React.ReactNode; title: string; desc: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50 text-emerald-700',
    red: 'border-red-300 hover:border-red-500 hover:bg-red-50 text-red-700',
    blue: 'border-blue-300 hover:border-blue-500 hover:bg-blue-50 text-blue-700',
    gray: 'border-gray-300 hover:border-gray-500 hover:bg-gray-50 text-gray-700',
  };
  return (
    <button
      onClick={() => onSelect(decision)}
      className={`w-full text-left bg-white border-2 ${colorMap[color]} rounded-xl p-4 transition-colors flex items-start gap-3`}
    >
      <span className="flex-shrink-0 mt-0.5">{icon}</span>
      <span className="flex-1">
        <div className="font-bold text-base text-gray-900">{title}</div>
        <div className="text-xs text-gray-600 mt-0.5">{desc}</div>
      </span>
    </button>
  );
}

function DecisionForm({
  decision, state, targetStage, setTargetStage, recommendedVacancyId, setRecommendedVacancyId,
  moveNow, setMoveNow, reasoning, setReasoning, categoryKey, setCategoryKey, onBack, onSubmit, submitting, error,
}: any) {
  const ds: any = state;
  return (
    <div className="bg-white border-2 border-black rounded-xl p-5">
      <button onClick={onBack} className="text-xs font-semibold text-gray-500 hover:text-black mb-3">← Cambiar decisión</button>

      {decision === 'avanza' && (
        <>
          <h3 className="text-lg font-bold mb-1">¿A qué stage avanza?</h3>
          <p className="text-xs text-gray-600 mb-3">Stage actual: <code className="bg-gray-100 px-1 rounded">{stageLabel(ds.candidate?.stage)}</code></p>
          <select value={targetStage} onChange={e => setTargetStage(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-4">
            <option value="">— Elegir siguiente stage —</option>
            <option value="prueba_tecnica">Prueba técnica / Assessment</option>
            <option value="terna">Terna para Hiring Lead</option>
            <option value="oferta">Hacer oferta</option>
            <option value="contratado">Contratar</option>
          </select>
          <Reasoning reasoning={reasoning} setReasoning={setReasoning} placeholder="(Opcional) Comentario o nota para el equipo de talent…" />
        </>
      )}

      {decision === 'recommend_other_vacancy' && (
        <>
          <h3 className="text-lg font-bold mb-1">¿Para qué otra vacante?</h3>
          <p className="text-xs text-gray-600 mb-3">Elegí la vacante donde lo ves mejor encajando.</p>
          <select value={recommendedVacancyId} onChange={e => setRecommendedVacancyId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-3">
            <option value="">— Elegir otra vacante —</option>
            {ds.open_vacancies.filter((v: any) => v.id !== ds.vacancy?.id).map((v: any) => (
              <option key={v.id} value={v.id}>{v.title} · {v.area || '—'}</option>
            ))}
          </select>
          <label className="flex items-start gap-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={moveNow} onChange={e => setMoveNow(e.target.checked)} className="mt-1" />
            <span className="text-sm">
              <strong>Moverlo ahora</strong> a esa otra vacante (stage "Aplicó"). Si lo dejás sin marcar, sólo registramos tu recomendación pero el candidato sigue en la vacante actual.
            </span>
          </label>
          <Reasoning reasoning={reasoning} setReasoning={setReasoning} placeholder="¿Por qué encaja mejor allá? (opcional pero útil)" />
        </>
      )}

      {decision === 'no_avanza' && (
        <>
          <h3 className="text-lg font-bold mb-1">¿Por qué no avanza?</h3>
          <p className="text-xs text-gray-600 mb-3">Hay que elegir una categoría. La nota es opcional. Sin categoría no se marca rechazado.</p>
          <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-700 mb-1.5">Categoría *</label>
          <select value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-3 bg-white">
            <option value="">Elegí la categoría</option>
            {REJECTION_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <Reasoning reasoning={reasoning} setReasoning={setReasoning} placeholder="Nota opcional para el equipo." />
        </>
      )}

      {decision === 'needs_more_info' && (
        <>
          <h3 className="text-lg font-bold mb-1">¿Qué información necesitás?</h3>
          <p className="text-xs text-gray-600 mb-3">Sé específico para que talent acquisition coordine la siguiente entrevista o pida lo que falta.</p>
          <Reasoning reasoning={reasoning} setReasoning={setReasoning} placeholder="Ej: 'necesito una entrevista técnica con la lead de pricing', 'no entendí su experiencia en aduanas, pedirle que profundice por escrito', etc." required />
        </>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-800 mb-3">{error}</div>}

      <button
        onClick={onSubmit}
        disabled={submitting || (decision === 'no_avanza' && !categoryKey) || (decision === 'needs_more_info' && !reasoning.trim()) || (decision === 'recommend_other_vacancy' && !recommendedVacancyId) || (decision === 'avanza' && !targetStage)}
        className="w-full bg-black hover:bg-gray-800 disabled:bg-gray-300 text-white text-sm font-bold py-3 rounded-full inline-flex items-center justify-center gap-2"
      >
        {submitting ? 'Registrando…' : 'Registrar decisión'}
        {!submitting && <ArrowRight className="w-4 h-4" />}
      </button>
    </div>
  );
}

function Reasoning({ reasoning, setReasoning, placeholder, required }: { reasoning: string; setReasoning: (v: string) => void; placeholder: string; required?: boolean }) {
  return (
    <div className="mb-3">
      <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-700 mb-1.5">
        {required ? 'Razón (requerida)' : 'Comentario (opcional)'}
      </label>
      <textarea
        value={reasoning}
        onChange={e => setReasoning(e.target.value)}
        placeholder={placeholder}
        rows={4}
        maxLength={2000}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black resize-none"
      />
    </div>
  );
}
