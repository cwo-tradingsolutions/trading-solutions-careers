/**
 * POST /api/admin/informe-vacante/[vacancyId]/pdf
 * Body: { frase?: string, pasos?: string[] }
 *
 * Devuelve el PDF del informe de vacante con los datos del momento y los
 * textos que se editaron en pantalla.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { armarInforme } from "@/lib/informe-vacante/datos";
import { renderInformePdf } from "@/lib/informe-vacante/pdf";
import { baseDe, nombreArchivo, textosEditados } from "@/lib/informe-vacante/entrada";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nombreArchivo(inf)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo generar el PDF" }, { status: 500 });
  }
}
