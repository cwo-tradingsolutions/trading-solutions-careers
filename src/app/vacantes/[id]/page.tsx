"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import PublicPage from "@/components/PublicPage";
import { areaOf } from "@/lib/areas";
import { useLanguage } from "@/i18n/context";
import { fetchOpenJobs, type Job } from "@/lib/vacancies-adapter";
import { MapPin, Check, Upload, X, CheckCircle } from "lucide-react";

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
        <Link className="back" href="/vacantes">‹ {t.jobs.backToJobs}</Link>
        {loading ? (
          <div className="skeleton" aria-busy="true" aria-label={t.jobs.loading} />
        ) : (
          <div className="soon-state">
            <div className="badge">{t.nav.roles}</div>
            <h2>{t.jobs.notFound}</h2>
            <div className="cta-row">
              <Link href="/vacantes" className="btn-reg">{t.jobs.viewAll} →</Link>
            </div>
          </div>
        )}
      </PublicPage>
    );
  }

  const area = areaOf(job.dept);
  const deptLabel = deptName(job.dept);
  const openApply = () => { setSubmitError(false); setShowApply(true); };

  return (
    <PublicPage>
      <Link className="back" href="/vacantes">‹ {t.jobs.backToJobs}</Link>

      <div className="detail-head">
        <p className="eyebrow">
          {t.areas[area].title}
          {deptLabel !== t.areas[area].title && ` · ${deptLabel}`}
        </p>
        <h1>{job.title[locale]}</h1>
        <div className="ev-pills">
          {job.location && <span><MapPin size={12} aria-hidden />{job.location}</span>}
          <span>{modeName(job.mode)}</span>
          {job.level && <span>{job.level}</span>}
        </div>
      </div>

      <div className="detail-card">
        <div>
          <p className="lead">{job.description[locale]}</p>
          {job.salary && <p className="lead" style={{ marginTop: 14 }}>{job.salary}</p>}

          {job.responsibilities[locale].length > 0 && (
            <>
              <h2>{t.jobs.whatYouDo}</h2>
              <ul>
                {job.responsibilities[locale].map((r, i) => (
                  <li key={i}><i aria-hidden />{r}</li>
                ))}
              </ul>
            </>
          )}

          {job.requirements[locale].length > 0 && (
            <>
              <h2>{t.jobs.whatWeSeek}</h2>
              <ul>
                {job.requirements[locale].map((r, i) => (
                  <li key={i}><i aria-hidden />{r}</li>
                ))}
              </ul>
            </>
          )}

          {job.tags.length > 0 && (
            <div className="chip-row" style={{ marginTop: 28 }}>
              {job.tags.map((tag) => (
                <span key={tag} className="chip blue">{tag}</span>
              ))}
            </div>
          )}
        </div>

        <aside className="apply-box">
          <div className="t">{job.title[locale]}</div>
          <p className="b">{t.process.steps[0].body}</p>
          <button onClick={openApply} className="btn-reg lg">
            {t.jobs.applyBtn} →
          </button>
        </aside>
      </div>

      {/* Apply Modal */}
      {showApply && (
        <div
          className="modal-bg"
          onClick={(e) => { if (e.target === e.currentTarget) setShowApply(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="apply-title"
        >
          <div className="modal">
            <div className="modal-head">
              <div>
                <p className="k">{t.jobs.applyTo}</p>
                <h2 id="apply-title">{job.title[locale]}</h2>
              </div>
              <button type="button" className="x" onClick={() => setShowApply(false)} aria-label={t.jobs.close}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="fields">
                <div className="field">
                  <label htmlFor="ap-name">{t.jobs.fullName}</label>
                  <input id="ap-name" type="text" required autoComplete="name" placeholder={t.jobs.fullNamePlaceholder} name="full_name" value={formData.full_name} onChange={handleChange} />
                </div>
                <div className="two">
                  <div className="field">
                    <label htmlFor="ap-email">{t.jobs.email}</label>
                    <input id="ap-email" type="email" required autoComplete="email" placeholder={t.jobs.emailPlaceholder} name="email" value={formData.email} onChange={handleChange} />
                  </div>
                  <div className="field">
                    <label htmlFor="ap-phone">{t.jobs.phone}</label>
                    <input id="ap-phone" type="tel" autoComplete="tel" placeholder={t.jobs.phonePlaceholder} name="phone" value={formData.phone} onChange={handleChange} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="ap-linkedin">{t.jobs.linkedin}</label>
                  {/* type="url" exigía el https:// y el navegador rechazaba
                      "linkedin.com/in/perfil" o "www.linkedin.com/in/perfil",
                      que es exactamente lo que sale al copiar el perfil desde
                      LinkedIn. El mensaje era el genérico del navegador y no
                      explicaba nada. Se normaliza al enviar. */}
                  <input id="ap-linkedin" type="text" inputMode="url" placeholder={t.jobs.linkedinPlaceholder} name="linkedin" value={formData.linkedin} onChange={handleChange} />
                </div>
                <div className="field">
                  <span className="lab">{t.jobs.cvLabel}</span>
                  <div
                    className="drop"
                    onClick={() => document.getElementById('cv-input')?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setCvFile(f); }}
                  >
                    {cvFile ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--ink)" }}>
                        <Check size={16} aria-hidden />
                        {cvFile.name}
                        <button type="button" className="x" style={{ width: 24, height: 24 }} aria-label={t.jobs.cancel} onClick={(e) => { e.stopPropagation(); setCvFile(null); }}>
                          <X size={12} />
                        </button>
                      </span>
                    ) : (
                      <>
                        <Upload size={20} style={{ margin: "0 auto 8px" }} aria-hidden />
                        {t.jobs.cvDrag} <b>{t.jobs.cvSelect}</b>
                        <br />
                        <span style={{ fontSize: 12, color: "var(--mute2)" }}>{t.jobs.cvFormats}</span>
                      </>
                    )}
                    <input id="cv-input" type="file" accept=".pdf,.doc,.docx" hidden onChange={(e) => { if (e.target.files?.[0]) setCvFile(e.target.files[0]); }} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="ap-why">{t.jobs.whyTs}</label>
                  <textarea id="ap-why" rows={4} placeholder={t.jobs.whyTsPlaceholder} name="why_ts" value={formData.why_ts} onChange={handleChange} />
                </div>
              </div>
              {submitError && (
                <p role="alert" className="alert">{t.jobs.errorGeneric}</p>
              )}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowApply(false)} className="btn-ghost">
                  {t.jobs.cancel}
                </button>
                <button type="submit" disabled={submitting} className="btn-reg lg">
                  {submitting ? t.jobs.submitting : `${t.jobs.submit} →`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {submitted && (
        <div
          className="modal-bg"
          onClick={(e) => { if (e.target === e.currentTarget) setSubmitted(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ok-title"
        >
          <div className="modal sm">
            <div className="ok"><CheckCircle size={24} aria-hidden /></div>
            <h2 id="ok-title" style={{ font: "800 24px/1.2 var(--font)", letterSpacing: "-.02em", marginBottom: 10 }}>{t.jobs.successTitle}</h2>
            <p style={{ font: "400 15px/1.5 var(--font)", color: "var(--mute)", marginBottom: 22 }}>{t.jobs.successBody}</p>
            <Link href="/vacantes" className="btn-reg lg">{t.jobs.backToJobsBtn}</Link>
          </div>
        </div>
      )}
    </PublicPage>
  );
}
