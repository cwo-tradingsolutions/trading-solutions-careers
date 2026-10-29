"use client";

import React, { useEffect, useState } from "react";
import {
  DEFAULT_DURATION_MIN,
  DEFAULT_HM_EMAIL,
  DEFAULT_HM_NAME,
  DEFAULT_TZ,
  DEFAULT_WELLNESS_INTERVIEWER_EMAIL,
  DEFAULT_WELLNESS_INTERVIEWER_NAME,
  RECONNECT_CALENDAR_LABEL,
  RECONNECT_CALENDAR_PATH,
} from "@/lib/interview-invite";

type Round = "wellness" | "hm";

type Suppressed = { email: string; role: "candidate" | "interviewer" };

export type InviteResult = {
  success: boolean;
  sent: boolean;
  persisted?: boolean;
  action: "refuse" | "dry_run" | "send" | "blocked_scope";
  error?: string | null;
  note?: string | null;
  record_error?: string | null;
  suppressed?: Suppressed[];
  from?: string;
  email?: { to: string[]; subject: string; html: string };
  event?: unknown;
  meet_url?: string | null;
  reconnect?: { label: string; href: string } | null;
};

type LoadState = {
  wellness_exists: boolean;
  table_ready: boolean;
  candidate_tz: string | null;
  google: { connected: boolean; calendar_scope_ok: boolean; email?: string; connect_label?: string };
  preview: { active: boolean; allowlist_configured: boolean; allowlist_expected?: string };
  defaults: {
    tz: string;
    duration_min: number;
    hm_name: string;
    hm_email: string;
    wellness_interviewer_name: string;
    wellness_interviewer_email: string;
  };
};

const TIMEZONES = [
  "America/Bogota",
  "America/Panama",
  "America/Mexico_City",
  "America/New_York",
  "Europe/Madrid",
  "Asia/Shanghai",
];

function tomorrow(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return t.toISOString().slice(0, 10);
}

