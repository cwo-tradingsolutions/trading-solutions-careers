import type { Metadata } from "next";
import HrShell from "@/components/universe/HrShell";

export const metadata: Metadata = {
  title: "HR Admin · Careers ATS — Trading Solutions",
  description: "Panel de administración del ATS — dashboard, pipeline, CV bank, pruebas y analytics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function HRAdminLayout({ children }: { children: React.ReactNode }) {
  const preview = process.env.VERCEL_ENV === "preview";
  return (
    <div data-ui="universe" className="min-h-screen bg-[var(--ts-journal)] text-ts-ink">
      <HrShell preview={preview}>{children}</HrShell>
    </div>
  );
}
