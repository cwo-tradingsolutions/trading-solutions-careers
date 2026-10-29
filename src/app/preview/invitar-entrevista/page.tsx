import { notFound } from "next/navigation";
import { InvitarEntrevistaModal } from "@/components/InvitarEntrevistaModal";
import {
  buildInviteArtifacts,
  RECONNECT_CALENDAR_LABEL,
} from "@/lib/interview-invite";

export const dynamic = "force-dynamic";

/**
 * Fixture de la invitación. No llama a Gmail, Calendar ni a la base.
 * En producción responde 404. Sirve para revisar el modal y el correo EN/ES
 * en el deployment de preview.
 */
export default function InvitarEntrevistaPreviewPage({
  searchParams,
}: {
  searchParams?: { parte?: string };
}) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const parte = searchParams?.parte || "todo";

  const when = new Date("2026-11-04T15:00:00.000Z");
  const meet = "https://meet.google.com/abc-defg-hij";
  const es = buildInviteArtifacts({
    lang: "es",
    firstName: "Ana",
    vacancyTitle: "Analista de precios",
    round: "wellness",
    when,
    tz: "America/Bogota",
    durationMin: 45,
    interviewerName: "Talent Acquisition Team",
    meetUrl: meet,
    attendees: ["jointheteam@tradingsolutions.com"],
    requestId: "preview-es",
  });
  const en = buildInviteArtifacts({
    lang: "en",
    firstName: "Wei",
    vacancyTitle: "Builder",
    round: "hm",
    when,
    tz: "America/Bogota",
    durationMin: 45,
    interviewerName: "Jaime",
    meetUrl: meet,
    candidateTz: "Asia/Shanghai",
    attendees: ["cwo@tradingsolutions.com"],
    requestId: "preview-en",
  });

  return (
    <main className="bg-gray-100 min-h-screen p-6 space-y-8">
      {(parte === "todo" || parte === "modal") && (
      <p className="text-xs text-gray-600 max-w-2xl">
        PREVIEW FIXTURE · no envía correos. Allowlist: cwo@tradingsolutions.com, jointheteam@tradingsolutions.com.
        coo@ queda suprimido.
      </p>
      )}
      {(parte === "todo" || parte === "modal") && (
      <InvitarEntrevistaModal
        embedded
        candidateId="preview"
        candidateName="Ana Restrepo"
        fixture={{
          load: {
            wellness_exists: false,
            table_ready: false,
            candidate_tz: null,
            google: { connected: true, calendar_scope_ok: false, email: "jointheteam@tradingsolutions.com" },
            preview: {
              active: true,
              allowlist_configured: true,
              allowlist_expected: "cwo@tradingsolutions.com,jointheteam@tradingsolutions.com",
            },
            defaults: {
              tz: "America/Bogota",
              duration_min: 45,
              hm_name: "Jaime",
              hm_email: "coo@tradingsolutions.com",
              wellness_interviewer_name: "Talent Acquisition Team",
              wellness_interviewer_email: "jointheteam@tradingsolutions.com",
            },
          },
          result: {
            success: true,
            sent: false,
            persisted: false,
            action: "dry_run",
            note: "Vista previa. No se envió correo, no se creó el evento y no se escribió la invitación.",
            suppressed: [
              { email: "ana.real@gmail.com", role: "candidate" },
              { email: "coo@tradingsolutions.com", role: "interviewer" },
            ],
            from: es.from,
            email: { to: [], subject: es.subject, html: es.html },
            event: es.event,
            meet_url: null,
            reconnect: { label: RECONNECT_CALENDAR_LABEL, href: "/api/google/auth" },
          },
        }}
      />
      )}

      {(parte === "todo" || parte === "es") && (
      <section className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        <h2 className="text-sm font-bold">Correo en español</h2>
        <p className="text-xs text-gray-600">From: {es.from}</p>
        <p className="text-xs font-semibold">{es.subject}</p>
        <iframe title="Correo ES" sandbox="" srcDoc={es.html} className="w-full h-[640px] border border-gray-200 rounded" />
      </section>
      )}

      {(parte === "todo" || parte === "en") && (
      <section className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        <h2 className="text-sm font-bold">Correo en inglés</h2>
        <p className="text-xs text-gray-600">From: {en.from}</p>
        <p className="text-xs font-semibold">{en.subject}</p>
        <iframe title="Correo EN" sandbox="" srcDoc={en.html} className="w-full h-[640px] border border-gray-200 rounded" />
      </section>
      )}
    </main>
  );
}
