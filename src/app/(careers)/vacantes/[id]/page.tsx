import { Suspense } from "react";
import type { Metadata } from "next";
import { neon } from "@neondatabase/serverless";
import { jobs } from "@/data/jobs";
import JobView from "./job-view";

export const dynamic = "force-dynamic";

async function isOpenVacancy(id: number): Promise<boolean | null> {
  if (!process.env.DATABASE_URL) return jobs.some((job) => job.id === id);
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT id FROM vacancies WHERE id = ${id} AND status = 'open' LIMIT 1`;
    return rows.length > 0;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  if (params.id === "pool") {
    return {
      title: "Talent pool — Trading Solutions Careers",
      robots: { index: true, follow: true },
    };
  }
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return { title: "This position is closed — Trading Solutions Careers", robots: { index: false, follow: true } };
  }
  const open = await isOpenVacancy(id);
  if (open === false) {
    return { title: "This position is closed — Trading Solutions Careers", robots: { index: false, follow: true } };
  }
  const known = jobs.find((job) => job.id === id);
  return {
    title: known ? `${known.title.en} — Trading Solutions Careers` : "Open position — Trading Solutions Careers",
    robots: { index: true, follow: true },
  };
}

export default function VacantePage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<div className="ts-x" style={{ minHeight: "100vh" }} />}>
      <JobView id={params.id} />
    </Suspense>
  );
}
