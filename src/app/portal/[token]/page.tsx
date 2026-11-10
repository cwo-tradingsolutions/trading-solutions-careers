'use client';

/**
 * Portal del candidato — vista pública.
 * URL: /portal/<application_id>.<signature>
 *
 * El candidato llega aquí desde el email de confirmación. Ve su status,
 * el flujo del proceso, próximo paso esperado, y la fecha aproximada
 * de respuesta (SLA promise).
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

type PortalData = {
  candidate: { name: string; email: string };
  vacancy: { title: string; location: string | null };
  application: { id: number; status: string; rejected: boolean; applied_at: string; last_update: string };
  stages: Array<{ key: string; label: string; icon: string; state: 'done' | 'current' | 'pending' | 'skipped' }>;
  descriptor: string;
  assessment: { status: string; sent_at: string | null; completed_at: string | null } | null;
  sla_promise_days: number;
  lang?: 'es' | 'en';
};

// Los textos del portal en los dos idiomas · China corre en inglés.
const T = {
  es: {
    loading: 'Cargando tu estado…',
    invalidTitle: 'Link no válido',
    invalidBody: 'Este enlace no es válido o ha expirado. Si crees que es un error, escríbenos a',
    seeJobs: 'Ver vacantes abiertas',
    applyingTo: 'Estás aplicando a',
    currentStatus: 'Estado actual',
    appliedOn: (d: string) => `📅 Aplicaste el ${d}`,
    slaLine: (n: number) => `⏱ Respuesta esperada en máximo ${n} días hábiles`,
    yourProcess: 'Tu proceso',
    current: 'Actual',
    commitments: 'Nuestros compromisos contigo',
    c1: (n: number) => `• Te respondemos en máximo ${n} días hábiles, avances o no`,
    c3: '• Tu información se mantiene confidencial',
    c4pre: '• Si tienes preguntas, escribe a ',
    footer: 'Trading Solutions · Boutique Freight Forwarder · Operación en +10 países',
    locale: 'es-CO',
  },
  en: {
    loading: 'Loading your status…',
    invalidTitle: 'Invalid link',
    invalidBody: "This link is not valid or has expired. If you think this is a mistake, write to us at",
    seeJobs: 'See open positions',
    applyingTo: 'You are applying for',
    currentStatus: 'Current status',
    appliedOn: (d: string) => `📅 You applied on ${d}`,
    slaLine: (n: number) => `⏱ We get back to you within ${n} business days`,
    yourProcess: 'Your process',
    current: 'Current',
    commitments: 'What we commit to',
    c1: (n: number) => `• We get back to you within ${n} business days, either way`,
    c3: '• Your information stays confidential',
    c4pre: '• If you have any questions, write to ',
    footer: 'Trading Solutions · Boutique Freight Forwarder · Operations in 10+ countries',
    locale: 'en-US',
  },
} as const;

export default function PortalPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/portal/${params.token}`);
        const j = await r.json();
        if (!r.ok) {
          setError(j.error ?? 'unknown');
        } else {
          setData(j);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'fetch_error');
      } finally {
        setLoading(false);
      }
    })();
  }, [params.token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">{T.es.loading} / {T.en.loading}</p>
        </div>
      </div>
    );
  }

  const t = T[data?.lang === 'en' ? 'en' : 'es'];

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold mb-2">{t.invalidTitle}</h1>
          <p className="text-sm text-gray-600 mb-6">
            {t.invalidBody}{' '}
            <a href="mailto:jointheteam@tradingsolutions.com" className="text-blue-600 underline">jointheteam@tradingsolutions.com</a>.
          </p>
          <Link href="/" className="inline-block px-6 py-2 rounded-full border border-gray-300 text-sm hover:bg-gray-50">
            {t.seeJobs}
          </Link>
        </div>
      </div>
    );
  }

  const appliedDate = new Date(data.application.applied_at).toLocaleDateString(t.locale, {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-black text-white">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Trading Solutions Careers</div>
          <h1 className="text-2xl font-bold">{data.lang === 'en' ? 'Hi' : 'Hola'} {data.candidate.name.split(' ')[0]}</h1>
          <p className="text-gray-300 text-sm mt-1">
            {t.applyingTo} <strong>{data.vacancy.title}</strong>
            {data.vacancy.location ? <> · {data.vacancy.location}</> : null}
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Estado actual */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-5">
          <div className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-1">{t.currentStatus}</div>
          <p className="text-base text-gray-900 leading-relaxed">{data.descriptor}</p>
          {!data.application.rejected && (
            <div className="mt-4 text-xs text-gray-500 flex items-center gap-4 flex-wrap">
              <span>{t.appliedOn(appliedDate)}</span>
              <span>{t.slaLine(data.sla_promise_days)}</span>
            </div>
          )}
        </div>

        {/* Timeline de etapas */}
        {!data.application.rejected && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-5">
            <div className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-4">{t.yourProcess}</div>
            <div className="space-y-3">
              {data.stages.map((stage) => {
                const dotBg = stage.state === 'done' ? 'bg-emerald-500' : stage.state === 'current' ? 'bg-blue-500' : 'bg-gray-200';
                const dotIcon = stage.state === 'done' ? '✓' : stage.state === 'current' ? '●' : '';
                const textColor = stage.state === 'pending' ? 'text-gray-400' : stage.state === 'skipped' ? 'text-gray-300 line-through' : 'text-gray-900';
                const labelWeight = stage.state === 'current' ? 'font-semibold' : 'font-normal';
                return (
                  <div key={stage.key} className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full ${dotBg} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                      {dotIcon || stage.icon}
                    </div>
                    <div className={`text-sm ${textColor} ${labelWeight}`}>{stage.label}</div>
                    {stage.state === 'current' && (
                      <span className="text-[10px] uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full ml-auto">
                        {t.current}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Compromisos */}
        {!data.application.rejected && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-5">
            <div className="text-xs uppercase tracking-widest text-blue-700 font-semibold mb-2">{t.commitments}</div>
            <ul className="text-sm text-blue-900 space-y-1.5">
              <li>{t.c1(data.sla_promise_days)}</li>
              <li>{t.c3}</li>
              <li>{t.c4pre}<a href="mailto:jointheteam@tradingsolutions.com" className="underline">jointheteam@tradingsolutions.com</a></li>
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 mt-8">
          {t.footer}
        </div>
      </div>
    </div>
  );
}
