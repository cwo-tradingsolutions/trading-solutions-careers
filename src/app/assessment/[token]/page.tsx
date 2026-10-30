"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Brain,
  Clock,
  CheckCircle2,
  Globe,
  ArrowRight,
  ShieldCheck,
  FileText,
  Languages,
} from "lucide-react";
import {
  assessments,
  type AssessmentMeta,
  type AssessmentId,
} from "@/data/assessments";
import { expiredLinkBoth, invalidLinkBoth } from "@/lib/candidate-invalid-link";

type TokenData = {
  token: string;
  candidate_name: string;
  candidate_email: string;
  vacancy_id: number | null;
  vacancy_slug: string | null;
  vacancy_title_es?: string | null;
  vacancy_title_en?: string | null;
  assessment_ids: string | null;
  language: "es" | "en";
  status: string;
  expires_at: string | null;
};

export default function AssessmentLanding() {
  const params = useParams<{ token: string }>();
  const [token, setToken] = useState<TokenData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [lang, setLang] = useState<"es" | "en">("es");
  const [agreed, setAgreed] = useState(false);
  const [started, setStarted] = useState<AssessmentMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/assessments/${params.token}`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setLoadErr(j.error ?? "not_found");
        } else {
          setToken(j.data as TokenData);
          setLang((j.data?.language as "es" | "en") ?? "es");
          // Marcar como in_progress la primera vez que abre el link
          if (j.data?.status === "sent") {
            fetch(`/api/assessments/${params.token}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "in_progress" }),
            }).catch(() => {});
          }
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  const tests = useMemo(() => {
    if (!token) return [] as AssessmentMeta[];
    const ids = (token.assessment_ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as AssessmentId[];
    return assessments.filter((a) => ids.includes(a.id));
  }, [token]);

  const totalDuration = tests.reduce((acc, t) => acc + t.duration, 0);
  const totalQuestions = tests.reduce((acc, t) => acc + t.questions, 0);

  const t = (es: string, en: string) => (lang === "es" ? es : en);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando tu evaluación…</p>
        </div>
      </div>
    );
  }

  if (loadErr || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-md p-8">
          <h1 className="text-2xl font-bold mb-3">
            {loadErr === "expired" ? "Enlace vencido" : "No pudimos abrir tu evaluación"}
          </h1>
          <p className="text-gray-500">
            {loadErr === "expired" ? expiredLinkBoth() : invalidLinkBoth()}
          </p>
        </div>
      </div>
    );
  }

  if (started) {
    return <TestRunner meta={started} lang={lang} onExit={() => setStarted(null)} />;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top thin bar */}
      <div className="fixed top-0 inset-x-0 z-50 h-8 bg-black text-white flex items-center justify-between px-6">
        <span className="text-[11px] tracking-[0.2em] font-semibold">
          TRADING SOLUTIONS · CAREERS
        </span>
        <button
          onClick={() => setLang(lang === "es" ? "en" : "es")}
          className="flex items-center gap-1.5 text-[11px] font-medium text-white/80 hover:text-white"
        >
          <Globe className="w-3 h-3" />
          {lang === "es" ? "EN" : "ES"}
        </button>
      </div>

      <div className="pt-14 pb-24 max-w-3xl mx-auto px-6">
        {/* Breadcrumb / title */}
        <p className="text-xs tracking-[0.18em] font-semibold text-gray-500 uppercase mb-4">
          {t("Evaluación de selección", "Hiring assessment")}
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
          {t("Bienvenido, ", "Welcome, ")}
          {token.candidate_name.split(" ")[0]}.
        </h1>
        <p className="text-gray-600 text-lg leading-relaxed max-w-2xl mb-2">
          {t(
            "Has sido invitado a completar la evaluación para la posición ",
            "You have been invited to complete the assessment for the "
          )}
          <b>
            {lang === "es"
              ? token.vacancy_title_es ?? token.vacancy_slug ?? ""
              : token.vacancy_title_en ?? token.vacancy_slug ?? ""}
          </b>
          {t(" en Trading Solutions Barranquilla.", " role at Trading Solutions Barranquilla.")}
        </p>
        <p className="text-gray-500 text-sm">
          {t("Token: ", "Token: ")}
          <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{token.token}</code>
        </p>

        {/* Summary block */}
        <div className="mt-10 grid grid-cols-3 gap-4 border-y border-gray-200 py-6">
          <div>
            <div className="text-[11px] tracking-[0.15em] text-gray-500 font-semibold uppercase mb-1">
              {t("Pruebas", "Tests")}
            </div>
            <div className="text-2xl font-bold">{tests.length}</div>
          </div>
          <div>
            <div className="text-[11px] tracking-[0.15em] text-gray-500 font-semibold uppercase mb-1">
              {t("Duración estimada", "Estimated time")}
            </div>
            <div className="text-2xl font-bold">{totalDuration} min</div>
          </div>
          <div>
            <div className="text-[11px] tracking-[0.15em] text-gray-500 font-semibold uppercase mb-1">
              {t("Preguntas totales", "Total questions")}
            </div>
            <div className="text-2xl font-bold">{totalQuestions}</div>
          </div>
        </div>

        {/* Tests list */}
        <h2 className="mt-10 text-xl font-bold">
          {t("Las pruebas que tomarás", "The tests you will take")}
        </h2>
        <p className="text-gray-500 text-sm mt-1 mb-5">
          {t(
            "Puedes hacerlas en el orden que prefieras. Cada prueba se guarda automáticamente.",
            "You can take them in any order. Each test is auto-saved."
          )}
        </p>
        <div className="space-y-3">
          {tests.map((a) => (
            <div
              key={a.id}
              className="border border-gray-200 rounded-2xl p-5 flex gap-5 items-start hover:border-black transition-colors"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                style={{ background: a.color }}
              >
                <IconForAssessment id={a.id} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-base">{a.title[lang]}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{a.summary[lang]}</p>
                  </div>
                  <button
                    onClick={() => agreed && setStarted(a)}
                    disabled={!agreed}
                    className="pill-btn pill-btn-primary text-xs whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ padding: "8px 16px" }}
                  >
                    {t("Empezar", "Start")} <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex gap-4 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {t("Aprox. 55 min · puedes pausar", "About 55 min · pausable")}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Consent */}
        <div className="mt-10 bg-gray-50 rounded-2xl p-6">
          <h3 className="font-bold text-base mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            {t("Consentimiento y privacidad", "Consent and privacy")}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            {t(
              "Tus respuestas y resultados se almacenan cifrados en la plataforma interna de Trading Solutions y solo son visibles para el equipo de reclutamiento. Los datos se usan exclusivamente para evaluar tu candidatura y se conservan 24 meses según nuestra política de retención.",
              "Your answers and results are stored encrypted in the Trading Solutions internal platform and only visible to the recruiting team. Data is used solely to evaluate your application and retained for 24 months per our retention policy."
            )}
          </p>
          <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 accent-black"
            />
            <span className="text-sm">
              {t(
                "He leído y acepto los términos de uso.",
                "I have read and accept the terms of use."
              )}
            </span>
          </label>
        </div>

        <p className="mt-10 text-xs text-gray-400 text-center">
          <Languages className="inline w-3 h-3 mr-1" />
          {t(
            "Cualquier duda, escríbenos a ",
            "Any questions, email us at "
          )}
          <a
            className="underline hover:text-black"
            href="mailto:jointheteam@tradingsolutions.com"
          >
            jointheteam@tradingsolutions.com
          </a>
        </p>
      </div>
    </div>
  );
}

