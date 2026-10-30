/**
 * /api/recruiter-config
 *
 * GET  → devuelve config actual (email_from, email_bcc, calendly_url, etc).
 *        Lee de la tabla recruiter_config (creada idempotente, una sola fila).
 *        Si no hay fila aún, devuelve los defaults de las env vars.
 *
 * POST → actualiza calendly_url y email_bcc desde la UI (la persona puede
 *        modificarlos sin tocar Vercel). EMAIL_FROM se queda como env var
 *        porque cambiarlo requiere DNS verificado en Resend.
 */
import { neon } from "@/lib/sql";
import { requireAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

async function ensureTable() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    CREATE TABLE IF NOT EXISTS recruiter_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      booking_url TEXT,
      email_bcc TEXT,
      email_reply_to TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT singleton CHECK (id = 1)
    )
  `;
  // Migración idempotente — agrega columnas si no existen
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recruiter_config' AND column_name = 'booking_url') THEN
      ALTER TABLE recruiter_config ADD COLUMN booking_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recruiter_config' AND column_name = 'email_reply_to') THEN
      ALTER TABLE recruiter_config ADD COLUMN email_reply_to TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recruiter_config' AND column_name = 'email_bcc') THEN
      ALTER TABLE recruiter_config ADD COLUMN email_bcc TEXT;
    END IF;
  END $$`;
  await sql`
    INSERT INTO recruiter_config (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function GET() {
  try {
    await ensureTable();
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT * FROM recruiter_config WHERE id = 1`;
    const row = rows[0] ?? {};

    const emailFrom = process.env.EMAIL_FROM ?? "";
    const isTSDomain = /tradingsolutions\.com/i.test(emailFrom);

    return NextResponse.json(
      {
        email_from: emailFrom,
        email_bcc: row.email_bcc ?? process.env.EMAIL_BCC ?? "",
        email_reply_to: row.email_reply_to ?? "",
        booking_url: row.booking_url ?? "",
        resend_domain_status: isTSDomain ? "verified_ts" : "unset",
      },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(req: NextRequest) {
  // Escritura solo para HR Admin. Antes esta ruta aceptaba cambios de
  // cualquiera en internet.
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    await ensureTable();
    const sql = neon(process.env.DATABASE_URL!);
    const body = await req.json();
    const booking_url = (body.booking_url ?? null) as string | null;
    const email_bcc = (body.email_bcc ?? null) as string | null;
    const email_reply_to = (body.email_reply_to ?? null) as string | null;

    await sql`
      UPDATE recruiter_config
      SET booking_url = ${booking_url},
          email_bcc = ${email_bcc},
          email_reply_to = ${email_reply_to},
          updated_at = NOW()
      WHERE id = 1
    `;

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500, headers: corsHeaders }
    );
  }
}
