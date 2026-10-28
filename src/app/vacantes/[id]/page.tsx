"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import PublicPage from "@/components/PublicPage";
import { areaOf } from "@/lib/areas";
import { useLanguage } from "@/i18n/context";
import { fetchOpenJobs, type Job } from "@/lib/vacancies-adapter";
import { ArrowLeft, MapPin, Check, ArrowUpRight, Upload, X, CheckCircle } from "lucide-react";

/**
 * Acepta el perfil de LinkedIn como venga y lo deja en una URL utilizable.
 *
 * Al copiar un perfil, LinkedIn entrega cosas como "linkedin.com/in/perfil",
 * "www.linkedin.com/in/perfil" o la URL con parámetros de seguimiento. Antes
 * el campo era type="url" y el navegador rechazaba todo lo que no empezara con
 * https://, con un mensaje genérico que no decía qué corregir. Una candidata
 * quedó bloqueada por esto.
 */
function normalizarLinkedin(valor: string): string {
  const v = (valor || "").trim().replace(/\s+/g, "");
  if (!v) return "";
  // Solo el usuario, sin dominio: "juanperez" o "/in/juanperez"
  if (!/linkedin\./i.test(v)) {
    const usuario = v.replace(/^\/?(in\/)?/i, "");
    return usuario ? `https://www.linkedin.com/in/${usuario}` : "";
  }
  // Con dominio pero sin esquema
  if (!/^https?:\/\//i.test(v)) return `https://${v}`;
  return v;
}

export default function JobDetailPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  // ?ref=interno · cuando llegan desde el newsletter interno
  const ref = searchParams?.get("ref") || null;
  const [job, setJob] = useState<Job | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const { t, locale } = useLanguage();
  const [showApply, setShowApply] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    linkedin: '',
    why_ts: '',
  });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchOpenJobs()
      .then((list) => {
        if (active) setJob(list.find((j) => j.id === Number(id)));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const modeName = (m: string) => (t.modeNames as Record<string, string>)[m] || m;
  const deptName = (d: string) => (t.deptNames as Record<string, string>)[d] || d;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      let cv_filename = null;
      let cv_data = null;
      if (cvFile) {
        cv_filename = cvFile.name;
        cv_data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(cvFile);
        });
      }
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          job_title: job.title[locale],
          ...formData,
          linkedin: normalizarLinkedin(formData.linkedin),
          cv_filename,
          cv_data,
          ref, // ?ref=interno cuando viene del newsletter interno
        }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setShowApply(false);
      setSubmitted(true);
      setFormData({ full_name: '', email: '', phone: '', linkedin: '', why_ts: '' });
      setCvFile(null);
    } catch (err) {
      console.error(err);
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !job) {
    return (
      <PublicPage>
        <div className="max-w-4xl mx-auto px-5 md:px-6 lg:px-10 py-24 text-center">
          {loading ? (
            <p className="text-ts-muted" aria-busy="true">{t.jobs.loading}</p>
          ) : (
            <>
              <h1 className="section-title mb-8">{t.jobs.notFound}</h1>
              <Link href="/vacantes" className="pill-btn pill-btn-primary">
                {t.jobs.viewAll}
                <ArrowUpRight size={16} strokeWidth={2.5} />
              </Link>
            </>
          )}
        </div>
      </PublicPage>
    );
  }

  const area = areaOf(job.dept);
  const deptLabel = deptName(job.dept);

  return (
    <PublicPage>
      {/* Header claro, mismo chrome que la home */}
      <section className="pt-10 md:pt-14 pb-10">
        <div className="max-w-4xl mx-auto px-5 md:px-6 lg:px-10">
          <Link
            href="/vacantes"
            className="flex w-fit items-center gap-2 text-sm text-ts-muted hover:text-ts-ink mb-10 transition-colors"
          >
            <ArrowLeft size={16} aria-hidden />
            {t.jobs.backToJobs}
          </Link>
          <p className="ts-kicker mb-4">
            {t.areas[area].title}
            {deptLabel !== t.areas[area].title && ` · ${deptLabel}`}
          </p>
          <h1 className="text-4xl md:text-6xl font-light tracking-[-0.035em] leading-[1.05] mb-6">{job.title[locale]}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {job.location && (
              <span className="tag !bg-ts-surface items-center gap-1.5">
                <MapPin size={12} aria-hidden />
                {job.location}
              </span>
            )}
            <span className="tag !bg-ts-surface">{modeName(job.mode)}</span>
            {job.level && <span className="tag !bg-ts-surface">{job.level}</span>}
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="pb-20 md:pb-28">
        <div className="max-w-4xl mx-auto px-5 md:px-6 lg:px-10">
          <div className="bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] p-7 md:p-12">
            <div className="mb-12">
              <p className="text-ts-ink leading-relaxed text-lg">{job.description[locale]}</p>
              {job.salary && <p className="mt-5 text-lg text-ts-ink ts-tabular">{job.salary}</p>}
            </div>

            {job.responsibilities[locale].length > 0 && (
              <div className="mb-12">
                <h2 className="font-light text-2xl tracking-ts-tight mb-6">{t.jobs.whatYouDo}</h2>
                <ul className="space-y-3.5">
                  {job.responsibilities[locale].map((r, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-ts-accent flex-shrink-0 flex items-center justify-center mt-0.5">
                        <Check size={10} className="text-white" strokeWidth={3} aria-hidden />
                      </span>
                      <span className="text-[15px] text-ts-muted leading-relaxed">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {job.requirements[locale].length > 0 && (
              <div className="mb-12">
                <h2 className="font-light text-2xl tracking-ts-tight mb-6">{t.jobs.whatWeSeek}</h2>
                <ul className="space-y-3.5">
                  {job.requirements[locale].map((r, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-ts-accent flex-shrink-0 mt-2.5" aria-hidden />
                      <span className="text-[15px] text-ts-muted leading-relaxed">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {job.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-12">
                {job.tags.map((tag) => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
            )}

            <button
              onClick={() => { setSubmitError(false); setShowApply(true); }}
              className="pill-btn pill-btn-primary w-full justify-center text-base"
            >
              {t.jobs.applyBtn}
              <ArrowUpRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </section>

      {/* Apply Modal */}
      {showApply && (
        <div
          className="fixed inset-0 bg-[rgba(var(--ts-ink-rgb),0.45)] backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowApply(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="apply-title"
        >
          <div className="bg-ts-surface rounded-t-ts-lg sm:rounded-ts-lg max-w-[680px] w-full max-h-[92vh] overflow-y-auto">
            <div className="p-6 sm:p-10">
              <div className="flex items-start justify-between gap-4 mb-8">
                <div>
                  <p className="text-sm text-ts-muted mb-1">{t.jobs.applyTo}</p>
                  <h2 id="apply-title" className="text-2xl font-light tracking-ts-tight">{job.title[locale]}</h2>
                </div>
                <button
                  onClick={() => setShowApply(false)}
                  aria-label={t.jobs.close}
                  className="w-10 h-10 rounded-full bg-ts-canvas flex items-center justify-center hover:bg-[color:var(--ts-line)] transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="space-y-5">
                  <div>
                    <label htmlFor="ap-name" className="block text-sm font-medium mb-2">{t.jobs.fullName}</label>
                    <input id="ap-name" type="text" required autoComplete="name" className="input-field" placeholder={t.jobs.fullNamePlaceholder} name="full_name" value={formData.full_name} onChange={handleChange} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="ap-email" className="block text-sm font-medium mb-2">{t.jobs.email}</label>
                      <input id="ap-email" type="email" required autoComplete="email" className="input-field" placeholder={t.jobs.emailPlaceholder} name="email" value={formData.email} onChange={handleChange} />
                    </div>
                    <div>
                      <label htmlFor="ap-phone" className="block text-sm font-medium mb-2">{t.jobs.phone}</label>
                      <input id="ap-phone" type="tel" autoComplete="tel" className="input-field" placeholder={t.jobs.phonePlaceholder} name="phone" value={formData.phone} onChange={handleChange} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="ap-linkedin" className="block text-sm font-medium mb-2">{t.jobs.linkedin}</label>
                    {/* type="url" exigía el https:// y el navegador rechazaba
                        "linkedin.com/in/perfil" o "www.linkedin.com/in/perfil",
                        que es exactamente lo que sale al copiar el perfil desde
                        LinkedIn. El mensaje era el genérico del navegador y no
                        explicaba nada. Se normaliza al enviar. */}
                    <input id="ap-linkedin" type="text" inputMode="url" className="input-field" placeholder={t.jobs.linkedinPlaceholder} name="linkedin" value={formData.linkedin} onChange={handleChange} />
                  </div>
                  <div>
                    <span className="block text-sm font-medium mb-2">{t.jobs.cvLabel}</span>
                    <div
                      className="border border-dashed border-[color:var(--ts-line)] bg-ts-canvas rounded-ts-md p-8 text-center hover:border-ts-accent transition-colors cursor-pointer"
                      onClick={() => document.getElementById('cv-input')?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setCvFile(f); }}
                    >
                      {cvFile ? (
                        <div className="flex items-center justify-center gap-2">
                          <Check size={18} className="text-ts-accent" aria-hidden />
                          <span className="text-sm font-medium">{cvFile.name}</span>
                          <button type="button" aria-label={t.jobs.cancel} onClick={(e) => { e.stopPropagation(); setCvFile(null); }} className="ml-2 text-ts-muted hover:text-ts-ink">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload size={22} className="mx-auto mb-3 text-ts-muted" aria-hidden />
                          <p className="text-sm text-ts-muted">
                            {t.jobs.cvDrag} <span className="text-ts-accent font-medium">{t.jobs.cvSelect}</span>
                          </p>
                          <p className="text-xs text-ts-muted mt-1">{t.jobs.cvFormats}</p>
                        </>
                      )}
                      <input id="cv-input" type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setCvFile(e.target.files[0]); }} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="ap-why" className="block text-sm font-medium mb-2">{t.jobs.whyTs}</label>
                    <textarea
                      id="ap-why"
                      className="input-field"
                      rows={4}
                      placeholder={t.jobs.whyTsPlaceholder}
                      name="why_ts"
                      value={formData.why_ts}
                      onChange={handleChange}
                    />
                  </div>
                </div>
                {submitError && (
                  <p role="alert" className="mt-6 text-sm text-[color:var(--ts-red)] bg-[color:var(--ts-red-bg)] rounded-ts-sm px-4 py-3">
                    {t.jobs.errorGeneric}
                  </p>
                )}
                <div className="mt-8 flex flex-col-reverse sm:flex-row gap-3">
                  <button type="button" onClick={() => setShowApply(false)} className="pill-btn pill-btn-outline justify-center">
                    {t.jobs.cancel}
                  </button>
                  <button type="submit" disabled={submitting} className="pill-btn pill-btn-primary flex-1 justify-center disabled:opacity-50">
                    {submitting ? t.jobs.submitting : t.jobs.submit}
                    {!submitting && <ArrowUpRight size={16} strokeWidth={2.5} />}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {submitted && (
        <div
          className="fixed inset-0 bg-[rgba(var(--ts-ink-rgb),0.45)] backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSubmitted(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ok-title"
        >
          <div className="bg-ts-surface rounded-ts-lg max-w-[480px] w-full">
            <div className="p-10 text-center">
              <div className="w-14 h-14 bg-ts-accent rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={26} className="text-white" aria-hidden />
              </div>
              <h3 id="ok-title" className="text-2xl font-light tracking-ts-tight mb-3">{t.jobs.successTitle}</h3>
              <p className="text-ts-muted mb-8 leading-relaxed">{t.jobs.successBody}</p>
              <Link href="/vacantes" className="pill-btn pill-btn-primary">
                {t.jobs.backToJobsBtn}
              </Link>
            </div>
          </div>
        </div>
      )}
    </PublicPage>
  );
}