export function InvitarEntrevistaModal({
  candidateId,
  candidateName,
  onClose,
  embedded = false,
  fixture,
}: {
  candidateId: string;
  candidateName: string;
  onClose?: () => void;
  embedded?: boolean;
  fixture?: { load: LoadState; result?: InviteResult };
}) {
  const [load, setLoad] = useState<LoadState | null>(fixture?.load ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [round, setRound] = useState<Round>("wellness");
  const [date, setDate] = useState(tomorrow());
  const [time, setTime] = useState("10:00");
  const [tz, setTz] = useState(DEFAULT_TZ);
  const [duration, setDuration] = useState(String(DEFAULT_DURATION_MIN));
  const [interviewerName, setInterviewerName] = useState(DEFAULT_WELLNESS_INTERVIEWER_NAME);
  const [interviewerEmail, setInterviewerEmail] = useState(DEFAULT_WELLNESS_INTERVIEWER_EMAIL);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(fixture?.result ?? null);

  useEffect(() => {
    if (fixture) return;
    let cancel = false;
    fetch(`/api/headhunting/candidates/${candidateId}/interview-invite`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "No se pudo abrir la invitación");
        if (cancel) return;
        setLoad({
          wellness_exists: j.wellness_exists,
          table_ready: j.table_ready,
          candidate_tz: j.candidate?.candidate_tz ?? null,
          google: j.google,
          preview: j.preview,
          defaults: j.defaults,
        });
        setTz(j.defaults?.tz || DEFAULT_TZ);
        setDuration(String(j.defaults?.duration_min || DEFAULT_DURATION_MIN));
        setInterviewerName(j.defaults?.wellness_interviewer_name || DEFAULT_WELLNESS_INTERVIEWER_NAME);
        setInterviewerEmail(j.defaults?.wellness_interviewer_email || DEFAULT_WELLNESS_INTERVIEWER_EMAIL);
      })
      .catch((e) => {
        if (!cancel) setLoadError(e.message);
      });
    return () => {
      cancel = true;
    };
  }, [candidateId, fixture]);

  function applyRound(next: Round) {
    setRound(next);
    setResult(null);
    if (dirty) return;
    const d = load?.defaults;
    if (next === "hm") {
      setInterviewerName(d?.hm_name || DEFAULT_HM_NAME);
      setInterviewerEmail(d?.hm_email || DEFAULT_HM_EMAIL);
    } else {
      setInterviewerName(d?.wellness_interviewer_name || DEFAULT_WELLNESS_INTERVIEWER_NAME);
      setInterviewerEmail(d?.wellness_interviewer_email || DEFAULT_WELLNESS_INTERVIEWER_EMAIL);
    }
  }

  const hmBlocked = round === "hm" && load != null && !load.wellness_exists;
  const previewConnectLabel = load && !load.google.connected ? load.google.connect_label : undefined;
  const needsReconnect = load != null && !load.google.calendar_scope_ok && !previewConnectLabel;

  async function submit() {
    if (fixture) return;
    setFormError(null);
    setResult(null);
    if (!date) return setFormError("La fecha de la entrevista es obligatoria.");
    if (!time) return setFormError("La hora de la entrevista es obligatoria.");
    if (!tz) return setFormError("La zona horaria es obligatoria.");
    if (!duration) return setFormError("La duración es obligatoria.");
    if (!interviewerName.trim() || !interviewerEmail.trim()) {
      return setFormError("El entrevistador es obligatorio.");
    }
    if (hmBlocked) return setFormError("Primero tiene que existir la entrevista de Wellness.");
    setSubmitting(true);
    try {
      const r = await fetch(`/api/headhunting/candidates/${candidateId}/interview-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round,
          date,
          time,
          tz,
          duration_min: Number(duration),
          interviewer_name: interviewerName.trim(),
          interviewer_email: interviewerEmail.trim(),
        }),
      });
      const j = (await r.json()) as InviteResult & { error?: string };
      if (!j.email && !j.success) {
        setFormError(j.error || "No se pudo invitar");
        if (j.reconnect || j.action === "blocked_scope") setResult(j);
        return;
      }
      setResult(j);
      if (j.error && j.action !== "dry_run") setFormError(j.error);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const card = (
    <div className={embedded ? "bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" : "bg-white rounded-xl shadow-2xl w-full max-w-2xl my-4 overflow-hidden"} onClick={(e) => e.stopPropagation()}>
      <div className="bg-black text-white px-5 py-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold opacity-70">Invitar a entrevista</div>
          <div className="text-base font-extrabold leading-tight">{candidateName}</div>
        </div>
        {!embedded && (
          <button onClick={() => onClose?.()} className="text-white/80 hover:text-white text-xl px-2" type="button">×</button>
        )}
      </div>

      <div className={embedded ? "p-5 space-y-4" : "p-5 space-y-4 max-h-[78vh] overflow-y-auto"}>
        {loadError && <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">{loadError}</div>}
        {!load && !loadError && <div className="text-xs text-gray-500">Cargando…</div>}

        {previewConnectLabel && (
          <a
            href={RECONNECT_CALENDAR_PATH}
            className="block bg-amber-50 border border-amber-300 text-amber-950 rounded-lg px-3 py-2 text-sm font-semibold"
          >
            {previewConnectLabel}
          </a>
        )}

        {load && needsReconnect && (
          <a
            href={RECONNECT_CALENDAR_PATH}
            className="block bg-amber-50 border border-amber-300 text-amber-950 rounded-lg px-3 py-2 text-sm font-semibold"
          >
            {RECONNECT_CALENDAR_LABEL}
          </a>
        )}

        {load?.preview.active && !load.preview.allowlist_configured && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-950">
            Este preview no envía hasta definir <code>INTERVIEW_TEST_RECIPIENTS={load.preview.allowlist_expected}</code>.
          </div>
        )}

        {load && !load.table_ready && (
          <div className="text-[11px] text-gray-500">
            La tabla ht_interviews todavía no está en la base. La migración no se aplica desde el preview, así que una ficha real solo muestra la vista previa.
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="text-[10px] uppercase font-bold text-gray-500">Ronda</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="round" checked={round === "wellness"} onChange={() => applyRound("wellness")} />
            Wellness · Talent Acquisition + inglés
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="round" checked={round === "hm"} onChange={() => applyRound("hm")} />
            Hiring Manager
          </label>
          {hmBlocked && (
            <p className="text-xs text-red-700">
              La entrevista con el Hiring Manager solo se habilita cuando ya existe la de Wellness.
            </p>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
          </Field>
          <Field label="Hora">
            <input required type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
          </Field>
          <Field label="Zona horaria">
            <select required value={tz} onChange={(e) => setTz(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </Field>
          <Field label="Duración (min)">
            <select required value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
              {[30, 45, 60, 90].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
          <Field label="Entrevistador">
            <input
              required
              value={interviewerName}
              onChange={(e) => { setDirty(true); setInterviewerName(e.target.value); }}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Correo del entrevistador">
            <input
              required
              type="email"
              value={interviewerEmail}
              onChange={(e) => { setDirty(true); setInterviewerEmail(e.target.value); }}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
        {load?.candidate_tz && (
          <p className="text-[11px] text-gray-500">
            El correo muestra la hora en {tz} y también en la zona del candidato ({load.candidate_tz}).
          </p>
        )}

        {formError && <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">{formError}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          {!embedded && (
            <button type="button" onClick={() => onClose?.()} className="text-xs font-bold text-gray-500 px-4 py-2">Cancelar</button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={submitting || hmBlocked || !load}
            className="bg-black hover:bg-gray-800 disabled:bg-gray-300 text-white text-xs font-bold px-5 py-2 rounded-lg"
          >
            {submitting ? "Enviando…" : "Enviar invitación"}
          </button>
        </div>

        {result && <ResultPanel result={result} />}
      </div>
    </div>
  );

  if (embedded) return card;
  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-start justify-center pt-[6vh] px-4 overflow-y-auto" onClick={() => onClose?.()}>
      {card}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase font-bold text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function ResultPanel({ result }: { result: InviteResult }) {
  const suppressed = result.suppressed || [];
  return (
    <div className="space-y-3 border-t border-gray-100 pt-3">
      {result.action === "dry_run" && (
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-950">
          {result.note || "Vista previa. No se envió nada y no se escribió en la base."}
        </div>
      )}
      {result.sent && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-950">
          Invitación enviada{result.meet_url ? ` · ${result.meet_url}` : ""}.
          {result.record_error ? ` Registro: ${result.record_error}` : ""}
        </div>
      )}
      {result.reconnect && result.action === "blocked_scope" && (
        <a href={result.reconnect.href} className="block text-sm font-semibold text-amber-900">
          {result.reconnect.label || RECONNECT_CALENDAR_LABEL}
        </a>
      )}
      {suppressed.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-950">
          <div className="font-bold mb-1">Estas direcciones no reciben nada</div>
          <ul className="list-disc pl-4">
            {suppressed.map((s) => (
              <li key={`${s.role}-${s.email}`}>
                {s.email} · {s.role === "candidate" ? "candidato" : "entrevistador"}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.from && (
        <p className="text-[11px] text-gray-600">From: {result.from}</p>
      )}
      {result.email?.subject && (
        <p className="text-xs font-semibold text-gray-800">{result.email.subject}</p>
      )}
      {result.email?.html && (
        <iframe title="Correo de invitación" sandbox="" srcDoc={result.email.html} className="w-full h-80 border border-gray-200 rounded bg-white" />
      )}
      {result.event != null && (
        <pre className="text-[10px] bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(result.event, null, 2)}</pre>
      )}
    </div>
  );
}
