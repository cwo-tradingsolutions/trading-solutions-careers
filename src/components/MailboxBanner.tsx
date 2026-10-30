"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AI_INTERVIEW_OFF_NOTE } from "@/lib/ai-interview-flag";

type PendingItem = {
  id: string;
  candidate: string | null;
  type: string | null;
  subject: string | null;
  created_at: string;
  error: string | null;
};

type MailboxState = {
  connected: boolean;
  pending_count: number;
  sends_today: number;
  warn_daily: boolean;
  pending: PendingItem[];
};

export function MailboxBanner() {
  const [mail, setMail] = useState<MailboxState | null>(null);
  const [aiOff, setAiOff] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [mailbox, flag] = await Promise.all([
      fetch("/api/admin/outbound-mail", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/admin/ai-interview-flag", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ enabled: false })),
    ]);
    if (mailbox && typeof mailbox.pending_count === "number") setMail(mailbox as MailboxState);
    setAiOff(flag?.enabled !== true);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function resend() {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      const r = await fetch("/api/admin/outbound-mail/resend", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (j.status === "mailbox_disconnected") {
        setNote("El buzón sigue desconectado. Los pendientes no se enviaron.");
      } else {
        setNote(`Enviados: ${j.sent ?? 0}. Siguen pendientes: ${j.still_pending ?? 0}.`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  const showDisconnect = mail && !mail.connected;
  const showWarn = Boolean(mail?.warn_daily);
  const pending = mail?.pending ?? [];

  return (
    <div className="mb-4 space-y-2">
      {aiOff && (
        <p className="text-xs text-gray-600">{AI_INTERVIEW_OFF_NOTE}</p>
      )}
      {showDisconnect && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Buzón jointheteam@ desconectado — {mail.pending_count} correos pendientes.{" "}
          <a href="/api/google/auth" className="font-semibold underline">Reconectar</a>
          {showWarn && (
            <span className="block mt-1 font-semibold">Más de 1500 envíos hoy ({mail.sends_today}).</span>
          )}
        </div>
      )}
      {!showDisconnect && showWarn && mail && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Más de 1500 envíos hoy ({mail.sends_today}).
        </div>
      )}
      {pending.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="font-semibold">Correos pendientes</div>
            <button
              type="button"
              onClick={resend}
              disabled={busy || !mail?.connected}
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-900 text-white disabled:opacity-50"
            >
              {busy ? "Enviando…" : "Reenviar pendientes"}
            </button>
          </div>
          <ul className="space-y-1 text-xs text-gray-700">
            {pending.map((row) => (
              <li key={row.id}>
                <span className="font-medium">{row.candidate || "sin destinatario"}</span>
                {" · "}{row.type || "correo"}
                {" · "}{row.subject || "sin asunto"}
              </li>
            ))}
          </ul>
          {note && <p className="mt-2 text-xs text-gray-600">{note}</p>}
        </div>
      )}
    </div>
  );
}
