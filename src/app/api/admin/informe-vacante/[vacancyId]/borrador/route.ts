/**
 * POST /api/admin/informe-vacante/[vacancyId]/borrador
 * Body: { frase?: string, pasos?: string[] }
 *
 * Deja en Borradores de Gmail (jointheteam) un correo con el informe de la
 * vacante adjunto en PDF. SIN destinatario: el correo del líder lo escribe a
 * mano quien lo envía. Nunca envía.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { armarInforme } from "@/lib/informe-vacante/datos";
import { renderInformePdf } from "@/lib/informe-vacante/pdf";
import { baseDe, nombreArchivo, textosEditados } from "@/lib/informe-vacante/entrada";
import { createDraftWithAttachmentsViaGmail } from "@/lib/gmail";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: NextRequest, { params }: { params: { vacancyId: string } }) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;
  try {
    const body = await req.json().catch(() => ({}));
    const inf = await armarInforme(params.vacancyId);
    const { frase, pasos } = textosEditados(body, inf);
    const pdf = await renderInformePdf(inf, frase, pasos, baseDe(req.url));

    const fecha = new Date(inf.generado).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" });
    const k = inf.kpis;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:620px">
<p>Hola,</p>
<p>Te compartimos el estado de la búsqueda de <b>${esc(inf.vacante.titulo)}</b> al ${esc(fecha)}.</p>
<p>${esc(frase)}</p>
<p style="margin:16px 0 4px"><b>En números</b></p>
<ul style="margin:0 0 12px;padding-left:18px">
<li>${k.aplicaron} candidatos aplicaron y ${k.prefiltro} completaron el prefiltro.</li>
<li>${k.presentaron} de ${k.invitados} invitados presentaron las pruebas psicométricas iniciales.</li>
${k.presentaron ? `<li>${k.bandaSuperior} ${k.bandaSuperior === 1 ? "candidato está" : "candidatos están"} en la banda superior de match (${k.bandaDesde}–${k.bandaHasta} %).</li>` : ""}
</ul>
<p style="margin:16px 0 4px"><b>Próximos pasos</b></p>
<ol style="margin:0 0 12px;padding-left:18px">${pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
<p>En el informe adjunto encontrarás el embudo del proceso, los resultados de las pruebas psicométricas iniciales${inf.top10.length ? ` y el perfil breve de los ${inf.top10.length} candidatos con mejor match` : ""}.</p>
<p>Quedamos atentos para definir los siguientes pasos.</p>
<p>Cordialmente,<br><br>Talent Team · Trading Solutions</p>
</div>`;

    const r = await createDraftWithAttachmentsViaGmail({
      to: null,
      subject: `Trading Solutions · Estado de la búsqueda · ${inf.vacante.titulo} · ${fecha}`,
      html,
      fromName: "Talent Team · Trading Solutions",
      attachments: [{ filename: nombreArchivo(inf), mimeType: "application/pdf", data: pdf }],
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });

    return NextResponse.json({
      success: true,
      draft_id: r.draft_id,
      buzon: r.gmail_email,
      abrir: `https://mail.google.com/mail/?authuser=${encodeURIComponent(r.gmail_email)}#drafts`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo crear el borrador" }, { status: 500 });
  }
}
