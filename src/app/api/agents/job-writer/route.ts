/**
 * POST /api/agents/job-writer
 *
 * Agente Anthropic que redacta un job posting en formato Trading Solutions
 * (mismo estilo que las 5 vacantes ya publicadas: hero pitch + responsibilities
 * detalladas + requirements + tono "boutique freight forwarder, scaling globally").
 *
 * Body:
 *   { role: string, department?: string, level?: string, extras?: string, language?: 'es'|'en' }
 *
 * Returns:
 *   { posting: string, model: string, usage?: object }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAnthropic } from "@/lib/anthropic";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

const TS_BRAND_VOICE = `
Trading Solutions es un boutique freight forwarder con operación en más de 10 países (Maritime, Ground, Air, Customs).
Cifras: +300 clientes activos, +52k TEUs marítimos, +500 tons Air & Land.
Tono: ambicioso, profesional, internacional, growth-mindset. "Aquí no vienes a ocupar un puesto, vienes a construir tu futuro."
Cultura: crecimiento acelerado, alcance internacional, cultura de expansión, mentalidad de dueño.
Pilares de propuesta: aprendizaje continuo, experiencia internacional, bienestar integral, reconocimiento.
`.trim();

const FORMAT_TEMPLATE = `
Estructura del job posting (en este orden exacto):

1. **Hero pitch** (2-3 frases) — qué hace el rol y por qué importa para TS.
2. **Responsibilities** — 6-8 bullets concretos, en formato verbo + objeto + impacto. Empezar cada bullet con verbo activo (Lead, Drive, Own, Coordinate, Establish...).
3. **Requirements** — 5-7 bullets. Mezclar:
   - Educación formal (Bachelor's/Master's degree en X)
   - Años de experiencia y tipo (3-5 years of progressive...)
   - Skills duras específicas (ERP, IFRS, CargoWise, Salesforce, etc.)
   - Idioma: English proficiency at B1+/B2/Advanced según el rol
   - Mentalidad: analytical, attention to detail, ownership
4. **Preferred qualifications** — 2-3 bullets de "nice to have" (industry experience, certs, etc.)
5. **What we offer** — 3-4 bullets cortos (international exposure, growth, benefits, learning budget).

Formato salida:
- Marca cada sección con ## (h2)
- Usa bullets con guion -
- NO uses emojis
- NO uses palabras genéricas tipo "rockstar", "ninja", "synergy"
- Sé específico con tools, métricas y entregables
`.trim();

export async function POST(req: NextRequest) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const role = (body.role || "").toString().trim();
    const department = (body.department || "").toString().trim();
    const level = (body.level || "mid").toString();
    const extras = (body.extras || "").toString().trim();
    const language = body.language === "en" ? "en" : "es";

    if (!role) {
      return NextResponse.json({ error: "missing_role" }, { status: 400 });
    }

    const langInstruction = language === "es"
      ? "Escribe el posting completo en español neutro profesional (Colombia/LatAm), excepto los tags técnicos en inglés que sean estándar de industria."
      : "Write the full posting in clear professional English.";

    const userPrompt = `Genera un job posting nuevo para Trading Solutions.

Rol: ${role}
Departamento: ${department || "(definir según el rol)"}
Nivel: ${level}
${extras ? `Contexto adicional del hiring manager:\n${extras}` : ""}

${langInstruction}

CONTEXTO DE MARCA:
${TS_BRAND_VOICE}

FORMATO REQUERIDO:
${FORMAT_TEMPLATE}

Genera el posting completo. No agregues introducción ni cierre — solo las secciones.`;

    const anthropic = getAnthropic();
    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      temperature: 0.7,
      messages: [{ role: "user", content: userPrompt }],
    });

    const posting = result.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();

    return NextResponse.json({
      posting,
      model: result.model,
      usage: result.usage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    console.error("job-writer error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
