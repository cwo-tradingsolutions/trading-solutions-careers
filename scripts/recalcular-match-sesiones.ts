/**
 * Recalcula perfil_cargo y match_data de sesiones YA completadas.
 *
 * Motor oficial: calcularMatch en src/lib/bateria/match.ts (el mismo que
 * llama cerrarSesion al cerrar). No usa cerrarSesion ni
 * POST /api/bateria/recalcular: esos reescriben scores, validity, status
 * y duration. Aquí solo se escriben perfil_cargo y match_data, y solo de
 * los ids que se pasan. No envía correo.
 *
 * DATABASE_URL sale del entorno. Sin --commit no escribe.
 *
 *   DATABASE_URL=... node --experimental-strip-types --import ./scripts/register-ts.mjs \
 *     scripts/recalcular-match-sesiones.ts <uuid> [<uuid>...]
 *   ... --commit
 *
 * Las tres sesiones de IT Operations & Security Administrator que quedaron
 * completed con scores y con perfil_cargo / match_data en null:
 *   b4909310-ccd6-41a1-b7a1-1cd496408e8e
 *   c5cb6352-a2bc-4060-aaa4-ed6cf7f23aee
 *   aca06747-6ecd-471f-a526-7853e31a175a
 */

import postgres from "postgres";
import { planRecalculoMatch, type FilaSesionMatch, type PlanRecalculo } from "../src/lib/bateria/recalcular-match";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FilaDb = {
  id: string;
  status: string | null;
  vacancy_title: string | null;
  perfil_cargo: string | null;
  scores: unknown;
  match_data: unknown;
};

async function main() {
  const argv = process.argv.slice(2);
  const commit = argv.includes("--commit");
  const ids = argv.filter((a) => a !== "--commit");
  if (ids.length === 0 || ids.some((id) => !UUID.test(id))) {
    console.error(
      "Uso: DATABASE_URL=... node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/recalcular-match-sesiones.ts [--commit] <uuid> [<uuid>...]",
    );
    process.exit(1);
  }
  const unicos = [...new Set(ids.map((id) => id.toLowerCase()))];
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL en el entorno. No se leyó ni se escribió nada.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  try {
    const filas = new Map<string, FilaDb>();
    for (const id of unicos) {
      const rows = await sql<FilaDb[]>`
        select id::text as id, status, vacancy_title, perfil_cargo, scores, match_data
        from ts_bat_sessions
        where id = ${id}::uuid
      `;
      if (rows[0]) filas.set(id, rows[0]);
    }

    const planes: PlanRecalculo[] = [];
    const faltan: string[] = [];
    for (const id of unicos) {
      const fila = filas.get(id);
      if (!fila) {
        faltan.push(id);
        console.log(`${id}  NO ENCONTRADA`);
        continue;
      }
      const plan = planRecalculoMatch(fila as FilaSesionMatch);
      planes.push(plan);
      if (plan.accion === "omitir") {
        console.log(`${id}  OMITIR  ${plan.motivo}`);
      } else {
        console.log(
          `${id}  ${fila.vacancy_title ?? ""}  perfil ${plan.antes.perfil_cargo ?? "null"} → ${plan.perfil_cargo}  match ${plan.antes.match_global ?? "null"} → ${plan.match_data.global}`,
        );
      }
    }

    const actualizables = planes.filter((p) => p.accion === "actualizar");
    const bloqueado = faltan.length > 0 || actualizables.length !== unicos.length;
    if (!commit) {
      console.log(bloqueado ? "DRY-RUN. Nada escrito. El plan no está completo." : "DRY-RUN. Nada escrito.");
      process.exit(bloqueado ? 1 : 0);
    }
    if (bloqueado) {
      console.error("No se escribió: hay ids faltantes u omitidos. Quite esos ids o corrija el plan.");
      process.exit(1);
    }

    await sql.begin(async (tx) => {
      for (const plan of actualizables) {
        if (plan.accion !== "actualizar") continue;
        await tx`
          update ts_bat_sessions
          set perfil_cargo = ${plan.perfil_cargo},
              match_data = ${tx.json(plan.match_data)}
          where id = ${plan.id}::uuid
            and status = 'completed'
        `;
      }
    });
    console.log(`COMMIT. ${actualizables.length} sesión(es). Solo perfil_cargo y match_data.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
