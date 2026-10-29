"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/i18n/context";
import type { Job } from "@/lib/vacancies-adapter";
import { normalizarLinkedin, siteLinks } from "./shared";

const MAX_CV = 5 * 1024 * 1024;

type Mode = "job" | "pool";

export default function ApplyForm({
  mode,
  job,
  areas,
  refCode,
}: {
  mode: Mode;
  job?: Job;
  areas: string[];
  refCode?: string | null;
}) {
  const { t, locale } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [why, setWhy] = useState("");
  const [area, setArea] = useState("");
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok?: boolean; gap?: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const deptName = (d: string) => (t.deptNames as Record<string, string>)[d] || d;
  const title = mode === "pool" ? t.ui.poolTitle : job?.title[locale] || "";

  const validate = () => {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.full_name = t.ui.nameRequired;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = t.ui.emailInvalid;
    if (linkedin.trim()) {
      try {
        const url = new URL(normalizarLinkedin(linkedin));
        if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) next.linkedin = t.ui.linkedinInvalid;
      } catch {
        next.linkedin = t.ui.linkedinInvalid;
      }
    }
    if (file) {
      const okType = /\.(pdf|doc|docx)$/i.test(file.name);
      if (!okType) next.cv = t.ui.cvType;
      else if (file.size > MAX_CV) next.cv = t.ui.cvTooBig;
    }
    if (mode === "pool" && !area) next.area = t.ui.areaRequired;
    if (!consent) next.consent = t.ui.consentRequired;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (honeypot) return;
    if (!validate()) return;

    if (mode === "pool" || !job) {
      setStatus({ gap: true, text: t.ui.poolGap });
      return;
    }

    setSubmitting(true);
    try {
      let cv_filename: string | null = null;
      let cv_data: string | null = null;
      if (file) {
        cv_filename = file.name;
        cv_data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("read"));
          reader.readAsDataURL(file);
        });
      }
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job.id,
          job_title: job.title[locale],
          full_name: fullName.trim(),
          email: email.trim(),
          phone,
          linkedin: normalizarLinkedin(linkedin),
          why_ts: why,
          cv_filename,
          cv_data,
          ref: refCode || null,
        }),
      });
      if (!res.ok) throw new Error("submit");
      setSent(true);
      setFullName("");
      setEmail("");
      setPhone("");
      setLinkedin("");
      setWhy("");
      setFile(null);
      setConsent(false);
    } catch {
      setStatus({ ok: false, text: t.ui.sendError });
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div>
        <h2>{t.jobs.successTitle}</h2>
        <p>{t.jobs.successMsg}</p>
        <Link href="/vacantes" className="btn btn-blue" style={{ marginTop: 18 }}>
          {t.jobs.backToJobsBtn}
        </Link>
      </div>
    );
  }

  const field = (id: string, label: string, required: boolean, control: React.ReactNode) => (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> ({t.ui.required})</span>
          </>
        ) : null}
      </label>
      {control}
      {errors[id] ? (
        <span className="err" id={`${id}-err`}>
          {errors[id]}
        </span>
      ) : null}
    </div>
  );

  return (
    <>
      <h2>{mode === "pool" ? t.ui.leaveCv : t.jobs.applyBtn}</h2>
      {mode === "job" ? <p>{title}</p> : null}
      <form data-form="Job application" noValidate onSubmit={onSubmit}>
        <input
          type="text"
          name="_gotcha"
          className="sr-only"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
        {field(
          "full_name",
          t.jobs.fullName,
          true,
          <input
            id="full_name"
            name="full_name"
            type="text"
            placeholder={t.jobs.fullNamePlaceholder}
            autoComplete="name"
            value={fullName}
            aria-invalid={errors.full_name ? true : undefined}
            aria-describedby={errors.full_name ? "full_name-err" : undefined}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}
        {field(
          "email",
          t.jobs.email,
          true,
          <input
            id="email"
            name="email"
            type="email"
            placeholder={t.jobs.emailPlaceholder}
            autoComplete="email"
            value={email}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "email-err" : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
        <div className="f2">
          {field(
            "phone",
            t.jobs.phone,
            false,
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder={t.jobs.phonePlaceholder}
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          )}
          {field(
            "linkedin",
            t.jobs.linkedin,
            false,
            <input
              id="linkedin"
              name="linkedin"
              type="text"
              inputMode="url"
              placeholder={t.jobs.linkedinPlaceholder}
              value={linkedin}
              aria-invalid={errors.linkedin ? true : undefined}
              aria-describedby={errors.linkedin ? "linkedin-err" : undefined}
              onChange={(e) => setLinkedin(e.target.value)}
            />
          )}
        </div>
        {mode === "pool"
          ? field(
              "area",
              t.ui.areaInterest,
              true,
              <select
                id="area"
                name="area"
                value={area}
                aria-invalid={errors.area ? true : undefined}
                aria-describedby={errors.area ? "area-err" : undefined}
                onChange={(e) => setArea(e.target.value)}
              >
                <option value="">{t.ui.areaUnset}</option>
                {areas.map((d) => (
                  <option key={d} value={d}>
                    {deptName(d)}
                  </option>
                ))}
                <option value="general">{t.ui.areaGeneral}</option>
              </select>
            )
          : null}
        <div className="field">
          <label htmlFor="cv">{t.jobs.cvLabel}</label>
          <div>
            <button type="button" className="file-btn" onClick={() => document.getElementById("cv")?.click()}>
              {t.ui.chooseFile}
            </button>
            <span className="file-name">{file ? file.name : t.ui.noFile}</span>
          </div>
          <input
            id="cv"
            name="cv"
            type="file"
            accept=".pdf,.doc,.docx"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <span className="hint">{t.ui.cvHint}</span>
          {errors.cv ? (
            <span className="err" id="cv-err">
              {errors.cv}
            </span>
          ) : null}
        </div>
        {field(
          "why_ts",
          t.jobs.whyTs,
          false,
          <textarea
            id="why_ts"
            name="why_ts"
            rows={4}
            placeholder={t.jobs.whyTsPlaceholder}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
        )}
        <label className="check" data-invalid={errors.consent ? "true" : undefined}>
          <input type="checkbox" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            {t.ui.privacyAgree}{" "}
            <a href={siteLinks.legal} target="_blank" rel="noopener">
              {t.ui.privacyPolicy}
            </a>
            <span className="sr-only"> ({t.ui.required})</span>
          </span>
        </label>
        {errors.consent ? <span className="err">{errors.consent}</span> : null}
        <button type="submit" className="btn btn-blue" disabled={submitting}>
          {submitting ? t.ui.sending : mode === "pool" ? t.ui.sendCv : t.jobs.submit}
        </button>
        {status ? (
          <p className={`form-status${status.gap ? " gap" : ""}`} role="status" aria-live="polite" data-ok={status.ok === false ? "0" : undefined}>
            {status.text}
          </p>
        ) : (
          <p className="form-status" role="status" aria-live="polite" />
        )}
      </form>
    </>
  );
}
