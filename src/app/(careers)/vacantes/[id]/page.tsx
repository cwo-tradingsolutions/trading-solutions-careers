import { Suspense } from "react";
import type { Metadata } from "next";
import { neon } from "@/lib/sql";
import { jobs } from "@/data/jobs";
import { ogLocale } from "@/i18n/locales";
import { localeFromRequest } from "@/i18n/server-locale";
import { translations } from "@/i18n/translations";
import { isPreviewTestMode } from "@/lib/preview-mode";
import { PreviewTestShell } from "@/components/careers/PreviewTestShell";
import JobView from "./job-view";

function localizedMeta(title: string, description: string): Metadata {
  const locale = localeFromRequest();
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "Trading Solutions Careers",
      locale: ogLocale(locale),
    },
  };
}

export const dynamic = "force-dynamic";

type OpenVacancy = { title?: string; title_es?: string; title_en?: string };

/** Cloud Run has no DATABASE_URL; @/lib/sql reads PGHOST / PGUSER / PGDATABASE / PGPASSWORD. */
async function fetchOpenVacancy(id: number): Promise<OpenVacancy | null> {
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`SELECT title, title_es, title_en FROM vacancies WHERE id = ${id} AND status = 'open' LIMIT 1`;
  return (rows[0] as OpenVacancy | undefined) ?? null;
}

function staticTitle(id: number, locale: string): { open: boolean; title: string } {
  const known = jobs.find((job) => job.id === id);
  if (!known) return { open: false, title: "" };
  const title = locale === "es" ? known.title.es || known.title.en : known.title.en;
  return { open: true, title };
}

async function isOpenVacancy(id: number, locale: string): Promise<{ open: boolean; title: string }> {
  try {
    const row = await fetchOpenVacancy(id);
    if (!row) return { open: false, title: "" };
    const title =
      locale === "es"
        ? row.title_es || row.title_en || row.title || ""
        : row.title_en || row.title || row.title_es || "";
    return { open: true, title };
  } catch {
    return staticTitle(id, locale);
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const locale = localeFromRequest();
  const meta = translations[locale].meta;
  if (params.id === "pool") {
    return { ...localizedMeta(meta.poolTitle, meta.poolDescription), robots: { index: true, follow: true } };
  }
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return { ...localizedMeta(meta.closedTitle, meta.closedDescription), robots: { index: false, follow: true } };
  }
  const { open, title } = await isOpenVacancy(id, locale);
  if (!open) {
    return { ...localizedMeta(meta.closedTitle, meta.closedDescription), robots: { index: false, follow: true } };
  }
  return {
    ...localizedMeta(title ? meta.jobTitle.replace("{title}", title) : meta.jobsTitle, meta.jobsDescription),
    robots: { index: true, follow: true },
  };
}

export default function VacantePage({ params }: { params: { id: string } }) {
  const previewTestMode = isPreviewTestMode();
  return (
    <PreviewTestShell>
      <Suspense fallback={<div className="ts-x" style={{ minHeight: "100vh" }} />}>
        <JobView id={params.id} previewTestMode={previewTestMode} />
      </Suspense>
    </PreviewTestShell>
  );
}
