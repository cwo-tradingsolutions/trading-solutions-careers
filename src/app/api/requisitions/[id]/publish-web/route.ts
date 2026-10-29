/**
 * POST /api/requisitions/[id]/publish-web
 *
 * Publica en la página de empleo una vacante que nació de una requisición.
 *
 * POR QUÉ EXISTE
 * El botón "Publicar en la web" de la pestaña Vacantes publica lo que está en
 * `src/data/jobs.ts`, un archivo de código. Una vacante creada al aprobar una
 * requisición no está ahí, así que no tenía forma de llegar a careers: quedaba
 * viva en el ATS, con su funnel listo, y sin ningún lugar donde aplicar.
 *
 * Escribe en Neon (la tabla `vacancies`, que es la que lee /vacantes) y deja
 * registrada la publicación. El id de Neon se guarda en la requisición para no
 * tener que buscarla por título después — buscar por título fue justo lo que
 * hizo que las aplicaciones cayeran en la vacante equivocada.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";

export const runtime = "nodejs";

/** "Talent Acquisition Manager" → "talent-acquisition-manager" */
function aSlug(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Un bloque de texto a array, para las columnas jsonb de la página. */
function aLista(texto?: string | null): string[] {
  if (!texto) return [];
  return texto
    .split("\n")
    .map((l) => l.replace(/^[\s•\-*·]+/, "").trim())
    .filter(Boolean);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trading-solutions-careers.vercel.app";

  try {
    // La tabla `vacancies` nació con el salario y las etiquetas en un solo
    // idioma. Las columnas en inglés se agregaron después, pero solo las creaba
    // el botón «Publicar en la web» de la pestaña Vacantes — así que publicar
    // desde una requisición fallaba con «column "salary_range_en" does not
    // exist» en cualquier base donde ese botón todavía no se hubiera apretado.
    // Depender de que alguien haya hecho clic en otra pantalla no es una
    // dependencia: es una trampa. Con IF NOT EXISTS esto es inofensivo.
    await sql`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS salary_range_en TEXT`;
    await sql`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS tags_en TEXT`;

    const { data: raw, error } = await supabaseAdmin
      .from("ht_requisitions")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!raw) return NextResponse.json({ error: "No existe esa requisición" }, { status: 404 });
    const r = raw as any;

    if (r.status !== "aprobada" && r.status !== "publicada") {
      return NextResponse.json(
        {
          error:
            "Solo se publica una requisición aprobada. Esta está en " +
            `"${r.status}".`,
        },
        { status: 400 },
      );
    }

    // Sin descripción no hay nada que mostrarle a un candidato.
    const faltan: string[] = [];
    if (!String(r.job_description || "").trim()) faltan.push("descripción");
    if (!String(r.requirements || "").trim()) faltan.push("requisitos");
    if (!String(r.location || "").trim()) faltan.push("ubicación");
    if (faltan.length) {
      return NextResponse.json(
        { error: `Antes de publicar falta: ${faltan.join(", ")}.`, faltantes: faltan },
        { status: 400 },
      );
    }

    const slug = aSlug(r.title);
    const tituloEn = r.title_en || r.title;
    const modo = r.work_mode || "Presencial";

    // Una requisición publicada dos veces actualiza su propia fila; no crea
    // una segunda. web_vacancy_id manda; si no está, se busca por slug.
    let filaId: number | null = r.web_vacancy_id ?? null;
    if (!filaId) {
      const existentes = await sql`SELECT id FROM vacancies WHERE slug = ${slug} LIMIT 1`;
      filaId = (existentes as any[])[0]?.id ?? null;
    }

    const responsabilidades = aLista(r.responsibilities);
    const responsabilidadesEn = aLista(r.responsibilities_en || r.responsibilities);
    const requisitos = aLista(r.requirements);
    const requisitosEn = aLista(r.requirements_en || r.requirements);

    if (filaId) {
      await sql`
        UPDATE vacancies SET
          title = ${r.title}, title_es = ${r.title}, title_en = ${tituloEn},
          department = ${r.area || ""}, location = ${r.location},
          work_mode = ${modo}, salary_range = ${r.salary_public || "A convenir"},
          salary_range_en = ${r.salary_public || "Negotiable"},
          status = 'open', slug = ${slug},
          description = ${r.job_description}, description_es = ${r.job_description},
          description_en = ${r.description_en || r.job_description},
          responsibilities_es = ${JSON.stringify(responsabilidades)}::jsonb,
          responsibilities_en = ${JSON.stringify(responsabilidadesEn)}::jsonb,
          requirements_es = ${JSON.stringify(requisitos)}::jsonb,
          requirements_en = ${JSON.stringify(requisitosEn)}::jsonb,
          updated_at = NOW()
        WHERE id = ${filaId}
      `;
    } else {
      const creada = await sql`
        INSERT INTO vacancies (
          slug, title, title_es, title_en, department, location, work_mode,
          employment_type, level, salary_range, salary_range_en, status,
          apply_email, posted_at, description, description_es, description_en,
          responsibilities_es, responsibilities_en, requirements_es, requirements_en,
          created_at, updated_at
        ) VALUES (
          ${slug}, ${r.title}, ${r.title}, ${tituloEn},
          ${r.area || ""}, ${r.location}, ${modo},
          'full-time', 'Mid-Level',
          ${r.salary_public || "A convenir"}, ${r.salary_public || "Negotiable"},
          'open', 'jointheteam@tradingsolutions.com', NOW(),
          ${r.job_description}, ${r.job_description}, ${r.description_en || r.job_description},
          ${JSON.stringify(responsabilidades)}::jsonb,
          ${JSON.stringify(responsabilidadesEn)}::jsonb,
          ${JSON.stringify(requisitos)}::jsonb,
          ${JSON.stringify(requisitosEn)}::jsonb,
          NOW(), NOW()
        )
        RETURNING id
      `;
      filaId = (creada as any[])[0]?.id ?? null;
    }

    if (!filaId) {
      return NextResponse.json(
        { error: "Se ejecutó la publicación pero la página no devolvió un id" },
        { status: 500 },
      );
    }

    const url = `${baseUrl}/vacantes/${filaId}`;

    await supabaseAdmin
      .from("ht_requisitions")
      .update({ web_vacancy_id: filaId, updated_at: new Date().toISOString() })
      .eq("id", params.id);

    if (r.vacancy_id) {
      await supabaseAdmin.from("ht_vacancy_postings").upsert(
        {
          vacancy_id: r.vacancy_id,
          source: "careers",
          posted_at: new Date().toISOString(),
          external_url: url,
        },
        { onConflict: "vacancy_id,source" },
      );
      // Publicar en la página cierra el circuito de la requisición.
      await supabaseAdmin
        .from("ht_requisitions")
        .update({ status: "publicada" })
        .eq("id", params.id)
        .eq("status", "aprobada");
    }

    return NextResponse.json({ success: true, url, web_vacancy_id: filaId });
  } catch (err: any) {
    console.error("[publish-web]", err);
    return NextResponse.json(
      { error: "No se pudo publicar en la página", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}
