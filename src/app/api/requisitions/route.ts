/**
 * POST /api/requisitions  — el líder pide una vacante (llamada desde WXM)
 * GET  /api/requisitions  — listar: para WXM (las de un líder) o para el HR Panel (todas)
 *
 * Este es el punto donde el circuito arranca. La requisición nace acá, en el
 * ATS, y no se copia a ningún lado: WXM la crea con este POST y después solo
 * lee. Todas las decisiones posteriores pasan por el HR Panel.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { requireWxm, correoDelLider } from "@/lib/wxm-auth";
import { RequisitionStatus, RequisitionType, diasEnEstado } from "@/lib/requisitions";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

/** Deja rastro del movimiento. Best-effort: si falla, la requisición ya se movió
 *  y perder la bitácora es mejor que tumbar la operación. */
async function registrarEvento(
  requisitionId: string,
  to: RequisitionStatus,
  from: RequisitionStatus | null,
  actorEmail: string | null,
  note?: string | null,
) {
  const { error } = await supabaseAdmin.from("ht_requisition_events").insert({
    requisition_id: requisitionId,
    from_status: from,
    to_status: to,
    actor_email: actorEmail,
    note: note || null,
  });
  if (error) console.error("[requisitions] no se pudo registrar el evento:", error.message);
}

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  // La requisición la crea el líder desde WXM (token de servicio) o
  // Wellness/HR directamente desde el ATS (cookie de sesión de HR-admin).
  // Basta con una de las dos.
  const okWxm = requireWxm(req) === null;
  if (!okWxm) {
    const adminError = requireAdmin(req);
    if (adminError) return adminError;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const leadEmail = correoDelLider(req) || String(body.lead_email || "").toLowerCase().trim();
    const title = String(body.title || "").trim();

    if (!leadEmail || !title) {
      return NextResponse.json(
        { error: "Faltan el correo del líder y el cargo que necesita" },
        { status: 400 },
      );
    }

    const tipo: RequisitionType =
      body.requisition_type === "reemplazo" ? "reemplazo" : "incremental";

    const { data, error } = await supabaseAdmin
      .from("ht_requisitions")
      .insert({
        client_id: TS_CLIENT_ID,
        lead_email: leadEmail,
        lead_name: body.lead_name || null,
        area: body.area || null,
        title,
        requisition_type: tipo,
        reason: body.reason || null,
        needed_by: body.needed_by || null,
        // Lo que aporta el líder, en crudo. No se copia solo a
        // job_description/requirements: un cargo descrito en lenguaje interno
        // no se puede publicar tal cual, y los requisitos escritos sin filtro
        // son donde aparecen los criterios que no se pueden pedir. Wellness
        // lo traduce.
        lead_responsibilities: body.lead_responsibilities || null,
        lead_must_haves: body.lead_must_haves || null,
        // Insumo ampliado del líder (jefe, ubicación, modalidad, herramientas,
        // inglés, formación, experiencia, salario…). Igual que arriba: es crudo,
        // Wellness lo formaliza. Se guarda como JSON para no ensanchar la tabla.
        lead_profile: body.lead_profile || null,
        status: "pedida",
      })
      .select("id, status, created_at")
      .single();

    if (error) {
      console.error("[requisitions] insert falló:", error.message);
      return NextResponse.json(
        { error: "No se pudo crear la requisición", detail: error.message },
        { status: 500 },
      );
    }

    await registrarEvento(data.id, "pedida", null, leadEmail, body.reason || null);

    return NextResponse.json({
      success: true,
      requisition: data,
      mensaje: "Wellness la va a revisar y armar el perfil.",
    });
  } catch (err: any) {
    console.error("[requisitions] POST", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Dos consumidores con permisos distintos: WXM pide las de un líder, el HR
  // Panel pide todas. Se acepta cualquiera de las dos credenciales.
  const esWxm = requireWxm(req) === null;
  const esAdmin = requireAdmin(req) === null;
  if (!esWxm && !esAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const leadEmail = correoDelLider(req);
    const estado = req.nextUrl.searchParams.get("status");

    // WXM solo puede pedir las de un líder concreto. Sin esa restricción, el
    // secreto de servicio serviría para listar todas las requisiciones de la
    // compañía desde fuera del HR Panel.
    if (esWxm && !esAdmin && !leadEmail) {
      return NextResponse.json(
        { error: "Falta el correo del líder" },
        { status: 400 },
      );
    }

    let q = supabaseAdmin
      .from("ht_requisitions")
      // Se piden todas las columnas: la lista explícita se quedó corta cada vez
      // que se agregó un campo, y el síntoma era un dato que no aparecía
      // en pantalla sin ningún error de por medio.
      .select("*")
      .eq("client_id", TS_CLIENT_ID)
      .order("created_at", { ascending: false });

    if (leadEmail) q = q.ilike("lead_email", leadEmail);
    if (estado) q = q.eq("status", estado);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const requisiciones = (data || []).map((r: any) => ({
      ...r,
      dias_en_estado: diasEnEstado(r.updated_at),
    }));

    return NextResponse.json({ requisiciones, total: requisiciones.length });
  } catch (err: any) {
    console.error("[requisitions] GET", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
