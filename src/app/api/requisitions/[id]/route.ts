/**
 * GET   /api/requisitions/[id]  — el detalle, con su historial
 * PATCH /api/requisitions/[id]  — armar perfil · devolver · aprobar · rechazar
 *
 * Las decisiones viven acá y solo se toman desde el HR Panel: WXM crea la
 * requisición y después lee, nada más. Un solo lugar donde se decide es lo que
 * mantiene una sola verdad.
 *
 * Al aprobar nace la vacante en el ATS con el líder como responsable. Ese es
 * el momento en que el proceso arranca de verdad, y el que ancla los 22 días.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import {
  RequisitionStatus,
  validarTransicion,
  faltaParaElPerfil,
  accionesDisponibles,
  diasEnEstado,
} from "@/lib/requisitions";
import { modeloDeCompetencias, nivelDeJerarquia, TS_CLIENT_ID } from "@/lib/competency-model";
import { guardarFechasVacante, validarFechasAts } from "@/lib/vacancy-dates-store";
import { transicionBloqueadaPorOculta } from "@/lib/requisition-board";

export const runtime = "nodejs";

const CAMPOS = "*";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { data: raw, error } = await supabaseAdmin
    .from("ht_requisitions")
    .select(CAMPOS)
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!raw) return NextResponse.json({ error: "No existe esa requisición" }, { status: 404 });
  const data = raw as any;

  const { data: eventos } = await supabaseAdmin
    .from("ht_requisition_events")
    .select("from_status, to_status, actor_email, note, changed_at")
    .eq("requisition_id", params.id)
    .order("changed_at", { ascending: true });

  return NextResponse.json({
    requisicion: { ...data, dias_en_estado: diasEnEstado(data.updated_at) },
    historial: eventos || [],
    acciones: data.hidden_at ? [] : accionesDisponibles(data.status as RequisitionStatus),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion || "");
    const nota = body.nota ? String(body.nota).trim() : null;
    const actor = body.actor_email ? String(body.actor_email).toLowerCase().trim() : null;

    const { data: actualRaw, error: readErr } = await supabaseAdmin
      .from("ht_requisitions")
      .select(CAMPOS)
      .eq("id", params.id)
      .maybeSingle();

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!actualRaw) return NextResponse.json({ error: "No existe esa requisición" }, { status: 404 });
    const actual = actualRaw as any;

    const estadoActual = actual.status as RequisitionStatus;
    const bloqueo = transicionBloqueadaPorOculta(actual, accion);
    if (bloqueo) return NextResponse.json({ error: bloqueo }, { status: 409 });

    // Los campos del perfil se guardan aunque la acción no sea "armar_perfil":
    // Wellness puede ir completando y guardar sin mandar todavía al CWO.
    const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const campo of [
      "job_description",
      "responsibilities",
      "requirements",
      "nice_to_have",
      "salary_cap_cop",
      "form_template_key",
      "english_required",
      // Lo necesario para publicar
      "location",
      "work_mode",
      "salary_public",
      // El aviso sale en inglés
      "title_en",
      "hook_en",
      "description_en",
      "responsibilities_en",
      "requirements_en",
      "nice_to_have_en",
    ]) {
      if (body[campo] !== undefined) cambios[campo] = body[campo];
    }

    // Guardar sin mover de estado.
    if (!accion) {
      const { error } = await supabaseAdmin
        .from("ht_requisitions")
        .update(cambios)
        .eq("id", params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, guardado: true, status: estadoActual });
    }

    const validacion = validarTransicion(accion, estadoActual, nota);
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }
    const destino = validacion.destino;

    // Mandarla al CWO con el perfil a medias es lo que hace que la devuelvan.
    // Se corta acá y se dice exactamente qué falta.
    if (accion === "armar_perfil") {
      const faltan = faltaParaElPerfil({ ...actual, ...cambios });
      if (faltan.length > 0) {
        return NextResponse.json(
          {
            error: `Antes de mandarla al CWO falta: ${faltan.join(", ")}.`,
            faltantes: faltan,
          },
          { status: 400 },
        );
      }
    }

    cambios.status = destino;
    if (nota) cambios.decision_note = nota;

    // ─── Al aprobar nace la vacante ──────────────────────────────────────
    //
    // POR QUÉ ESTO NO ES UN `insert` A SECAS
    // Lo era, y creaba una vacante nueva cada vez, sin mirar qué había. Eso
    // produjo dos clases de duplicado:
    //
    //   1. Aprobar dos veces la misma requisición → dos vacantes idénticas.
    //   2. Aprobar una requisición para un cargo que YA tenía vacante abierta
    //      —abierta antes de que existieran las requisiciones— → la vacante
    //      nueva nace vacía y la vieja se queda con todos los candidatos. En
    //      el funnel aparecen las dos, y la que Wellness abre primero muestra
    //      cero personas aunque el proceso tenga treinta y ocho.
    //
    // El caso 1 se resuelve solo. El caso 2 no se puede adivinar por el
    // título: «FullStack Junior» y «Full Stack Developer Junior» son el mismo
    // cargo y no se parecen para una computadora; «Especialista SIG-SST» e
    // «Integrated Management Systems & HSE Specialist» ni siquiera están en el
    // mismo idioma. Así que no se adivina: se corta y se pregunta.
    let fechasAprobacion: { apertura: string; objetivo: string | null } | null = null;
    let errorFechas: string | null = null;
    if (destino === "aprobada") {
      const fechas = await validarFechasAts(
        body.fecha_apertura ?? body.hr_request_date,
        body.fecha_objetivo ?? body.target_fill_date,
      );
      if (fechas.ok) fechasAprobacion = fechas;
      else errorFechas = fechas.error;
    }

    let vacanteCreada: { id: string; title: string } | null = null;
    if (destino === "aprobada") {
      const modelId = await modeloDeCompetencias();
      if (!modelId) {
        return NextResponse.json(
          {
            error:
              "No hay modelo de competencias para el cliente, así que no se puede " +
              "crear la vacante. Hay que cargarlo (los 16 mandatos) antes de aprobar.",
          },
          { status: 409 },
        );
      }

      // ── Caso 1 · esta requisición ya tiene vacante ──
      if (actual.vacancy_id) {
        const { data: yaExiste } = await supabaseAdmin
          .from("ht_vacancies")
          .select("id, title")
          .eq("id", actual.vacancy_id)
          .maybeSingle<{ id: string; title: string }>();
        if (yaExiste) {
          vacanteCreada = yaExiste;
        }
      }

      // ── Caso 2 · hay vacantes abiertas que nadie reclamó ──
      // Una vacante abierta sin `requisition_id` viene de antes del flujo de
      // requisiciones. Si existe alguna, lo más probable es que ESTA
      // requisición sea justamente la de ese proceso. Se ofrece vincularla en
      // vez de abrir una vacante paralela.
      if (!vacanteCreada) {
        const { data: huerfanas } = await supabaseAdmin
          .from("ht_vacancies")
          .select("id, title, created_at")
          .eq("client_id", TS_CLIENT_ID)
          .eq("status", "open")
          .is("requisition_id", null);

        const sueltas = huerfanas || [];
        const vincularA = body.vincular_vacante_id ? String(body.vincular_vacante_id) : null;

        if (vincularA) {
          const elegida = sueltas.find((v: any) => v.id === vincularA);
          if (!elegida) {
            return NextResponse.json(
              {
                error: "Esa vacante ya no está disponible para vincular",
                detail: "Puede que la hayan cerrado o vinculado a otra requisición mientras tanto.",
              },
              { status: 409 },
            );
          }
          const { error: vinErr } = await supabaseAdmin
            .from("ht_vacancies")
            .update({ requisition_id: actual.id, hiring_lead_email: actual.lead_email })
            .eq("id", vincularA);
          if (vinErr) {
            return NextResponse.json(
              { error: "No se pudo vincular la vacante", detail: vinErr.message },
              { status: 500 },
            );
          }
          vacanteCreada = { id: (elegida as any).id, title: (elegida as any).title };
        } else if (sueltas.length > 0 && body.crear_vacante_nueva !== true) {
          // Se corta ANTES de escribir nada: la requisición sigue sin aprobar
          // y no queda una vacante fantasma si Wellness elige mal.
          return NextResponse.json(
            {
              error:
                "Ya hay vacantes abiertas en el ATS que no pertenecen a ninguna requisición. " +
                "Antes de crear una nueva hay que decir si alguna de estas es este mismo proceso.",
              detail:
                "Si se crea una vacante nueva teniendo la vieja abierta, los candidatos se " +
                "quedan en la vieja y el funnel muestra el proceso vacío.",
              requiere_decision: "vacante_duplicada",
              vacantes_sueltas: sueltas.map((v: any) => ({
                id: v.id,
                title: v.title,
                created_at: v.created_at,
              })),
            },
            { status: 409 },
          );
        }
      }
    }

    if (destino === "aprobada" && !vacanteCreada) {
      if (!fechasAprobacion) {
        return NextResponse.json(
          { error: errorFechas || "Falta la fecha de apertura de la vacante." },
          { status: 400 },
        );
      }
      const modelId = await modeloDeCompetencias();
      const { data: nueva, error: vacErr } = await supabaseAdmin
        .from("ht_vacancies")
        .insert({
          client_id: TS_CLIENT_ID,
          model_id: modelId,
          title: actual.title,
          area: actual.area || null,
          status: "open",
          // La requisición no pide nivel por separado: se deduce del título,
          // que es donde el líder escribe "Senior" o "Lead" cuando aplica.
          role_level: nivelDeJerarquia(actual.title),
          vacancy_type: actual.requisition_type,
          form_template_key: actual.form_template_key || null,
          hiring_lead_email: actual.lead_email,
          requisition_id: actual.id,
        })
        .select("id, title")
        .single();

      if (vacErr) {
        // La requisición NO se marca como aprobada si la vacante no se pudo
        // crear: dejarla aprobada sin vacante es el estado imposible que hace
        // que el líder vea "aprobada" y nunca aparezca un candidato.
        console.error("[requisitions] aprobar → crear vacante falló:", vacErr.message);
        return NextResponse.json(
          {
            error: "Se aprobó pero no se pudo crear la vacante en el ATS",
            detail: vacErr.message,
          },
          { status: 500 },
        );
      }

      vacanteCreada = nueva;
    }

    // Sirve igual si la vacante se acaba de crear, si se reusó la que ya
    // tenía la requisición o si se vinculó una que estaba suelta.
    let avisoFechas: string | null = null;
    if (destino === "aprobada" && vacanteCreada && fechasAprobacion) {
      const guardadas = await guardarFechasVacante(
        vacanteCreada.id,
        fechasAprobacion.apertura,
        fechasAprobacion.objetivo,
      );
      if (!guardadas.ok) {
        return NextResponse.json({ error: guardadas.error }, { status: 400 });
      }
      avisoFechas = guardadas.aviso;
    }
    if (destino === "aprobada" && vacanteCreada) {
      cambios.vacancy_id = vacanteCreada.id;
      cambios.approved_at = new Date().toISOString();
      cambios.approved_by = actor;
    }

    const { error: updErr } = await supabaseAdmin
      .from("ht_requisitions")
      .update(cambios)
      .eq("id", params.id);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    const { error: evErr } = await supabaseAdmin.from("ht_requisition_events").insert({
      requisition_id: params.id,
      from_status: estadoActual,
      to_status: destino,
      actor_email: actor,
      note: nota,
    });
    if (evErr) console.error("[requisitions] evento no registrado:", evErr.message);

    return NextResponse.json({
      success: true,
      status: destino,
      vacante: vacanteCreada,
      aviso_fechas: avisoFechas,
      acciones: accionesDisponibles(destino),
    });
  } catch (err: any) {
    console.error("[requisitions] PATCH", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
