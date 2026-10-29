/**
 * POST /api/agents/job-post-multilang
 *
 * Redacta el aviso completo de una requisición en español, inglés y mandarín,
 * con el formato real que publica Trading Solutions.
 *
 * POR QUÉ NO ES EL `job-writer` DE SIEMPRE
 * Aquel escribe un idioma por llamada y con un formato genérico (secciones ##,
 * sin emojis, sin CTA) que no corresponde a los avisos que la compañía publica.
 * Además arranca de cero: no sabe nada de lo que el líder ya escribió en la
 * requisición. Esta ruta parte de la requisición y entrega las tres versiones
 * listas para pegar.
 *
 * LAS TRES VERSIONES NO SON TRADUCCIONES
 * Se redactan en una sola pasada, con el inglés como referencia de contenido.
 * Traducir un aviso palabra por palabra produce textos que suenan importados;
 * lo que se busca es que cada versión lea como escrita en ese idioma, con la
 * misma sustancia. Por eso el modelo devuelve las tres juntas y no se llama
 * tres veces.
 *
 * Body:
 *   { requisition_id: string }            · toma los datos de la requisición
 *   ó { title, area, level, responsibilities, requirements, nice_to_have,
 *       location, work_mode, salary_public, extras }
 *
 * Returns: { posts: { es, en, zh }, model, usage }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getAnthropic } from "@/lib/anthropic";
import {
  TS_BRAND, TS_POST_FORMAT, INSTRUCCION_IDIOMA, INSTRUCCION_TONO, CAMPOS_REQUISICION,
  type Tono,
} from "@/lib/job-post-format";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";
export const maxDuration = 120;

type Insumo = {
  title: string;
  area: string | null;
  level: string | null;
  responsibilities: string | null;
  requirements: string | null;
  nice_to_have: string | null;
  location: string | null;
  work_mode: string | null;
  salary_public: string | null;
  english_required: boolean | null;
  extras: string | null;
};

function bloque(etiqueta: string, valor: string | null | undefined): string {
  const v = (valor || "").trim();
  return v ? `${etiqueta}:\n${v}\n` : "";
}

/**
 * El líder aporta contexto del cargo en `lead_profile` (a quién reporta,
 * herramientas, nivel de inglés y para qué, formación, experiencia, tope
 * salarial). Es justo lo que el aviso necesita para no salir con corchetes.
 * Se pasa en crudo y rotulado: el agente lo formaliza, no lo copia.
 *
 * El tope salarial se deja por fuera a propósito: es información interna de
 * negociación y no tiene por qué terminar en un aviso público.
 */
const ETIQUETAS_PERFIL: [string, string][] = [
  ["reporta_a", "Reporta a"],
  ["posiciones", "Posiciones a cubrir"],
  ["ubicacion", "Ubicación"],
  ["modalidad", "Modalidad"],
  ["herramientas", "Herramientas y sistemas"],
  ["ingles_nivel", "Nivel de inglés"],
  ["ingles_para", "Para qué usa el inglés"],
  ["formacion", "Formación"],
  ["experiencia", "Experiencia"],
  ["competencias", "Competencias"],
];

