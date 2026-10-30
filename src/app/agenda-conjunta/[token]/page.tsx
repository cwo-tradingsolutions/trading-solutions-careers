"use client";

/**
 * Página pública de agendamiento conjunto · candidato elige slot donde TODOS
 * los entrevistadores están disponibles. Reemplaza Calendly Collective.
 *
 * URL: /agenda-conjunta/[token]
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Slot = { start: string; end: string };
type SessionInfo = {
  candidate_name: string;
  vacancy_title: string | null;
  interviewer_names: string[];
  interviewer_emails: string[];
  duration_minutes: number;
  timezone: string;
  description: string | null;
};

export default function AgendaConjuntaPage() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<{ session: SessionInfo; slots: Slot[]; slot_errors?: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState<{ meet_url: string; slot_start: string } | null>(null);
  const [alreadyScheduled, setAlreadyScheduled] = useState<any>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/joint-schedulings/${token}`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (j.already_scheduled) {
          setAlreadyScheduled(j.session);
        } else if (j.error) {
          setError(j.error === "expired" ? "Este enlace ya expiró. Por favor escribe a Talent Acquisition Team para generar uno nuevo." :
                   j.error === "invalid_token" ? "Enlace no válido." :
                   j.detail || j.error);
        } else {
          setData(j);
        }
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [token]);

  async function bookSlot() {
    if (!selectedSlot) return;
    setBooking(true);
    try {
      const r = await fetch(`/api/joint-schedulings/${token}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot_start: selectedSlot.start, slot_end: selectedSlot.end }),
      });
      const j = await r.json();
      if (j.success) {
        setConfirmed({ meet_url: j.meet_url, slot_start: j.slot_start });
      } else {
        setError(j.detail || j.error || "Error al agendar");
      }
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setBooking(false);
    }
  }

  if (loading) {
    return <CenteredCard><div className="text-sm text-gray-500">Cargando disponibilidad…</div></CenteredCard>;
  }

  if (alreadyScheduled) {
    return (
      <CenteredCard>
        <div className="text-center">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-2xl font-extrabold mb-3">Entrevista ya agendada</h2>
          <p className="text-sm text-gray-600 mb-4">
            Tu entrevista está confirmada para el {formatDateLong(alreadyScheduled.scheduled_slot_start)}
            con {(alreadyScheduled.interviewer_names || []).join(" y ")}.
          </p>
          {alreadyScheduled.meet_url && (
            <a href={alreadyScheduled.meet_url} target="_blank" rel="noopener noreferrer" className="inline-block bg-black text-white text-sm font-bold px-6 py-3 rounded-full">
              Abrir Google Meet →
            </a>
          )}
        </div>
      </CenteredCard>
    );
  }

  if (confirmed) {
    return (
      <CenteredCard>
        <div className="text-center">
          <div className="text-5xl mb-3">🎉</div>
          <h2 className="text-2xl font-extrabold mb-3">¡Listo!</h2>
          <p className="text-sm text-gray-600 mb-2">
            Tu entrevista está agendada para el <strong>{formatDateLong(confirmed.slot_start)}</strong>.
          </p>
          <p className="text-xs text-gray-500 mb-5">
            Recibirás un correo de confirmación con el enlace de Google Meet en los próximos segundos.
          </p>
          {confirmed.meet_url && (
            <a href={confirmed.meet_url} target="_blank" rel="noopener noreferrer" className="inline-block bg-black text-white text-sm font-bold px-6 py-3 rounded-full hover:bg-gray-800">
              Abrir Google Meet →
            </a>
          )}
        </div>
      </CenteredCard>
    );
  }

  if (error) {
    return (
      <CenteredCard>
        <div className="text-center">
          <div className="text-5xl mb-3">😕</div>
          <h2 className="text-xl font-bold mb-2">No pudimos abrir tu agenda</h2>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </CenteredCard>
    );
  }

  if (!data) return null;

  // Agrupar slots por día
  const slotsByDay: Record<string, Slot[]> = {};
  for (const s of data.slots) {
    const d = new Date(s.start).toLocaleDateString("es-CO", { timeZone: data.session.timezone, weekday: "long", day: "numeric", month: "long" });
    if (!slotsByDay[d]) slotsByDay[d] = [];
    slotsByDay[d].push(s);
  }

  const interviewerList = (data.session.interviewer_names && data.session.interviewer_names.length > 0
    ? data.session.interviewer_names
    : data.session.interviewer_emails).join(" y ");

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-black text-white rounded-t-xl px-6 py-4">
          <div className="text-[10px] tracking-[2.5px] font-extrabold opacity-80">TRADING SOLUTIONS</div>
          <div className="text-xs text-white/70 mt-0.5">Agendar entrevista · {data.session.vacancy_title || "Proceso de selección"}</div>
        </div>

        {/* Body */}
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6 sm:p-8 shadow-sm">
          <h1 className="text-2xl font-extrabold mb-2">Hola {data.session.candidate_name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-gray-600 mb-2">
            Elige el horario que mejor te funcione para una conversación de <strong>{data.session.duration_minutes} minutos</strong> con{" "}
            <strong>{interviewerList}</strong>.
          </p>
          <p className="text-xs text-gray-500 mb-5">
            Solo verás horarios donde todos están disponibles. Una vez elijas, se generará la videollamada de Google Meet automáticamente y recibirás la confirmación por correo.
          </p>

          {data.slots.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded p-4 text-sm text-amber-800">
              No hay horarios disponibles en los próximos días donde todos los entrevistadores coincidan. Por favor escríbele a Talent Acquisition Team para coordinar manualmente.
              {data.slot_errors && Object.keys(data.slot_errors).length > 0 && (
                <div className="mt-2 text-xs text-amber-700">
                  Nota técnica: algunos calendarios no se pudieron leer. Talent Acquisition Team va a verificar.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(slotsByDay).map(([day, slots]) => (
                <div key={day}>
                  <div className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-2">{day}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map(slot => {
                      const isSelected = selectedSlot?.start === slot.start;
                      return (
                        <button
                          key={slot.start}
                          onClick={() => setSelectedSlot(slot)}
                          className={`text-sm font-semibold border-2 px-3 py-2.5 rounded-lg transition-all ${
                            isSelected
                              ? "bg-black text-white border-black"
                              : "border-gray-200 text-gray-800 hover:border-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          {formatTime(slot.start, data.session.timezone)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedSlot && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="text-[11px] uppercase font-bold tracking-wide text-gray-500">Vas a agendar</div>
                <div className="text-sm mt-1">
                  <strong>{formatDateLong(selectedSlot.start)}</strong> · {data.session.duration_minutes} min con {interviewerList}
                </div>
              </div>
              <button
                onClick={bookSlot}
                disabled={booking}
                className="w-full bg-black text-white text-sm font-bold py-3 rounded-lg hover:bg-gray-800 disabled:bg-gray-400"
              >
                {booking ? "Confirmando…" : "Confirmar agendamiento"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-md w-full shadow-sm">{children}</div>
    </div>
  );
}

function formatTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
}
function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "full", timeStyle: "short" });
}
