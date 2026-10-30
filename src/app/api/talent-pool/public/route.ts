import { neon } from "@/lib/sql";
import { NextRequest, NextResponse } from "next/server";

/**
 * Talent pool público · "Join us" del portal de empleo (pack rev J, Kelly P0).
 *
 * Quien no encuentra vacante abierta deja su CV y queda en el CV Bank del ATS
 * (`talent_pool`, la misma tabla que HR Admin lista como CV Bank y que el
 * agente de Recepción ya alimenta), con source = 'careers_pool' y el área de
 * interés en tags. No crea tablas ni toca el funnel: un candidato sin vacante
 * no tiene lugar en ht_candidates todavía.
 *
 * Si el correo ya existe, se actualizan CV, contacto y nota en vez de fallar:
 * para el candidato es "enviar de nuevo", no un error.
 *
 * El correo de confirmación (jointheteam@) va por el track de emails Universe,
 * en paralelo; esta ruta no envía nada.
 */

const AREAS = ["operations", "corporate", "commercial", "other"] as const;
// ~5 MB de archivo en base64 (crece ~4/3) más el prefijo data:
const MAX_CV_CHARS = Math.ceil((5 * 1024 * 1024 * 4) / 3) + 200;

const texto = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const full_name = texto(body.full_name, 200);
  const email = texto(body.email, 200).toLowerCase();
  const phone = texto(body.phone, 60) || null;
  const linkedin = texto(body.linkedin, 300) || null;
  const area = texto(body.area, 20);
  const message = texto(body.message, 2000) || null;
  const cv_filename = texto(body.cv_filename, 200) || null;
  const cv_data = typeof body.cv_data === "string" ? body.cv_data : null;

  if (!full_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !(AREAS as readonly string[]).includes(area)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (cv_data && (cv_data.length > MAX_CV_CHARS || !cv_data.startsWith("data:"))) {
    return NextResponse.json({ error: "CV must be a PDF or Word file up to 5 MB" }, { status: 413 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const nota = `[Careers · talent pool] área=${area}${message ? ` · ${message}` : ""}`;
    const existing = await sql("SELECT id FROM talent_pool WHERE lower(email) = $1 LIMIT 1", [email]);

    if (existing.length > 0) {
      await sql(
        `UPDATE talent_pool SET
           full_name = $2,
           phone = COALESCE($3, phone),
           linkedin_url = COALESCE($4, linkedin_url),
           cv_data = COALESCE($5, cv_data),
           cv_filename = COALESCE($6, cv_filename),
           tags = $7,
           notes = CASE WHEN notes IS NULL OR notes = '' THEN $8 ELSE notes || E'\\n' || $8 END,
           updated_at = NOW()
         WHERE id = $1`,
        [existing[0].id, full_name, phone, linkedin, cv_data, cv_filename, area, nota]
      );
    } else {
      await sql(
        `INSERT INTO talent_pool (full_name, email, phone, linkedin_url, cv_data, cv_filename, tags, source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'careers_pool', $8)`,
        [full_name, email, phone, linkedin, cv_data, cv_filename, area, nota]
      );
    }
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("POST /api/talent-pool/public error:", error);
    return NextResponse.json({ error: "Could not save your CV" }, { status: 500 });
  }
}