function perfilDelLider(perfil: unknown): string {
  if (!perfil || typeof perfil !== "object") return "";
  const p = perfil as Record<string, unknown>;
  const lineas = ETIQUETAS_PERFIL
    .map(([k, etiqueta]) => {
      const v = p[k];
      if (v === null || v === undefined || String(v).trim() === "") return null;
      return `- ${etiqueta}: ${String(v).trim()}`;
    })
    .filter(Boolean);
  return lineas.length ? lineas.join("\n") : "";
}

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const tono: Tono = ["formal", "neutro", "amigable"].includes(body.tono) ? body.tono : "neutro";
    let insumo: Insumo;

    if (body.requisition_id) {
      const { data, error } = await supabaseAdmin
        .from("ht_requisitions")
        .select(
          "title, area, job_description, responsibilities, requirements, nice_to_have, " +
            "lead_responsibilities, lead_must_haves, lead_profile, " +
            "location, work_mode, salary_public, english_required",
        )
        .eq("id", String(body.requisition_id))
        .maybeSingle<Record<string, unknown>>();

      if (error) {
        return NextResponse.json({ error: "No se pudo leer la requisición", detail: error.message }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: "Requisición no encontrada" }, { status: 404 });
      }

      insumo = {
        title: String(data.title || "").trim(),
        area: (data.area as string | null) || null,
        level: null,
        // Lo que escribió Wellness manda; si está vacío se cae a lo que puso el
        // líder al pedir la vacante, que es mejor que nada.
        responsibilities: (data.responsibilities as string | null) || (data.lead_responsibilities as string | null) || null,
        requirements: (data.requirements as string | null) || (data.lead_must_haves as string | null) || null,
        nice_to_have: (data.nice_to_have as string | null) || null,
        location: (data.location as string | null) || null,
        work_mode: (data.work_mode as string | null) || null,
        salary_public: (data.salary_public as string | null) || null,
        english_required: (data.english_required as boolean | null) ?? null,
        // El orden importa: primero el contexto que dio el líder, después la
        // descripción guardada y de último lo que Wellness acaba de escribir
        // en el panel, que es lo más reciente y lo que debe mandar.
        extras: [
          perfilDelLider(data.lead_profile),
          (data.job_description as string | null) || "",
          String(body.extras || "").trim(),
        ].filter(Boolean).join("\n\n") || null,
      };
    } else {
      insumo = {
        title: String(body.title || "").trim(),
        area: body.area || null,
        level: body.level || null,
        responsibilities: body.responsibilities || null,
        requirements: body.requirements || null,
        nice_to_have: body.nice_to_have || null,
        location: body.location || null,
        work_mode: body.work_mode || null,
        salary_public: body.salary_public || null,
        english_required: body.english_required ?? null,
        extras: body.extras || null,
      };
    }

    if (!insumo.title) {
      return NextResponse.json({ error: "Falta el título del cargo" }, { status: 400 });
    }

    const datos =
      bloque("Cargo", insumo.title) +
      bloque("Área", insumo.area) +
      bloque("Nivel", insumo.level) +
      bloque("Ubicación", insumo.location) +
      bloque("Modalidad", insumo.work_mode) +
      bloque("Salario a publicar", insumo.salary_public || "Negotiable") +
      bloque("Inglés excluyente", insumo.english_required === null ? null : insumo.english_required ? "Sí" : "No") +
      bloque("Responsabilidades levantadas con el líder", insumo.responsibilities) +
      bloque("Requisitos levantados con el líder", insumo.requirements) +
      bloque("Deseables", insumo.nice_to_have) +
      bloque("Contexto adicional", insumo.extras);

    const prompt = `Redacta el aviso de vacante de Trading Solutions en TRES idiomas.

DATOS DE LA REQUISICIÓN
${datos}
CONTEXTO DE MARCA
${TS_BRAND}

FORMATO OBLIGATORIO
${TS_POST_FORMAT}

TONO
${INSTRUCCION_TONO[tono]}

IDIOMAS
1. Inglés — ${INSTRUCCION_IDIOMA.en}
2. Español — ${INSTRUCCION_IDIOMA.es}
3. Mandarín — ${INSTRUCCION_IDIOMA.zh}

Las tres versiones deben tener la misma sustancia: mismos bullets, mismos
requisitos, mismas cifras. No son traducciones literales: cada una se escribe
como si hubiera nacido en ese idioma.

Si un dato no viene en la requisición, escríbelo entre corchetes para que
Wellness lo complete — por ejemplo [años de experiencia] o [ciudad]. Nunca lo
inventes.

ADEMÁS DEL AVISO, LOS CAMPOS SUELTOS
${CAMPOS_REQUISICION}

Devuelve EXACTAMENTE este JSON, sin texto antes ni después, sin bloque de código:
{"en":"...","es":"...","zh":"...","campos":{"responsibilities":"...","requirements":"...","nice_to_have":"...","title_en":"...","hook_en":"...","description_en":"...","responsibilities_en":"...","requirements_en":"...","nice_to_have_en":"...","palabras_clave":"...","habilidades_tecnicas":"...","habilidades_blandas":"...","nivel_educacion":"...","seniority":"..."}}

Dentro de cada cadena usa \\n para los saltos de línea.`;

    const anthropic = getAnthropic();
    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      temperature: 0.6,
      messages: [
        { role: "user", content: prompt },
        // Forzar el arranque del JSON evita el preámbulo que a veces antepone
        // el modelo y que rompe el parseo.
        { role: "assistant", content: "{" },
      ],
    });

    const crudo = "{" + result.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();

    let posts: { es: string; en: string; zh: string };
    let campos: Record<string, string> = {};
    try {
      const limpio = crudo.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      const j = JSON.parse(limpio);
      posts = { es: String(j.es || ""), en: String(j.en || ""), zh: String(j.zh || "") };
      const c = j.campos || {};
      for (const k of [
        "responsibilities", "requirements", "nice_to_have",
        "title_en", "hook_en", "description_en",
        "responsibilities_en", "requirements_en", "nice_to_have_en",
        "palabras_clave", "habilidades_tecnicas", "habilidades_blandas",
        "nivel_educacion", "seniority",
      ]) {
        if (c[k]) campos[k] = String(c[k]);
      }
    } catch {
      // Si el modelo devuelve algo que no parsea, es mejor entregar el texto
      // crudo que un error: Wellness puede recortarlo a mano y no pierde la
      // redacción completa.
      return NextResponse.json(
        {
          error: "La respuesta no vino en el formato esperado",
          detail: "Se devuelve el texto tal como llegó para que no se pierda.",
          raw: crudo,
          model: result.model,
        },
        { status: 502 },
      );
    }

    if (!posts.en && !posts.es && !posts.zh) {
      return NextResponse.json({ error: "El agente no devolvió contenido", raw: crudo }, { status: 502 });
    }

    return NextResponse.json({ posts, campos, tono, model: result.model, usage: result.usage });
  } catch (e: any) {
    console.error("[job-post-multilang]", e);
    return NextResponse.json({ error: "Error interno", detail: e?.message || String(e) }, { status: 500 });
  }
}
