/**
 * GET  /api/vacancies/[id]/postings — en qué fuentes está publicada
 * POST /api/vacancies/[id]/postings — registrar que se publicó en una
 * DELETE ?source=  — dar de baja el registro de una fuente
 *
 * Nota: [id] acá es el id de ht_vacancies (uuid), no el de Neon.
 *
 * POR QUÉ ESTO ES UN REGISTRO Y NO UNA PUBLICACIÓN AUTOMÁTICA
 * Hoy se publica a mano en LinkedIn, Turpial y Magneto. LinkedIn tiene API
 * pero exige el producto Job Posting de Talent Solutions, que se aprueba
 * comercialmente; Turpial y Magneto no tienen nada construido. Fingir que el
 * botón publica sería peor que no tenerlo: alguien confiaría y la vacante no
 * estaría en ningún lado.
 *
 * Lo que sí resuelve: hoy no queda registro de dónde se publicó, así que la
 * pregunta "¿de qué fuente llega la gente que sirve?" no tiene respuesta.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { normalizarClaveFuente, validarFuente } from "@/lib/recruitment-sources";
import { cargarFuentes } from "@/lib/recruitment-sources-db";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from("ht_vacancy_postings")
    .select("id, source, posted_at, posted_by, external_url, notes")
    .eq("vacancy_id", params.id)
    .order("posted_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const publicadas = new Set((data || []).map((p: any) => p.source));
  const { fuentes, desde } = await cargarFuentes();

  return NextResponse.json({
    publicaciones: data || [],
    fuentes_desde: desde,
    // Activas, publicadas o no: la pantalla tiene que mostrar los huecos.
    // Una desactivada que ya estaba publicada sigue en `publicaciones`.
    fuentes: fuentes
      .filter((f) => f.active || publicadas.has(f.key))
      .map((f) => ({
        ...f,
        publicada: publicadas.has(f.key),
      })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const forma = normalizarClaveFuente(body.source);
    if (!forma.ok) return NextResponse.json({ error: forma.error }, { status: 400 });
    const { fuentes } = await cargarFuentes();
    const validada = validarFuente(forma.key, fuentes, "marcar");
    if (!validada.ok) {
      return NextResponse.json({ error: validada.error }, { status: 400 });
    }
    const source = validada.key;

    // upsert: volver a marcar una fuente ya registrada actualiza la fecha en
    // vez de fallar. Republicar una vacante es normal.
    const { data, error } = await supabaseAdmin
      .from("ht_vacancy_postings")
      .upsert(
        {
          vacancy_id: params.id,
          source,
          posted_at: new Date().toISOString(),
          posted_by: body.posted_by || null,
          external_url: body.external_url || null,
          notes: body.notes || null,
        },
        { onConflict: "vacancy_id,source" },
      )
      .select("id, source, posted_at, external_url")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Si la vacante nació de una requisición aprobada, publicarla cierra el
    // circuito: la requisición pasa a "publicada".
    //
    // PERO SOLO LA CIERRA LA PÁGINA DE EMPLEO
    // Antes bastaba marcar CUALQUIER fuente. Marcar «Referidos» —que es
    // avisarle a un conocido— dejaba la requisición en "publicada" con
    // LinkedIn, Turpial y Magneto sin hacer. El tablero del líder y los
    // indicadores leen ese estado y entienden "ya salió", cuando la vacante no
    // estaba en ningún portal. Un estado que se adelanta a los hechos es peor
    // que no tenerlo: nadie vuelve a revisar algo que ya dice "publicada".
    //
    // La página de empleo sí la cierra: es la única que crea el enlace donde
    // la gente aplica y la puerta de entrada al funnel. Las demás amplifican.
    if (source === "careers") {
      const { data: vac } = await supabaseAdmin
        .from("ht_vacancies")
        .select("requisition_id")
        .eq("id", params.id)
        .maybeSingle();

      const reqId = (vac as any)?.requisition_id;
      if (reqId) {
        const { error: reqErr } = await supabaseAdmin
          .from("ht_requisitions")
          .update({ status: "publicada", updated_at: new Date().toISOString() })
          .eq("id", reqId)
          .eq("status", "aprobada"); // solo desde aprobada: no revive una rechazada
        if (reqErr) console.error("[postings] no se pudo cerrar la requisición:", reqErr.message);
      }
    }

    return NextResponse.json({ success: true, publicacion: data });
  } catch (err: any) {
    console.error("[postings] POST", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const forma = normalizarClaveFuente(req.nextUrl.searchParams.get("source"));
  if (!forma.ok) return NextResponse.json({ error: forma.error }, { status: 400 });
  const { fuentes } = await cargarFuentes();
  const validada = validarFuente(forma.key, fuentes, "desmarcar");
  if (!validada.ok) {
    return NextResponse.json({ error: validada.error }, { status: 400 });
  }
  const source = validada.key;

  const { error } = await supabaseAdmin
    .from("ht_vacancy_postings")
    .delete()
    .eq("vacancy_id", params.id)
    .eq("source", source);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
