/**
 * POST /api/agents/evaluate-candidate
 * GET  /api/agents/evaluate-candidate?candidate_id=…&rubrica=…
 *
 * Lee el expediente de un candidato y lo resuelve criterio por criterio contra
 * la rúbrica del cargo.
 *
 * POR QUÉ EL MODELO NO CALIFICA EL TOTAL
 * Devuelve un veredicto por criterio con su cita. La suma la hace
 * `calcularEje` con los pesos de la rúbrica, del lado del código. Así el
 * puntaje es reproducible, auditable renglón por renglón, y no cambia porque
 * cambie el modelo.
 *
 * LOS PDF VAN COMPLETOS, NO EXTRAÍDOS
 * Se mandan como bloques `document`. Extraer texto con una librería pierde
 * tablas y no lee escaneos — y en Colombia media hoja de vida es un escaneo.
 * Mandando el archivo, si viene ilegible el modelo lo dice en vez de evaluar
 * el vacío.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/bateria/auth";
import { getAnthropic } from "@/lib/anthropic";
import { getRubrica, calcularEje } from "@/lib/rubricas";
import { veredictosDeBateria } from "@/lib/bateria-a-rubrica";
import {
  construirPrompt,
  criteriosDelAgente,
  criteriosDeWellness,
  semaforo,
  type Veredicto,
} from "@/lib/evaluacion";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUCKET = "candidate-files";
/** Tope por archivo para no reventar el mensaje. */
const MAX_DOC = 18 * 1024 * 1024;

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("candidate_id");
  if (!id) return NextResponse.json({ error: "Falta candidate_id" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("ht_candidate_evaluations")
    .select("*")
    .eq("candidate_id", id)
    .order("run_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ evaluacion: data }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * PATCH · las calificaciones que carga Wellness a mano.
 *
 * No pisa la evaluación anterior: inserta un registro nuevo arrastrando los
 * veredictos del agente. Si dentro de seis meses alguien pregunta con qué se
 * decidió, tiene que poder verse qué se calificó, cuándo, y qué había antes.
 */
export async function PATCH(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  if (!isAdminRequest(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const candidateId = String(body.candidate_id || "");
    const rubricaKey = String(body.rubrica || "sig-sst");
    if (!candidateId) return NextResponse.json({ error: "Falta candidate_id" }, { status: 400 });

    const rubrica = getRubrica(rubricaKey);
    if (!rubrica) {
      return NextResponse.json({ error: `No existe la rúbrica "${rubricaKey}"` }, { status: 404 });
    }

    // Solo niveles 1–5 sobre criterios que existen y que le tocan a Wellness.
    // Todo lo demás se descarta en silencio: no se acepta un nivel para un
    // criterio que el agente califica, porque ahí el dato tendría dos dueños.
    const permitidos = new Set(criteriosDeWellness(rubrica).map(({ criterio }) => criterio.id));
    const entrada = (body.niveles_manuales ?? {}) as Record<string, unknown>;
    const manuales: Record<string, number> = {};
    for (const [k, v] of Object.entries(entrada)) {
      const n = Number(v);
      if (permitidos.has(k) && Number.isInteger(n) && n >= 1 && n <= 5) manuales[k] = n;
    }

    const { data: prev } = await supabaseAdmin
      .from("ht_candidate_evaluations")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle<Record<string, any>>();

    const veredictos: Veredicto[] = (prev?.veredictos as Veredicto[]) ?? [];

    // Mismo orden que en el POST: el agente abajo, Wellness encima. Acá estaba
    // igual de invertido, así que guardar una calificación la dejaba tapada por
    // el veredicto del agente en los criterios que los dos pueden tocar.
    const niveles: Record<string, number | null> = {};
    for (const v of veredictos) niveles[v.criterio_id] = v.nivel;
    Object.assign(niveles, manuales);

    const cap = calcularEje(rubrica.capacidad, niveles);
    const aju = calcularEje(rubrica.ajuste, niveles);

    const fila = {
      candidate_id: candidateId,
      rubrica_key: rubrica.key,
      rubrica_version: rubrica.version,
      run_at: new Date().toISOString(),
      modelo: "wellness (calificación manual)",
      veredictos,
      niveles_manuales: manuales,
      capacidad_puntaje: cap.puntaje,
      capacidad_cobertura: cap.cobertura,
      ajuste_puntaje: aju.puntaje,
      ajuste_cobertura: aju.cobertura,
      bloqueado_por: cap.bloqueado,
      semaforo: semaforo(cap.cobertura, aju.cobertura, cap.bloqueado),
      documentos_leidos: prev?.documentos_leidos ?? [],
      documentos_omitidos: prev?.documentos_omitidos ?? [],
    };

    const { data: guardada, error: gErr } = await supabaseAdmin
      .from("ht_candidate_evaluations")
      .insert(fila)
      .select("*")
      .single();

    if (gErr) {
      return NextResponse.json(
        { error: "No se pudieron guardar las calificaciones", detail: gErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ evaluacion: guardada, guardado: true });
  } catch (e: any) {
    console.error("[evaluate-candidate PATCH]", e);
    return NextResponse.json({ error: "Error interno", detail: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  if (!isAdminRequest(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const candidateId = String(body.candidate_id || "");
    const rubricaKey = String(body.rubrica || "sig-sst");
    if (!candidateId) return NextResponse.json({ error: "Falta candidate_id" }, { status: 400 });

    const rubrica = getRubrica(rubricaKey);
    if (!rubrica) {
      return NextResponse.json({ error: `No existe la rúbrica "${rubricaKey}"` }, { status: 404 });
    }

    // ── Candidato y lo que la batería ya calculó ──
    const { data: cand, error: cErr } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, stage, headline, current_job_role, current_company, years_experience, english_level, skills, prefilter_data")
      .eq("id", candidateId)
      .maybeSingle<Record<string, unknown>>();

    if (cErr) return NextResponse.json({ error: "No se pudo leer el candidato", detail: cErr.message }, { status: 500 });
    if (!cand) return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });

    // ── La batería. Vive en ts_bat_sessions, que es lo que lee el funnel.
    //    Antes se buscaba en ht_results y no estaba ahí: por eso un candidato
    //    con 89 % de match salía «sin evidencia» en los tres criterios de
    //    batería, con el agente proponiendo preguntarle en la entrevista un
    //    dato que la compañía ya tenía. ──
    const { data: bateria } = await supabaseAdmin
      .from("ts_bat_sessions")
      .select("scores, match_data, validity, status, finished_at")
      .eq("ht_candidate_id", candidateId)
      .not("scores", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ scores: any; match_data: any; validity: any; status: string; finished_at: string | null }>();

    // ── Adjuntos del expediente ──
    const { data: files } = await supabaseAdmin
      .from("ht_candidate_files")
      .select("id, kind, title, storage_path, mime, bytes")
      .eq("candidate_id", candidateId);

    const adjuntos = files ?? [];
    if (adjuntos.length === 0) {
      return NextResponse.json(
        {
          error: "Este candidato no tiene documentos en el expediente",
          detail:
            "El agente lee documentos. Subí al menos la hoja de vida en «Documentos del expediente» y volvé a correrlo.",
        },
        { status: 409 },
      );
    }

    // ── Bajar y adjuntar al mensaje ──
    const bloques: any[] = [];
    const leidos: string[] = [];
    const omitidos: string[] = [];

    for (const f of adjuntos) {
      const nombre = f.title || f.storage_path.split("/").pop() || "documento";
      if ((f.bytes ?? 0) > MAX_DOC) { omitidos.push(`${nombre} (pesa demasiado)`); continue; }

      const { data: blob, error: dErr } = await supabaseAdmin.storage.from(BUCKET).download(f.storage_path);
      if (dErr || !blob) { omitidos.push(`${nombre} (no se pudo abrir)`); continue; }

      const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
      const mime = f.mime || "application/pdf";

      if (mime === "application/pdf") {
        bloques.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 },
          title: nombre, context: `Tipo de documento: ${f.kind}` });
        leidos.push(nombre);
      } else if (mime.startsWith("image/")) {
        bloques.push({ type: "image", source: { type: "base64", media_type: mime, data: b64 } });
        bloques.push({ type: "text", text: `(la imagen anterior es «${nombre}», tipo ${f.kind})` });
        leidos.push(nombre);
      } else {
        // Word y Excel no se pueden mandar como documento nativo. Se declara
        // en vez de ignorarlo en silencio.
        omitidos.push(`${nombre} (formato ${mime.split("/").pop()} no legible por el agente)`);
      }
    }

    if (leidos.length === 0) {
      return NextResponse.json(
        { error: "Ningún documento del expediente se pudo leer", detail: omitidos.join(" · ") },
        { status: 409 },
      );
    }

    // ── Contexto de texto: lo que ya está estructurado en el ATS ──
    // Los criterios que la batería resuelve NO van al modelo: se calculan.
    // Lo que sí va es el resto del resultado, como contexto.
    const deBateria = veredictosDeBateria(rubrica, bateria?.scores ?? null, bateria?.validity ?? null);
    const validez = (bateria?.validity as any)?.veredicto ?? null;
    const idsBateria = new Set(deBateria.map((v) => v.criterio_id));
    const matchGlobal = (bateria?.match_data as any)?.global ?? null;

    // Del prefiltro se manda lo que dice algo del cargo. Documento, teléfono y
    // ciudad no entran: son datos de contacto, no evidencia, y varios de los
    // campos vecinos son justamente los que la rúbrica prohíbe mirar.
    const PREFILTRO_UTIL = [
      "why_ts", "next_role", "extra", "availability", "english_level", "english_cert",
      "edu_type", "years_logistics", "excel_level", "leadership", "team_size",
      "license_status", "intl_clients", "crms", "pricing_exp", "years_sales",
    ];
    const pf = (cand.prefilter_data ?? null) as Record<string, unknown> | null;
    const prefiltro = pf
      ? JSON.stringify(
          Object.fromEntries(
            PREFILTRO_UTIL.filter((k) => pf[k] != null && pf[k] !== "").map((k) => [k, pf[k]]),
          ),
        ).slice(0, 2200)
      : null;
    const contexto = [
      `Nombre: ${cand.name}`,
      cand.headline ? `Titular: ${cand.headline}` : "",
      cand.current_job_role ? `Cargo actual: ${cand.current_job_role}${cand.current_company ? " en " + cand.current_company : ""}` : "",
      cand.years_experience != null ? `Años de experiencia declarados: ${cand.years_experience}` : "",
      cand.english_level ? `Inglés declarado (sin verificar): ${cand.english_level}` : "",
      bateria?.scores
        ? `Batería psicométrica YA CALIFICADA por el instrumento${matchGlobal != null ? ` · match global ${matchGlobal} %` : ""}${validez ? ` · VALIDEZ DEL PROTOCOLO: ${validez}` : ""}.${validez === "no_interpretable" ? " El protocolo NO es interpretable, así que sus puntajes no son evidencia de nada, tampoco en contra: no los uses para ningún criterio." : ""} Los criterios que salen de ella ya están resueltos por el código y NO están en tu lista. Esto va solo como contexto: ${JSON.stringify(bateria.scores).slice(0, 2500)}`
        : "Batería: no la ha presentado.",
      // El prefiltro estaba en la base y el agente no lo veía. Es respuesta
      // declarada en un formulario, no conducta observada, y va rotulado como
      // tal para que no se use como prueba de algo que había que ver.
      prefiltro
        ? `Respuestas del prefiltro — DECLARADAS por la persona en un formulario, sirven para ubicar y para preguntar, NO como prueba de una conducta: ${prefiltro}`
        : "Prefiltro: no lo ha respondido.",
      `Documentos leídos: ${leidos.join(", ")}`,
      omitidos.length ? `Documentos que NO se pudieron leer: ${omitidos.join(", ")}` : "",
      `Tipos de documento en el expediente: ${adjuntos.map((f) => f.kind).join(", ") || "ninguno"}`,
    ].filter(Boolean).join("\n");

    const criterios = criteriosDelAgente(rubrica).filter(
      ({ criterio }) => !idsBateria.has(criterio.id),
    );
    const prompt = construirPrompt(rubrica, criterios, contexto);

    const anthropic = getAnthropic();
    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 6000,
      temperature: 0,
      messages: [
        { role: "user", content: [...bloques, { type: "text", text: prompt }] as any },
        { role: "assistant", content: "{" },
      ],
    });

    const crudo = "{" + result.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    let veredictos: Veredicto[] = [];
    try {
      const limpio = crudo.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      const j = JSON.parse(limpio);
      veredictos = Array.isArray(j.veredictos) ? j.veredictos : [];
    } catch {
      return NextResponse.json(
        { error: "La respuesta no vino en el formato esperado", detail: "Se devuelve el texto crudo para no perderlo.", raw: crudo },
        { status: 502 },
      );
    }

    // Todo criterio del agente que el modelo no haya devuelto cuenta como sin
    // evidencia. Si no, un criterio omitido subiría la cobertura sin dato.
    const porId = new Map(veredictos.map((v) => [v.criterio_id, v]));
    const delModelo: Veredicto[] = criterios.map(({ criterio }) =>
      porId.get(criterio.id) ?? {
        criterio_id: criterio.id, estado: "sin_evidencia", nivel: null,
        evidencia: null, fuente: null, pregunta: `¿${criterio.observar}?`,
      });

    // Los de batería son aritmética sobre un número ya calculado; van tal cual.
    const completos: Veredicto[] = [...deBateria, ...delModelo];

    // ── Niveles que ya cargó Wellness (assessment, roles, entrevista) ──
    const { data: prev } = await supabaseAdmin
      .from("ht_candidate_evaluations")
      .select("niveles_manuales")
      .eq("candidate_id", candidateId)
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ niveles_manuales: Record<string, number> | null }>();

    // EL ORDEN IMPORTA Y ESTABA AL REVÉS.
    // Primero el agente, y ENCIMA lo que cargó quien estuvo en la sala. Antes
    // el agente pisaba el nivel manual, así que volver a correrlo borraba la
    // calificación de una persona que sí vio el assessment. En los criterios
    // que los dos pueden tocar, el que estuvo ahí manda.
    const manuales = prev?.niveles_manuales ?? {};
    const niveles: Record<string, number | null> = {};
    for (const v of completos) niveles[v.criterio_id] = v.nivel;
    Object.assign(niveles, manuales);

    const cap = calcularEje(rubrica.capacidad, niveles);
    const aju = calcularEje(rubrica.ajuste, niveles);
    const sem = semaforo(cap.cobertura, aju.cobertura, cap.bloqueado);

    const fila = {
      candidate_id: candidateId,
      rubrica_key: rubrica.key,
      rubrica_version: rubrica.version,
      run_at: new Date().toISOString(),
      modelo: result.model,
      veredictos: completos,
      niveles_manuales: manuales,
      capacidad_puntaje: cap.puntaje,
      capacidad_cobertura: cap.cobertura,
      ajuste_puntaje: aju.puntaje,
      ajuste_cobertura: aju.cobertura,
      bloqueado_por: cap.bloqueado,
      semaforo: sem,
      documentos_leidos: leidos,
      documentos_omitidos: omitidos,
    };

    const { data: guardada, error: gErr } = await supabaseAdmin
      .from("ht_candidate_evaluations")
      .insert(fila)
      .select("*")
      .single();

    if (gErr) {
      // La evaluación corrió y costó tokens: se devuelve aunque no se haya
      // podido guardar, y se dice que no quedó registrada.
      return NextResponse.json(
        { evaluacion: fila, guardado: false, error_guardado: gErr.message, usage: result.usage },
        { status: 200 },
      );
    }

    return NextResponse.json({ evaluacion: guardada, guardado: true, usage: result.usage });
  } catch (e: any) {
    console.error("[evaluate-candidate]", e);
    return NextResponse.json({ error: "Error interno", detail: e?.message || String(e) }, { status: 500 });
  }
}
