/**
 * GET /api/admin/contactos/resumen
 *
 * Por cada candidato activo: cuántas veces se le escribió, por dónde, cuándo
 * fue el último contacto y —lo más importante— si el último mensaje es de él y
 * nadie le ha respondido. Es la vista para no dejar a nadie esperando y para
 * mostrar el seguimiento que se hizo.
 *
 * «Activo» = en una vacante abierta y en cualquier etapa menos rechazado y
 * contratado. Los procesos cerrados no se muestran: no hay a quién responder.
 * ?vacancy_id=UUID limita a una vacante (así lo usa el funnel).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { supabaseAdmin } from "@/lib/supabase";
import { ETAPAS_CERRADAS, vacantesAbiertas } from "@/lib/contactos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ev = { candidate_id: string; channel: string; direction: string; occurred_at: string; summary: string | null; status: string };

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const vacancyId = req.nextUrl.searchParams.get("vacancy_id");
  const vacantes = vacancyId ? [vacancyId] : await vacantesAbiertas();
  if (vacantes.length === 0) {
    return NextResponse.json({ total: 0, esperando_respuesta: 0, sin_ningun_contacto: 0, gmail_sin_revisar: 0, candidatos: [] });
  }

  let cands: any[];
  try {
    cands = await fetchAllRows(() =>
      supabaseAdmin
        .from("ht_candidates")
        .select("id, name, email, phone, stage, vacancy_id, contactos_sync_at, ht_vacancies(title)")
        .in("vacancy_id", vacantes)
        .not("stage", "in", ETAPAS_CERRADAS),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const ids = (cands ?? []).map((c) => c.id);
  const eventos: Ev[] = [];
  // PostgREST corta en 1000 filas: se pide por páginas y por tandas de ids.
  for (let i = 0; i < ids.length; i += 150) {
    const tanda = ids.slice(i, i + 150);
    for (let desde = 0; ; desde += 1000) {
      const { data, error: e } = await supabaseAdmin
        .from("ht_contact_events")
        .select("candidate_id, channel, direction, occurred_at, summary, status")
        .in("candidate_id", tanda)
        .order("occurred_at", { ascending: true })
        .range(desde, desde + 999);
      if (e) return NextResponse.json({ error: e.message }, { status: 500 });
      eventos.push(...((data ?? []) as Ev[]));
      if (!data || data.length < 1000) break;
    }
  }

  const porCand = new Map<string, Ev[]>();
  for (const e of eventos) {
    if (!porCand.has(e.candidate_id)) porCand.set(e.candidate_id, []);
    porCand.get(e.candidate_id)!.push(e);
  }

  const ahora = Date.now();
  const filas = (cands ?? []).map((c: any) => {
    // Los «intento» (se abrió WhatsApp sin confirmar) no cuentan como contacto.
    const evs = (porCand.get(c.id) ?? []).filter((e) => e.status !== "intento");
    const salientes = evs.filter((e) => e.direction === "saliente");
    const entrantes = evs.filter((e) => e.direction === "entrante");
    const ultimo = evs[evs.length - 1] ?? null;
    const ultSal = salientes[salientes.length - 1]?.occurred_at ?? null;
    const ultEnt = entrantes[entrantes.length - 1]?.occurred_at ?? null;
    const esperando = Boolean(ultEnt && (!ultSal || new Date(ultEnt) > new Date(ultSal)));
    return {
      id: c.id,
      nombre: c.name,
      email: c.email,
      vacante: c.ht_vacancies?.title ?? "—",
      etapa: c.stage,
      gmail_revisado: c.contactos_sync_at,
      contactos: evs.length,
      correos: evs.filter((e) => e.channel === "email").length,
      whatsapps: evs.filter((e) => e.channel === "whatsapp").length,
      otros: evs.filter((e) => !["email", "whatsapp"].includes(e.channel)).length,
      intentos_whatsapp: (porCand.get(c.id) ?? []).filter((e) => e.status === "intento").length,
      ultimo: ultimo
        ? { at: ultimo.occurred_at, canal: ultimo.channel, direccion: ultimo.direction, resumen: ultimo.summary }
        : null,
      dias_sin_contacto: ultimo ? Math.floor((ahora - new Date(ultimo.occurred_at).getTime()) / 86_400_000) : null,
      // El último mensaje es del candidato y no le hemos contestado.
      esperando_respuesta_nuestra: esperando,
      esperando_desde: esperando ? ultEnt : null,
    };
  });

  const sinRevisar = filas.filter((f) => !f.gmail_revisado).length;
  return NextResponse.json(
    {
      total: filas.length,
      esperando_respuesta: filas.filter((f) => f.esperando_respuesta_nuestra).length,
      sin_ningun_contacto: filas.filter((f) => f.contactos === 0).length,
      gmail_sin_revisar: sinRevisar,
      candidatos: filas,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
