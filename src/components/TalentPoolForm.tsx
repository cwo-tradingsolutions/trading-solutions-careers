"use client";

import { useRef, useState } from "react";
import { useLanguage } from "@/i18n/context";
import { AREAS } from "@/lib/areas";

/**
 * Formulario "Join us" · deja tu CV sin vacante abierta (pack rev J, Kelly P0).
 * Envía a /api/talent-pool/public, que lo guarda en el CV Bank del ATS.
 */
const MAX_BYTES = 5 * 1024 * 1024;

export default function TalentPoolForm() {
  const { t } = useLanguage();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", linkedin: "", area: "", message: "" });
  const [cv, setCv] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError(t.pool.cvTooBig);
      return;
    }
    setError(null);
    setCv(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const cv_data = cv
        ? await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(cv);
          })
        : null;
      const res = await fetch("/api/talent-pool/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, cv_filename: cv?.name ?? null, cv_data }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDone(true);
      setForm({ full_name: "", email: "", phone: "", linkedin: "", area: "", message: "" });
      setCv(null);
    } catch {
      setError(t.jobs.errorGeneric);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="pool-form done" role="status">
        <div className="ok" aria-hidden>✓</div>
        <h3>{t.pool.successTitle}</h3>
        <p>{t.pool.successBody}</p>
        <button type="button" className="btn-ghost-text" onClick={() => setDone(false)}>{t.pool.again}</button>
      </div>
    );
  }

  return (
    <form className="pool-form" onSubmit={submit}>
      <div className="row">
        <div className="field">
          <label htmlFor="pName">{t.jobs.fullName}</label>
          <input id="pName" name="full_name" type="text" required autoComplete="name" placeholder={t.jobs.fullNamePlaceholder} value={form.full_name} onChange={set} />
        </div>
        <div className="field">
          <label htmlFor="pEmail">{t.jobs.email}</label>
          <input id="pEmail" name="email" type="email" required autoComplete="email" placeholder={t.jobs.emailPlaceholder} value={form.email} onChange={set} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="pPhone">{t.jobs.phone}</label>
          <input id="pPhone" name="phone" type="tel" autoComplete="tel" placeholder={t.jobs.phonePlaceholder} value={form.phone} onChange={set} />
        </div>
        <div className="field">
          <label htmlFor="pLinkedin">{t.jobs.linkedin}</label>
          <input id="pLinkedin" name="linkedin" type="text" inputMode="url" placeholder={t.jobs.linkedinPlaceholder} value={form.linkedin} onChange={set} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pArea">{t.pool.area}</label>
        <select id="pArea" name="area" required value={form.area} onChange={set}>
          <option value="" disabled>{t.pool.areaPlaceholder}</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>{t.areas[a].title}</option>
          ))}
          <option value="other">{t.pool.areaOther}</option>
        </select>
      </div>
      <div className="field">
        <span className="lab">{t.jobs.cvLabel}</span>
        <div
          className={`drop${cv ? " has-file" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          {cv ? (
            <strong>{cv.name}</strong>
          ) : (
            <>
              {t.jobs.cvDrag} <strong>{t.jobs.cvSelect}</strong>
              <small>{t.pool.cvFormats}</small>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <div className="field">
        <label htmlFor="pMsg">{t.pool.message}</label>
        <textarea id="pMsg" name="message" placeholder={t.pool.messagePlaceholder} value={form.message} onChange={set} />
      </div>
      {error && <p role="alert" className="alert">{error}</p>}
      <button type="submit" className="btn-blue" disabled={sending}>
        {sending ? t.jobs.submitting : t.pool.submit}
      </button>
    </form>
  );
}
