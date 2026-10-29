import { neon } from "@/lib/sql";
import { previewLibraryBlocked } from "@/lib/preview-readonly";

const sql = neon(process.env.DATABASE_URL!);

export { sql };

export async function initDB() {
  // GET /api/applications llama esto antes de leer. En el preview no hay DDL.
  if (previewLibraryBlocked()) return;
  await sql`
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL,
      job_title TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      linkedin TEXT,
      cv_filename TEXT,
      cv_data TEXT,
      why_ts TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  
  await sql`
    CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id)
  `;
  
  await sql`
    CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status)
  `;
  
  await sql`
    CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC)
  `;

  // ─── Prefilter columns (16 Mandamientos) ─────────────────────────────
  // Se ejecutan idempotentes; ALTER TABLE IF NOT EXISTS lo logramos
  // emulando con DO block + checks por information_schema.
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'applications' AND column_name = 'score'
      ) THEN
        ALTER TABLE applications ADD COLUMN score INTEGER;
      END IF;
    END $$;
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'applications' AND column_name = 'prefilter_data'
      ) THEN
        ALTER TABLE applications ADD COLUMN prefilter_data JSONB;
      END IF;
    END $$;
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_applications_score ON applications(score DESC NULLS LAST)
  `;
}
