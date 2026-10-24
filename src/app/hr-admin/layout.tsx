import type { Metadata } from "next";
import HrShell from "@/components/universe/HrShell";

export const metadata: Metadata = {
  title: "HR Admin · Careers ATS — Trading Solutions",
  description: "Panel de administración del ATS — dashboard, pipeline, CV bank, pruebas y analytics",
  robots: { index: false, follow: false },
};

export default function HRAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-ui="universe" className="min-h-screen bg-ts-canvas text-ts-ink">
      <HrShell>{children}</HrShell>
    </div>
  );
}
