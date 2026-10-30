/**
 * GET  /api/admin/candidates/[candidateId]/contactos
 *      Historial completo del candidato: cada correo, cada WhatsApp, cada
 *      contacto anotado y cada cambio de etapa, en orden.
 *      Antes de responder pone al día Gmail si la última revisión tiene más de
 *      30 minutos (?sync=0 para saltarlo).
 *
 * POST /api/admin/candidates/[candidateId]/contactos
 *      Anota un contacto que no pasa por Gmail: una llamada, una conversación
 *      en la oficina, o el clic en un botón de WhatsApp del ATS.
 *      Body: { channel, direction, occurred_at?, summary?, body?, kind?,
 *              source?: 'manual' | 'whatsapp_boton' }
 */
import { NextRequest, NextResponse } from "next/server";
import { adminSessionEmail, requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { guardarContactos, huella, sincronizarGmailCandidato, type Canal, type Direccion } from "@/lib/contactos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CANALES: Canal[] = ["email", "whatsapp", "llamada", "presencial", "otro"];
const DIRECCIONES: Direccion[] = ["saliente", "entrante"];

export async function GET(req: NextRequest, { params }: { params: { candidateId: string } }) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { data: cand, error } = await supabaseAdmin
    .from("ht_candidates")
    .select("id, name, email, vacancy_id, contactos_sync_at")
    .eq("id", params.candidateId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!cand) return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });

  // Gmail al día antes de mostrar: lo que se envió desde la bandeja hace diez
  // minutos tiene que aparecer, o el historial miente por omisión.
  let sync: { ok: boolean; nuevos?: number; error?: string } | null = null;
  const vencido =
    !cand.contactos_sync_at || Date.now() - new Date(cand.contactos_sync_at).getTime() > 30 * 60_000;
  if (req.nextUrl.searchParams.get("sync") !== "0" && vencido) {
    const r = await sincronizarGmailCandidato(cand);
    sync = r.ok ? { ok: true, nuevos: r.nuevos } : { ok: false, error: r.error };
  }

  const [{ data: contactos, error: e1 }, { data: etapas }] = await Promise.all([
    supabaseAdmin
      .from("ht_contact_events")
      .select("id, channel, direction, kind, occurred_at, summary, body, source, status, thread_id, created_by")
      .eq("candidate_id", params.candidateId)
      .order("occurred_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("ht_candidate_stage_events")
      .select("id, from_stage, to_stage, changed_at, source")
      .eq("candidate_id", params.candidateId)
      .order("changed_at", { ascending: false })
      .limit(200),
  ]);
  if (e1) {
    const falta = /ht_contact_events/.test(e1.message) && /does not exist|not find/.test(e1.message);
    return NextResponse.json(
      {
        error: falta
          ? "Falta correr sql/20260921_historial_contactos.sql en Supabase."
          : e1.message,
      },
      { status: 500 },
    );
  }

  const linea = [
    ...(contactos ?? []).map((c) => ({ tipo: "contacto" as const, at: c.occurred_at, ...c })),
    ...(etapas ?? []).map((e) => ({ tipo: "etapa" as const, at: e.changed_at, ...e })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return NextResponse.json(
    {
      candidato: { id: cand.id, name: cand.name, email: cand.email },
      sync,
      gmail_revisado: sync?.ok ? new Date().toISOString() : cand.contactos_sync_at,
      linea,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest, { params }: { params: { candidateId: string } }) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const b = await req.json().catch(() => ({}));
  const channel = b.channel as Canal;
  const direction = b.direction as Direccion;
  const source = b.source === "whatsapp_boton" ? "whatsapp_boton" : "manual";
  if (!CANALES.includes(channel)) return NextResponse.json({ error: "channel inválido" }, { status: 400 });
  if (!DIRECCIONES.includes(direction)) return NextResponse.json({ error: "direction inválida" }, { status: 400 });

  const occurred = b.occurred_at ? new Date(b.occurred_at) : new Date();
  if (Number.isNaN(occurred.getTime())) return NextResponse.json({ error: "occurred_at inválida" }, { status: 400 });
  if (occurred.getTime() > Date.now() + 5 * 60_000) {
    return NextResponse.json({ error: "La fecha del contacto no puede ser futura" }, { status: 400 });
  }

  const summary = String(b.summary ?? "").trim().slice(0, 500) || null;
  if (source === "manual" && !summary) {
    return NextResponse.json({ error: "Escribe qué se habló: sin eso el registro no dice nada" }, { status: 400 });
  }

  const { data: cand } = await supabaseAdmin
    .from("ht_candidates")
    .select("id, vacancy_id")
    .eq("id", params.candidateId)
    .maybeSingle();
  if (!cand) return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });

  const r = await guardarContactos([
    {
      candidate_id: cand.id,
      vacancy_id: cand.vacancy_id ?? null,
      channel,
      direction,
      kind: b.kind ? String(b.kind).slice(0, 60) : null,
      occurred_at: occurred.toISOString(),
      summary,
      body: b.body ? String(b.body).slice(0, 20_000) : null,
      source,
      // Manual sin id externo: cada anotación es su propia fila.
      external_id: source === "whatsapp_boton" ? huella(cand.id, occurred.toISOString(), summary) : null,
      // Abrir WhatsApp no prueba que se envió: lo confirma el chat importado.
      status: source === "whatsapp_boton" ? "intento" : "confirmado",
      created_by: adminSessionEmail(req) || "hr-admin",
    },
  ]);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ success: true });
}
