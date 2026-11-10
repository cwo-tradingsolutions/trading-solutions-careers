import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HR Admin · Careers ATS — Trading Solutions",
  description: "Panel de administración del ATS — dashboard, pipeline, CV bank, pruebas y analytics",
  robots: { index: false, follow: false },
};

export default function HRAdminLayout({ children }: { children: React.ReactNode }) {
  const preview = process.env.VERCEL_ENV === "preview";
  return (
    <div data-ui="universe" className="min-h-screen bg-ts-canvas text-ts-ink">
      {preview && (
        <div role="status" className="bg-[var(--ts-ink)] text-white text-center text-[13px] px-4 py-2">
          Preview — solo lectura: no se guardan cambios ni se envían correos
        </div>
      )}
      {children}
    </div>
  );
}