/* ---------- Simple runner (sample questions) ---------- */
function TestRunner({
  meta,
  lang,
  onExit,
}: {
  meta: AssessmentMeta;
  lang: "es" | "en";
  onExit: () => void;
}) {
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  return (
    <div className="min-h-screen bg-white">
      <div className="fixed top-0 inset-x-0 z-50 h-12 bg-black text-white flex items-center justify-between px-6">
        <button onClick={onExit} className="text-xs text-white/80 hover:text-white">
          ← {t("Salir", "Exit")}
        </button>
        <span className="text-[11px] tracking-[0.2em] font-semibold">
          {meta.title[lang]}
        </span>
        <span className="text-xs text-white/80">
          <Clock className="inline w-3 h-3 mr-1" />
          {meta.duration} min
        </span>
      </div>
      <div className="pt-24 max-w-2xl mx-auto px-6 pb-24 text-center">
        <div
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-white mb-6"
          style={{ background: meta.color }}
        >
          <IconForAssessment id={meta.id} big />
        </div>
        <h1 className="text-3xl font-bold mb-3">{meta.title[lang]}</h1>
        <p className="text-gray-600 max-w-lg mx-auto">
          {meta.summary[lang]}
        </p>
        <div className="my-8 p-5 bg-gray-50 rounded-2xl text-left max-w-lg mx-auto">
          <p className="text-xs tracking-[0.15em] text-gray-500 font-semibold uppercase mb-3">
            {t("Antes de empezar", "Before you start")}
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />{t("Tendrás escenarios reales del trabajo con varias formas de actuar.", "You'll see real work scenarios with different possible approaches.")}</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />{t("Responde con honestidad — no hay respuestas correctas o incorrectas.", "Answer honestly — there are no right or wrong answers.")}</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />{t("Busca un espacio tranquilo, sin interrupciones.", "Find a quiet space without interruptions.")}</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />{t("Puedes pausar y retomar cuando quieras.", "You can pause and resume anytime.")}</li>
          </ul>
        </div>
        <button className="pill-btn pill-btn-primary">
          {t("Comenzar ahora", "Start now")} <ArrowRight className="w-4 h-4" />
        </button>
        <p className="text-xs text-gray-400 mt-4">
          {t(
            "Puedes pausar en cualquier momento. Tu progreso se guarda automáticamente.",
            "You can pause anytime. Your progress is auto-saved."
          )}
        </p>
      </div>
    </div>
  );
}

function IconForAssessment({
  id,
  big = false,
}: {
  id: AssessmentMeta["id"];
  big?: boolean;
}) {
  const cls = big ? "w-7 h-7" : "w-5 h-5";
  // Sólo hay un test ahora: factor_x_ts
  void id;
  return <Brain className={cls} />;
}
