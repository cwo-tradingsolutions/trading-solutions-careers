/**
 * POST /api/linkedin/webhook
 * Endpoint que LinkedIn llama en tiempo real cuando un candidato
 * aplica vía Easy Apply (Recruiter System Connect - RSC).
 *
 * Requiere aprobación de LinkedIn Talent Solutions para recibir eventos.
 * LinkedIn firma el body con HMAC-SHA256 usando el client_secret.
 *
 * Cuando la aplicación entra, este handler:
 *   1. Valida la firma
 *   2. Normaliza el payload de LinkedIn al schema interno (applications)
 *   3. Dispara el Intake Agent → CV Parser → Screening pipeline
 *   4. Responde 200 OK a LinkedIn (si no, reintenta exponencialmente)
 */
import { NextResponse } from "next/server";
import { verifyRSCSignature, type LinkedInApplication } from "@/lib/linkedin";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const bodyText = await request.text();
  const signature = request.headers.get("x-li-signature") ?? "";
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET ?? "";

  if (!verifyRSCSignature(bodyText, signature, clientSecret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: { events?: LinkedInApplication[] };
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const events = payload.events ?? [];
  for (const event of events) {
    // TODO: persistir en tu DB (Postgres/Vercel KV) y emitir a los agentes
    //   await db.insert(applications).values({
    //     source: 'linkedin_easy_apply',
    //     linkedinApplicationId: event.applicationId,
    //     jobPostingId: event.jobPostingId,
    //     submittedAt: event.submittedAt,
    //     candidate: event.candidate,
    //     resumeUrl: event.resume?.fileUrl,
    //     answers: event.answers,
    //   });
    //   await agents.intake.handle(event);

    // Log minimal por ahora para que veas entrando eventos:
    console.log("[LI RSC] new Easy Apply", {
      applicationId: event.applicationId,
      jobPostingId: event.jobPostingId,
      candidate: `${event.candidate.firstName} ${event.candidate.lastName}`,
      email: event.candidate.email,
    });
  }

  return NextResponse.json({ ok: true, processed: events.length });
}

// LinkedIn requiere también un GET para validar el endpoint al registrarlo.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const challenge = url.searchParams.get("challenge");
  if (challenge) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ ok: true, endpoint: "linkedin-rsc-webhook" });
}
