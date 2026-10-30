import { notFound } from "next/navigation";
import RequisitionsInbox from "@/components/RequisitionsInbox";
import { FIXTURE_FUENTES, FIXTURE_REQUISICIONES, FIXTURE_TABLERO } from "@/lib/requisition-board-fixture";
import { isPreviewAllowed } from "@/lib/preview-allowed";

export const dynamic = "force-dynamic";

/** Pantalla con datos de ejemplo. No lee ni escribe la base. Fuera de preview, 404. */
export default function RequisicionesEjemploPage() {
  if (!isPreviewAllowed()) notFound();
  return (
    <main className="min-h-screen bg-[var(--ts-canvas)]">
      <div className="max-w-ts mx-auto px-4 sm:px-5 py-5">
        <RequisitionsInbox
          ejemplo={{
            requisiciones: FIXTURE_REQUISICIONES,
            fuentes: FIXTURE_FUENTES,
            vacantes: FIXTURE_TABLERO.vacantes,
          }}
        />
      </div>
    </main>
  );
}
