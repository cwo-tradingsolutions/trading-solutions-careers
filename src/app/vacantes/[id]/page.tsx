"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
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

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="py-24 text-center min-h-screen bg-ts-canvas">
          <p className="text-ts-muted text-lg">{locale === "es" ? "Cargando..." : "Loading..."}</p>
        </div>
        <Footer />
      </>
    );
  }

  if (!job) {
    return (
      <>
        <Navbar />
        <div className="py-24 text-center min-h-screen bg-ts-canvas">
          <h1 className="section-title font-light mb-4">{t.jobs.notFound}</h1>
          <Link href="/vacantes" className="pill-btn pill-btn-primary">
            {t.jobs.viewAll}
          </Link>
        </div>
        <Footer />
      </>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
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
      alert(locale === 'es' ? 'Error al enviar la aplicación. Intenta de nuevo.' : 'Error submitting application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />

      <div className="bg-ts-canvas pt-10 pb-4">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <Link
            href="/vacantes"
            className="flex items-center gap-2 text-sm text-ts-muted hover:text-ts-accent mb-6 transition-colors"
          >
            <ArrowLeft size={16} />
            {t.jobs.backToJobs}
          </Link>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="ts-pill ts-pill-accent">{deptName(job.dept)}</span>
            <span className="ts-pill">{modeName(job.mode)}</span>
          </div>
          <h1 className="ts-display font-light text-3xl md:text-5xl mb-3">{job.title[locale]}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-ts-muted">
            <span className="flex items-center gap-1.5">
              <MapPin size={14} />
              {job.location}
            </span>
            <span>·</span>
            <span>{job.level}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-ts-canvas py-12">
        <div className="max-w-4xl mx-auto px-6 lg:px-10">
          <div className="bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] p-8 md:p-10">
          <div className="mb-10">
            <p className="text-ts-secondary leading-relaxed text-base font-medium">{job.description[locale]}</p>
            <p className="mt-4 font-bold text-xl">{job.salary}</p>
          </div>

          <div className="mb-10">
            <h3 className="font-light text-2xl mb-5">{t.jobs.whatYouDo}</h3>
            <div className="space-y-3">
              {job.responsibilities[locale].map((r, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-ts-accent flex-shrink-0 flex items-center justify-center mt-0.5">
                    <Check size={10} className="text-white" strokeWidth={3} />
                  </div>
                  <p className="text-sm text-gray-600">{r}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-10">
            <h3 className="font-light text-2xl mb-5">{t.jobs.whatWeSeek}</h3>
            <div className="space-y-3">
              {job.requirements[locale].map((r, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-ts-accent flex-shrink-0 mt-2" />
                  <p className="text-sm text-gray-600">{r}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-10">
            {job.tags.map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>

          <button
            onClick={() => setShowApply(true)}
            className="pill-btn pill-btn-primary w-full justify-center text-base"
          >
            {t.jobs.applyBtn}
            <ArrowUpRight size={16} strokeWidth={2.5} />
          </button>
          </div>
        </div>
      </div>

      {/* Apply Modal */}
      {showApply && (
        <div
          className="fixed inset-0 ts-scrim z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowApply(false); }}
        >
          <div className="bg-ts-surface rounded-ts-lg max-w-[720px] w-full max-h-[90vh] overflow-y-auto border border-ts-hairline">
            <div className="p-8 md:p-10">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-sm text-gray-500 mb-1">{t.jobs.applyTo}</p>
                  <h2 className="ts-heading text-xl">{job.title[locale]}</h2>
                </div>
                <button
                  onClick={() => setShowApply(false)}
                  className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium mb-2">{t.jobs.fullName}</label>
                    <input type="text" required className="input-field" placeholder={t.jobs.fullNamePlaceholder} name="full_name" value={formData.full_name} onChange={handleChange} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">{t.jobs.email}</label>
                    <input type="email" required className="input-field" placeholder={t.jobs.emailPlaceholder} name="email" value={formData.email} onChange={handleChange} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">{t.jobs.phone}</label>
                    <input type="tel" className="input-field" placeholder={t.jobs.phonePlaceholder} name="phone" value={formData.phone} onChange={handleChange} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">{t.jobs.linkedin}</label>
                    {/* type="url" exigía el https:// y el navegador rechazaba
                        "linkedin.com/in/perfil" o "www.linkedin.com/in/perfil",
                        que es exactamente lo que sale al copiar el perfil desde
                        LinkedIn. El mensaje era el genérico del navegador y no
                        explicaba nada. Se normaliza al enviar. */}
                    <input type="text" inputMode="url" className="input-field" placeholder={t.jobs.linkedinPlaceholder} name="linkedin" value={formData.linkedin} onChange={handleChange} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">{t.jobs.cvLabel}</label>
                    <div 
                      className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-black transition-colors cursor-pointer"
                      onClick={() => document.getElementById('cv-input')?.click()}
                    >
                      {cvFile ? (
                        <div className="flex items-center justify-center gap-2">
                          <Check size={18} className="text-green-600" />
                          <span className="text-sm font-medium">{cvFile.name}</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setCvFile(null); }} className="ml-2 text-gray-400 hover:text-red-500">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload size={24} className="mx-auto mb-3 text-gray-400" />
                          <p className="text-sm text-gray-500">
                            {t.jobs.cvDrag} <span className="text-black font-medium">{t.jobs.cvSelect}</span>
                          </p>
                          <p className="text-xs text-gray-400 mt-1">{t.jobs.cvFormats}</p>
                        </>
                      )}
                      <input id="cv-input" type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setCvFile(e.target.files[0]); }} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">{t.jobs.whyTs}</label>
                    <textarea
                      className="input-field"
                      rows={4}
                      placeholder={t.jobs.whyTsPlaceholder}
                      name="why_ts"
                      value={formData.why_ts}
                      onChange={handleChange}
                    />
                  </div>
                </div>
                <div className="mt-8 flex gap-3">
                  <button type="submit" disabled={submitting} className="pill-btn pill-btn-primary flex-1 justify-center disabled:opacity-50">
                    {submitting ? (locale === 'es' ? 'Enviando...' : 'Submitting...') : t.jobs.submit}
                    {!submitting && <ArrowUpRight size={16} strokeWidth={2.5} />}
                  </button>
                  <button type="button" onClick={() => setShowApply(false)} className="pill-btn pill-btn-outline">
                    {t.jobs.cancel}
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
          className="fixed inset-0 ts-scrim z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSubmitted(false); }}
        >
          <div className="bg-ts-surface rounded-ts-lg max-w-[480px] w-full border border-ts-hairline">
            <div className="p-10 text-center">
              <div className="w-16 h-16 bg-ts-accent rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={28} className="text-white" />
              </div>
              <h3 className="ts-heading text-2xl mb-3">{t.jobs.successTitle}</h3>
              <p className="text-gray-500 mb-8">{t.jobs.successMsg}</p>
              <Link href="/vacantes" className="pill-btn pill-btn-primary">
                {t.jobs.backToJobsBtn}
              </Link>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
