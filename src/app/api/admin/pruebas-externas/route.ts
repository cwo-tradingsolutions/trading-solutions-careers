/**
 * /api/admin/pruebas-externas
 *
 * GET  ?vacancy_id=UUID  → la matriz candidato × proveedor de esa vacante.
 * GET  (sin vacancy_id)  → solo el catálogo de proveedores.
 * POST                   → guarda el resultado de una prueba para alguien.
 *
 * El GET devuelve también a los candidatos que no tienen ninguna prueba
 * registrada, porque la pregunta que esta pantalla contesta es «a quién le
 * falta», y para eso hay que ver a los que no tienen nada.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  listarProveedores,
  matrizDeVacante,
  guardarResultado,
  type EstadoPrueba,
} from "@/lib/pruebas-externas";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const noAutorizado = requireAdmin(req);
  if (noAutorizado) return noAutorizado;

  try {
    const vacancyId = req.nextUrl.searchParams.get("vacancy_id");
    if (!vacancyId) {
      return NextResponse.json({ proveedores: await listarProveedores() });
    }
    const matriz = await matrizDeVacante(vacancyId);
    return NextResponse.json(matriz, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "No se pudo leer el estado de las pruebas" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const noAutorizado = requireAdmin(req);
  if (noAutorizado) return noAutorizado;

  try {
    const body = await req.json().catch(() => ({}));
    const candidateId = body?.candidate_id;
    const providerId = body?.provider_id;

    if (!candidateId || !providerId) {
      return NextResponse.json(
        { error: "Falta candidate_id o provider_id" },
        { status: 400 },
      );
    }

    const guardado = await guardarResultado({
      candidateId,
      providerId,
      vacancyId: body?.vacancy_id ?? undefined,
      clientId: body?.client_id ?? undefined,
      estado: (body?.estado as EstadoPrueba) ?? undefined,
      enviadaAt: body?.enviada_at ?? undefined,
      presentadaAt: body?.presentada_at ?? undefined,
      puntajes: body?.puntajes ?? undefined,
      resumen: body?.resumen ?? undefined,
      archivoUrl: body?.archivo_url ?? undefined,
      archivoNombre: body?.archivo_nombre ?? undefined,
      portalUrl: body?.portal_url ?? undefined,
      cargadoPor: body?.cargado_por ?? undefined,
      notas: body?.notas ?? undefined,
    });

    return NextResponse.json({ ok: true, id: guardado?.id ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "No se pudo guardar el resultado" },
      { status: 500 },
    );
  }
}
