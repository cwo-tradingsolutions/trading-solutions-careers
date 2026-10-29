/**
 * POST /api/admin/candidates/[candidateId]/contactos/whatsapp
 *
 * Importa al historial del candidato el chat de WhatsApp exportado desde el
 * celular (WhatsApp → chat → Exportar chat → Sin archivos).
 *
 * Body: { texto: string, nosotros?: string, dry_run?: boolean }
 *   - dry_run: lee el chat y devuelve quiénes escriben y cuántos mensajes hay,
 *     sin guardar. La pantalla lo usa para que quien importa confirme cuál de
 *     los autores es el equipo: en el archivo cada persona aparece con el
 *     nombre que tiene en los contactos del celular.
 *   - nosotros: el autor que es el equipo. Sus mensajes quedan como salientes;
 *     los demás, como entrantes.
 *
 * Volver a importar el mismo chat (o uno más largo) no duplica: cada mensaje
 * tiene una huella de fecha + autor + texto.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { adivinarNosotros, guardarContactos, huella, leerChatWhatsapp, type ContactoNuevo } from "@/lib/contactos";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: { candidateId: string } }) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  const b = await req.json().catch(() => ({}));
  const texto = typeof b.texto === "string" ? b.texto : "";
  if (!texto.trim()) return NextResponse.json({ error: "El archivo del chat está vacío" }, { status: 400 });
  if (texto.length > MAX_BYTES) return NextResponse.json({ error: "El chat supera 3 MB" }, { status: 413 });

  const { data: cand } = await supabaseAdmin
    .from("ht_candidates")
    .select("id, name, vacancy_id")
    .eq("id", params.candidateId)
    .maybeSingle();
  if (!cand) return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });

  const mensajes = leerChatWhatsapp(texto);
  if (mensajes.length === 0) {
    return NextResponse.json(
      {
        error:
          "No se reconoció ningún mensaje. Tiene que ser el .txt que genera «Exportar chat» de WhatsApp; " +
          "si el celular lo entregó en .zip, descomprímelo primero.",
      },
      { status: 422 },
    );
  }

  const autores = [...new Set(mensajes.map((m) => m.autor))].map((autor) => ({
    autor,
    mensajes: mensajes.filter((m) => m.autor === autor).length,
  }));
  const sugerido = adivinarNosotros(mensajes);
  const desde = mensajes[0].at;
  const hasta = mensajes[mensajes.length - 1].at;

  if (b.dry_run || !b.nosotros) {
    return NextResponse.json({ dry_run: true, total: mensajes.length, autores, sugerido, desde, hasta });
  }

  const nosotros = String(b.nosotros);
  if (!autores.some((a) => a.autor === nosotros)) {
    return NextResponse.json({ error: `«${nosotros}» no aparece en este chat` }, { status: 400 });
  }

  const filas: ContactoNuevo[] = mensajes.map((m) => ({
    candidate_id: cand.id,
    vacancy_id: cand.vacancy_id ?? null,
    channel: "whatsapp",
    direction: m.autor === nosotros ? "saliente" : "entrante",
    kind: m.autor === nosotros ? null : "respuesta",
    occurred_at: m.at,
    summary: m.texto.replace(/\s+/g, " ").slice(0, 280),
    body: m.texto.slice(0, 20_000),
    source: "whatsapp_export",
    external_id: huella(cand.id, m.at, m.autor, m.texto),
    status: "confirmado",
    created_by: `whatsapp:${m.autor}`,
  }));

  // Por tandas: un chat largo son cientos de filas.
  let nuevos = 0;
  for (let i = 0; i < filas.length; i += 200) {
    const r = await guardarContactos(filas.slice(i, i + 200));
    if (r.error) return NextResponse.json({ error: r.error, guardados: nuevos }, { status: 500 });
    nuevos += r.nuevos;
  }

  // Los clics en el botón de WhatsApp de este rango quedan confirmados por el
  // chat: ya no son «intento».
  await supabaseAdmin
    .from("ht_contact_events")
    .update({ status: "confirmado" })
    .eq("candidate_id", cand.id)
    .eq("source", "whatsapp_boton")
    .eq("status", "intento")
    .gte("occurred_at", new Date(new Date(desde).getTime() - 3_600_000).toISOString())
    .lte("occurred_at", new Date(new Date(hasta).getTime() + 3_600_000).toISOString());

  return NextResponse.json({
    success: true,
    total: mensajes.length,
    nuevos,
    ya_estaban: mensajes.length - nuevos,
    desde,
    hasta,
  });
}
