/**
 * POST /api/admin/rejections/sync-sent
 * Body: { candidate_ids: string[] }
 *
 * Pone al día la columna de rechazados con lo que de verdad salió de Gmail.
 *
 * POR QUÉ EXISTE
 * Al rechazar, el ATS deja un borrador y el equipo lo envía desde Gmail. El
 * ATS nunca se enteraba de ese envío: en FullStack, 13 de 22 rechazados decían
 * «Sin enviar» con el correo en Enviados desde agosto. Con la ficha así no hay
 * forma de saber a quién le falta el aviso sin revisar la bandeja uno por uno.
 *
 * Qué hace: para cada rechazado sin fecha de envío, busca en Enviados su
 * correo de rechazo posterior a la fecha del rechazo. Si lo encuentra, anota
 * esa fecha. No envía ni crea nada.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { findSentRejection, isGmailConnected } from "@/lib/gmail";
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

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.candidate_ids) ? body.candidate_ids.slice(0, 200) : [];
  if (ids.length === 0) return NextResponse.json({ error: "candidate_ids vacío" }, { status: 400 });

  const gmail = await isGmailConnected();
  if (!gmail.connected) {
    return NextResponse.json(
      { error: "Gmail no está conectado o el permiso expiró. Reconéctalo en /api/google/auth." },
      { status: 503 },
    );
  }

  const { data: cands, error } = await supabaseAdmin
    .from("ht_candidates")
    .select("id, name, email, stage, rejected_at, rejection_sent_at")
    .in("id", ids)
    .eq("stage", "rechazado")
    .is("rejection_sent_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const encontrados: { id: string; name: string; sent_at: string; veces: number }[] = [];
  const faltan: { id: string; name: string; email: string | null }[] = [];
  const errores: string[] = [];

  for (const c of cands ?? []) {
    if (!c.email) {
      faltan.push({ id: c.id, name: c.name, email: null });
      continue;
    }
    const r = await findSentRejection(c.email, c.rejected_at);
    if (!r.ok) {
      errores.push(`${c.name}: ${r.error}`);
      continue;
    }
    if (r.sentAt) {
      await supabaseAdmin
        .from("ht_candidates")
        .update({ rejection_sent_at: r.sentAt, updated_at: new Date().toISOString() })
        .eq("id", c.id);
      encontrados.push({ id: c.id, name: c.name, sent_at: r.sentAt, veces: r.count });
    } else {
      faltan.push({ id: c.id, name: c.name, email: c.email });
    }
  }

  return NextResponse.json({
    revisados: (cands ?? []).length,
    ya_habian_salido: encontrados,
    sin_correo_de_rechazo: faltan,
    errores,
  });
}
