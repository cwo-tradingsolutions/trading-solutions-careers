import RequisitionsInbox from "@/components/RequisitionsInbox";
import { FIXTURE_FUENTES, FIXTURE_REQUISICIONES, FIXTURE_TABLERO } from "@/lib/requisition-board-fixture";

export const dynamic = "force-static";

/** Pantalla con datos de ejemplo. No lee ni escribe la base. */
export default function RequisicionesEjemploPage() {
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
