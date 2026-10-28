"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLanguage } from "@/i18n/context";
import { fetchOpenJobs, type Job } from "@/lib/vacancies-adapter";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { areaOf } from "@/lib/careers-areas";
import { MapPin, Briefcase, Check, ArrowRight, Upload, X, CheckCircle2, Layers } from "lucide-react";

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

const EMPTY_FORM = { full_name: "", email: "", phone: "", linkedin: "", why_ts: "" };

export default function JobDetailPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  // ?ref=interno · cuando llegan desde el newsletter interno
  const ref = searchParams?.get("ref") || null;
  const { t } = useLanguage();

  const [job, setJob] = useState<Job | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(showApply || submitted, dialogRef, submitted ? "success" : "apply");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setJob(undefined);
    setLoadError(false);
    fetchOpenJobs()
      .then((list) => active && setJob(list.find((j) => j.id === Number(id))))
      .catch(() => active && setLoadError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, attempt]);

  // Modal: lock scroll + Escape to close
  useEffect(() => {
    const open = showApply || submitted;
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowApply(false);
        setSubmitted(false);
      }
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [showApply, submitted]);

  const modeName = (m: string) => t.modeNames[m] || m;
  const deptName = (d: string) => t.deptNames[d] || t.areas.items[areaOf(d)].title;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="bg-ts-canvas min-h-[70vh] px-4 sm:px-6 lg:px-10 py-16">
          <div className="max-w-ts mx-auto space-y-4" aria-busy="true">
            <div className="h-6 w-40 rounded bg-ts-surface animate-pulse" />
            <div className="h-12 w-2/3 rounded bg-ts-surface animate-pulse" />
            <div className="h-[320px] rounded-ts-lg bg-ts-surface animate-pulse" />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (!job) {
    return (
      <>
        <Navbar />
        <main className="bg-ts-canvas min-h-[70vh] px-4 sm:px-6 lg:px-10 py-20">
          <div className="max-w-xl mx-auto bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] p-10 text-center">
            <h1 className="text-3xl font-light tracking-ts-tight mb-3">{loadError ? t.jobs.loadError : t.jobs.notFound}</h1>
            <p className="text-ts-secondary mb-8">{!loadError && t.jobs.notFoundBody}</p>
            {loadError && <button onClick={() => setAttempt((n) => n + 1)} className="pill-btn pill-btn-primary mr-3">{t.jobs.retry}</button>}
            <Link href="/vacantes" className="pill-btn pill-btn-primary">
              {t.jobs.backToRoles}
            </Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const area = t.areas.items[areaOf(job.dept)].title;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || error === t.jobs.cvInvalid) return;
    setSubmitting(true);
    setError(null);
    try {
      let cv_filename = null;
      let cv_data = null;
      if (cvFile) {
        cv_filename = cvFile.name;
        cv_data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Could not read CV"));
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(cvFile);
        });
      }
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job.id,
          job_title: job.title.en,
          ...formData,
          linkedin: normalizarLinkedin(formData.linkedin),
          cv_filename,
          cv_data,
          ref, // ?ref=interno cuando viene del newsletter interno
        }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      setShowApply(false);
      setSubmitted(true);
      setFormData(EMPTY_FORM);
      setCvFile(null);
    } catch (err) {
      console.error(err);
      setError(t.jobs.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const pickFile = (f?: File | null) => {
    if (!f) return;
    if (!/\.(pdf|doc|docx)$/i.test(f.name) || f.size > 3 * 1024 * 1024) {
      setCvFile(null);
      setError(t.jobs.cvInvalid);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setError(null);
    setCvFile(f);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <Navbar />

      <main className="bg-ts-canvas">
        {/* Light header */}
        <section className="px-4 sm:px-6 lg:px-10 pt-8 md:pt-12 pb-8 md:pb-10">
          <div className="max-w-ts mx-auto">
            <Link href="/vacantes" className="inline-block text-sm font-medium text-ts-muted hover:text-ts-accent mb-8 transition-colors">
              {t.jobs.back}
            </Link>
            <p className="text-sm text-ts-muted mb-3">
              {area} · {deptName(job.dept)}
            </p>
            <h1 className="section-title max-w-4xl mb-5">{job.title.en}</h1>
            <div className="flex flex-wrap gap-2">
              {job.location && (
                <span className="tag gap-1.5 items-center"><MapPin size={13} aria-hidden />{job.location}</span>
              )}
              <span className="tag gap-1.5 items-center"><Briefcase size={13} aria-hidden />{modeName(job.mode)}</span>
              {job.level && <span className="tag gap-1.5 items-center"><Layers size={13} aria-hidden />{job.level}</span>}
            </div>
          </div>
        </section>

        <section className="px-4 sm:px-6 lg:px-10 pb-16 md:pb-24">
          <div className="max-w-ts mx-auto grid lg:grid-cols-12 gap-6 items-start">
            <article className="lg:col-span-8 bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] p-7 md:p-10">
              {job.description.en && (
                <p className="text-lg text-ts-secondary leading-relaxed">{job.description.en}</p>
              )}

              {job.responsibilities.en.length > 0 && (
                <div className="mt-10">
                  <h2 className="text-2xl font-light tracking-ts-tight mb-5">{t.jobs.whatYouDo}</h2>
                  <ul className="space-y-3">
                    {job.responsibilities.en.map((r, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="w-5 h-5 rounded-full bg-[var(--ts-blue-bg)] text-ts-accent flex-shrink-0 flex items-center justify-center mt-0.5">
                          <Check size={11} strokeWidth={3} aria-hidden />
                        </span>
                        <p className="text-[15px] text-ts-secondary leading-relaxed">{r}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {job.requirements.en.length > 0 && (
                <div className="mt-10">
                  <h2 className="text-2xl font-light tracking-ts-tight mb-5">{t.jobs.whatWeSeek}</h2>
                  <ul className="space-y-3">
                    {job.requirements.en.map((r, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-ts-accent flex-shrink-0 mt-2.5" aria-hidden />
                        <p className="text-[15px] text-ts-secondary leading-relaxed">{r}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {job.tags.length > 0 && (
                <div className="mt-10 flex flex-wrap gap-2">
                  {job.tags.map((tag) => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </div>
              )}
            </article>

            {/* Apply aside (desktop) */}
            <aside className="hidden lg:block lg:col-span-4 lg:sticky lg:top-28">
              <div className="bg-ts-surface rounded-ts-lg border border-[color:var(--ts-line)] p-7">
                <p className="text-sm text-ts-muted mb-1">{area}</p>
                <p className="text-lg font-medium text-ts-ink mb-1">{job.title.en}</p>
                {job.salary && <p className="text-sm text-ts-secondary">{job.salary}</p>}
                <button onClick={() => { setError(null); setShowApply(true); }} className="pill-btn pill-btn-primary w-full justify-center text-base mt-6">
                  {t.jobs.apply}
                  <ArrowRight size={16} strokeWidth={2.25} />
                </button>
                <p className="text-xs text-ts-muted mt-4 leading-relaxed">{t.jobs.applyAside}</p>
              </div>
            </aside>
          </div>
        </section>

        {/* Apply bar (mobile / tablet) */}
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-[color:var(--ts-line)] px-4 py-3">
          <button onClick={() => { setError(null); setShowApply(true); }} className="pill-btn pill-btn-primary w-full justify-center text-base">
            {t.jobs.apply}
            <ArrowRight size={16} strokeWidth={2.25} />
          </button>
        </div>
      </main>

      {/* Apply modal — Journal light */}
      {showApply && (
        <div
          className="fixed inset-0 z-[70] bg-[rgba(8,20,32,0.45)] backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowApply(false); }}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="apply-title"
            className="bg-ts-surface w-full sm:max-w-[640px] max-h-[92dvh] overflow-y-auto rounded-t-ts-lg sm:rounded-ts-lg shadow-[0_24px_60px_-20px_rgba(8,20,32,0.35)]"
          >
            <div className="sticky top-0 bg-white/95 backdrop-blur px-6 md:px-8 pt-6 pb-4 border-b border-[color:var(--ts-line)] flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-ts-muted mb-1">{t.jobs.applyTo}</p>
                <h2 id="apply-title" className="text-xl font-light tracking-ts-tight">{job.title.en}</h2>
              </div>
              <button
                onClick={() => setShowApply(false)}
                className="w-9 h-9 rounded-full bg-ts-canvas flex items-center justify-center hover:bg-[var(--ts-gray-10)] transition-colors shrink-0"
                aria-label={t.jobs.close}
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 md:px-8 py-6">
              <div className="space-y-5">
                <div>
                  <label htmlFor="f-name" className="block text-sm font-medium mb-2">{t.jobs.fullName}</label>
                  <input id="f-name" type="text" required autoComplete="name" className="input-field" placeholder={t.jobs.fullNamePlaceholder} name="full_name" value={formData.full_name} onChange={handleChange} />
                </div>
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="f-email" className="block text-sm font-medium mb-2">{t.jobs.email}</label>
                    <input id="f-email" type="email" required autoComplete="email" className="input-field" placeholder={t.jobs.emailPlaceholder} name="email" value={formData.email} onChange={handleChange} />
                  </div>
                  <div>
                    <label htmlFor="f-phone" className="block text-sm font-medium mb-2">{t.jobs.phone}</label>
                    <input id="f-phone" type="tel" autoComplete="tel" className="input-field" placeholder={t.jobs.phonePlaceholder} name="phone" value={formData.phone} onChange={handleChange} />
                  </div>
                </div>
                <div>
                  <label htmlFor="f-linkedin" className="block text-sm font-medium mb-2">{t.jobs.linkedin}</label>
                  {/* type="url" exigía el https:// y el navegador rechazaba
                      "linkedin.com/in/perfil" o "www.linkedin.com/in/perfil",
                      que es exactamente lo que sale al copiar el perfil desde
                      LinkedIn. Se normaliza al enviar. */}
                  <input id="f-linkedin" type="text" inputMode="url" className="input-field" placeholder={t.jobs.linkedinPlaceholder} name="linkedin" value={formData.linkedin} onChange={handleChange} />
                </div>
                <div>
                  <span className="block text-sm font-medium mb-2">{t.jobs.cvLabel}</span>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
                    className={`rounded-ts-md border-2 border-dashed p-7 text-center cursor-pointer transition-colors ${dragOver ? "border-ts-accent bg-[var(--ts-blue-bg)]" : "border-[color:var(--ts-gray-20)] hover:border-ts-accent"}`}
                  >
                    {cvFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <Check size={18} className="text-[var(--ts-green)]" aria-hidden />
                        <span className="text-sm font-medium truncate max-w-[60vw]">{cvFile.name}</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setCvFile(null); }} className="ml-1 p-1 text-ts-muted hover:text-[var(--ts-red)]" aria-label={t.jobs.close}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload size={22} className="mx-auto mb-3 text-ts-muted" aria-hidden />
                        <p className="text-sm text-ts-secondary">
                          {t.jobs.cvDrag} <span className="text-ts-accent font-medium">{t.jobs.cvSelect}</span>
                        </p>
                        <p className="text-xs text-ts-muted mt-1">{t.jobs.cvFormats}</p>
                      </>
                    )}
                    <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
                  </div>
                </div>
                <div>
                  <label htmlFor="f-why" className="block text-sm font-medium mb-2">{t.jobs.whyTs}</label>
                  <textarea id="f-why" className="input-field" rows={4} placeholder={t.jobs.whyTsPlaceholder} name="why_ts" value={formData.why_ts} onChange={handleChange} />
                </div>
              </div>

              {error && (
                <p role="alert" className="mt-5 text-sm rounded-ts-sm px-4 py-3 bg-[var(--ts-red-bg)] text-[var(--ts-red)] border border-[var(--ts-red-border)]">
                  {error}
                </p>
              )}

              <div className="mt-7 flex flex-col-reverse sm:flex-row gap-3">
                <button type="button" onClick={() => setShowApply(false)} className="pill-btn pill-btn-outline justify-center">
                  {t.jobs.cancel}
                </button>
                <button type="submit" disabled={submitting || error === t.jobs.cvInvalid} className="pill-btn pill-btn-primary flex-1 justify-center disabled:opacity-50">
                  {submitting ? t.jobs.submitting : t.jobs.submit}
                  {!submitting && <ArrowRight size={16} strokeWidth={2.25} />}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success */}
      {submitted && (
        <div
          className="fixed inset-0 z-[70] bg-[rgba(8,20,32,0.45)] backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSubmitted(false); }}
        >
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ok-title" className="bg-ts-surface rounded-ts-lg max-w-[460px] w-full p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--ts-blue-bg)] text-ts-accent flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={26} aria-hidden />
            </div>
            <h2 id="ok-title" className="text-2xl font-light tracking-ts-tight mb-3">{t.jobs.successTitle}</h2>
            <p className="text-ts-secondary leading-relaxed mb-8">{t.jobs.successBody}</p>
            <Link href="/vacantes" className="pill-btn pill-btn-primary">
              {t.jobs.backToRoles}
            </Link>
          </div>
        </div>
      )}

      <Footer />
      {/* room for the fixed mobile apply bar */}
      <div className="lg:hidden h-[72px] bg-ts-surface" aria-hidden />
    </>
  );
}
