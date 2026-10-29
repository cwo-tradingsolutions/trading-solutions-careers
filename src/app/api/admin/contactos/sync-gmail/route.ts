/**
 * POST /api/admin/contactos/sync-gmail
 * Body: { lote?: number, todos?: boolean, vacancy_id?: string }
 *
 * Auditoría de Gmail: pasa un lote de candidatos ACTIVOS (vacante abierta,
 * etapa en curso; o solo los de `vacancy_id`) por la bandeja y guarda en su
 * historial todo lo que se cruzó con cada uno (180 días hacia atrás).
 * Devuelve cuántos quedan; la pantalla lo llama en bucle hasta llegar a cero.
 *
 *   todos=false (por defecto): solo los que nunca se revisaron.
 *   todos=true: también los revisados hace más de 6 horas.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { isGmailConnected } from "@/lib/gmail";
import { sincronizarLote } from "@/lib/contactos";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  const gmail = await isGmailConnected();
  if (!gmail.connected) {
    return NextResponse.json(
      { error: "Gmail no está conectado o el permiso expiró. Reconéctalo en /api/google/auth." },
      { status: 503 },
    );
  }

  const b = await req.json().catch(() => ({}));
  const lote = Math.min(Math.max(parseInt(b.lote, 10) || 15, 1), 40);
  const vacancyId = typeof b.vacancy_id === "string" && b.vacancy_id ? b.vacancy_id : null;
  const r = await sincronizarLote(lote, { soloVencidosHoras: b.todos ? 6 : 0, vacancyId });
  return NextResponse.json({ ...r, buzon: gmail.email });
}
