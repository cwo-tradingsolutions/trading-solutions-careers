"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/context";
import type { Job } from "@/lib/vacancies-adapter";
import { GoArrow, jobString } from "./shared";

export default function JobRow({ job }: { job: Job }) {
  const { t, locale } = useLanguage();
  const dept = (t.deptNames as Record<string, string>)[job.dept] || job.dept;
  const mode = (t.modeNames as Record<string, string>)[job.mode] || job.mode;
  return (
    <Link className="cr-job rv" href={`/vacantes/${job.id}`}>
      <h3>{jobString(job.title, locale)}</h3>
      <div className="meta">
        <b>{dept}</b>
        {job.level}
      </div>
      <div className="meta">
        <b>{job.location}</b>
        {mode}
      </div>
      <span className="go" aria-hidden="true">
        <GoArrow />
      </span>
    </Link>
  );
}
