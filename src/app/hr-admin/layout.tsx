import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HR Admin · Careers ATS — Trading Solutions",
  description: "Panel de administración del ATS — dashboard, pipeline, CV bank, pruebas y analytics",
  robots: { index: false, follow: false },
};

export default function HRAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-ui="universe" className="min-h-screen bg-ts-canvas text-ts-ink">
      <div className="fixed top-0 inset-x-0 z-[60] h-10 flex items-center justify-center bg-amber-400 px-4 text-center text-[13px] font-semibold text-black shadow-sm">
        Preview solo lectura — los cambios no se guardan
      </div>
      <div className="pt-10">{children}</div>
    </div>
  );
}
