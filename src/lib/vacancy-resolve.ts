/**
 * Decisión de a qué vacante del ATS cae una postulación pública.
 *
 * El mapa escrito a mano sigue mandando cuando el job_id está ahí. Si no,
 * manda el vínculo explícito de la requisición (web_vacancy_id → vacancy_id):
 * es el único dato que distingue dos cargos con el mismo título en ciudades
 * distintas. El título queda de último recurso y solo cuando hay un único
 * destino; si falta el vínculo o hay más de uno, no se elige al azar.
 */

export type ViaResolucion = "mapa" | "titulo" | "mapa_reemplazado" | "vinculo";

export type VacanteResuelta = {
  id: string;
  titulo: string | null;
  cerrada: boolean;
  via: ViaResolucion;
  aviso: string | null;
};

export type ResolucionVacante =
  | { vacante: VacanteResuelta; motivo: null }
  | { vacante: null; motivo: string };

export type FilaVacante = {
  id: string;
  title: string | null;
  status: string | null;
  client_id?: string | null;
};

export type ConsultaVacantes = {
  vacantePorId(id: string): Promise<{ fila: FilaVacante | null; error: boolean }>;
  vinculosPorWebJob(jobId: number): Promise<{ vacancyIds: (string | null)[]; error: boolean }>;
  porTitulo(hint: string): Promise<{ filas: FilaVacante[]; error: boolean }>;
};

/**
 * Patrón de ILIKE. El título del ATS tiene que contener el texto de la web,
 * no al revés: "OVERSEAS SALES" contiene "Overseas Sales", pero no contiene
 * "Overseas Sales — Guangzhou".
 */
export function patronTitulo(hint: string): string {
  return `%${hint}%`;
}

const estaAbierta = (v: FilaVacante) => v.status == null || v.status === "open";

function unicas(filas: FilaVacante[]): FilaVacante[] {
  const vistas = new Set<string>();
  const out: FilaVacante[] = [];
  for (const fila of filas) {
    if (!fila.id || vistas.has(fila.id)) continue;
    vistas.add(fila.id);
    out.push(fila);
  }
  return out;
}

function fallo(motivo: string): ResolucionVacante {
  return { vacante: null, motivo };
}

function ok(vacante: VacanteResuelta): ResolucionVacante {
  return { vacante, motivo: null };
}

export async function resolverVacanteCon(
  jobId: number,
  jobTitle: string | undefined,
  consulta: ConsultaVacantes,
  mapa: Record<number, string>,
  titleHints: Record<number, string>,
  clienteId: string,
): Promise<ResolucionVacante> {
  const hint = (titleHints[jobId] || jobTitle || "").trim();
  const mapeada = mapa[jobId];

  if (mapeada) {
    const leida = await consulta.vacantePorId(mapeada);
    const fila = leida.error ? null : leida.fila;

    if (fila && !estaAbierta(fila) && hint) {
      const busqueda = await consulta.porTitulo(hint);
      const abierta = busqueda.error ? undefined : busqueda.filas.find(estaAbierta);
      if (abierta && abierta.id !== mapeada) {
        const aviso =
          `el mapa manda el job_id ${jobId} a "${fila.title}" (${mapeada}), que está cerrada; ` +
          `se usó la abierta "${abierta.title}" (${abierta.id}). Actualiza VACANCY_MAP.`;
        return ok({ id: abierta.id, titulo: abierta.title, cerrada: false, via: "mapa_reemplazado", aviso });
      }
    }

    const cerrada = Boolean(fila && !estaAbierta(fila));
    return ok({
      id: mapeada,
      titulo: fila?.title ?? null,
      cerrada,
      via: "mapa",
      aviso: cerrada
        ? `la vacante del mapa para el job_id ${jobId} está cerrada y no hay una abierta con ese nombre`
        : null,
    });
  }

  const vinculos = await consulta.vinculosPorWebJob(jobId);
  if (vinculos.error) {
    return fallo(
      `job_id ${jobId}: falló la lectura de ht_requisitions.web_vacancy_id; ` +
        `no se adivina por título para no mezclar vacantes`,
    );
  }

  const ids = [
    ...new Set(
      vinculos.vacancyIds
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim()),
    ),
  ];

  if (ids.length > 1) {
    return fallo(
      `job_id ${jobId}: vínculo ambiguo, ${ids.length} vacancy_id distintos (${ids.join(", ")}); no se elige ninguno`,
    );
  }

  if (ids.length === 1) {
    const destino = ids[0];
    const leida = await consulta.vacantePorId(destino);
    if (leida.error) {
      return fallo(
        `job_id ${jobId}: el vínculo apunta a ${destino} pero no se pudo leer ht_vacancies; no se adivina por título`,
      );
    }
    if (!leida.fila) {
      return fallo(
        `job_id ${jobId}: el vínculo apunta a ${destino} y esa vacante no existe; no se adivina por título`,
      );
    }
    if (leida.fila.client_id && leida.fila.client_id !== clienteId) {
      return fallo(
        `job_id ${jobId}: el vínculo apunta a una vacante de otro cliente; no se usa y no se adivina por título`,
      );
    }
    const cerrada = !estaAbierta(leida.fila);
    return ok({
      id: leida.fila.id,
      titulo: leida.fila.title,
      cerrada,
      via: "vinculo",
      aviso: cerrada
        ? `job_id ${jobId} resuelto por web_vacancy_id → ${leida.fila.id}, pero esa vacante está cerrada`
        : null,
    });
  }

  if (vinculos.vacancyIds.length > 0) {
    return fallo(
      `job_id ${jobId}: hay requisición con web_vacancy_id pero sin vacancy_id; no se adivina por título`,
    );
  }

  if (!hint) {
    return fallo(`job_id ${jobId}: sin mapa, sin vínculo web_vacancy_id y sin título`);
  }

  const busqueda = await consulta.porTitulo(hint);
  if (busqueda.error) {
    return fallo(`job_id ${jobId}: sin vínculo web_vacancy_id y falló la búsqueda por título "${hint}"`);
  }

  const abiertas = unicas(busqueda.filas.filter(estaAbierta));
  if (abiertas.length > 1) {
    return fallo(
      `job_id ${jobId}: sin vínculo web_vacancy_id y el título "${hint}" coincide con ${abiertas.length} ` +
        `vacantes abiertas (${abiertas.map((fila) => fila.id).join(", ")}); no se elige ninguna para no mezclarlas`,
    );
  }
  if (abiertas.length === 1) {
    const elegida = abiertas[0];
    return ok({
      id: elegida.id,
      titulo: elegida.title,
      cerrada: false,
      via: "titulo",
      aviso:
        `job_id ${jobId} no está en VACANCY_MAP · resuelto por título "${hint}" → ` +
        `${elegida.title} (${elegida.id})`,
    });
  }

  const cerradas = unicas(busqueda.filas);
  if (cerradas.length === 1) {
    const elegida = cerradas[0];
    return ok({
      id: elegida.id,
      titulo: elegida.title,
      cerrada: true,
      via: "titulo",
      aviso:
        `job_id ${jobId} no está en VACANCY_MAP · resuelto por título "${hint}" → ` +
        `${elegida.title} (${elegida.id})`,
    });
  }
  if (cerradas.length > 1) {
    return fallo(
      `job_id ${jobId}: sin vínculo web_vacancy_id y el título "${hint}" coincide con ${cerradas.length} vacantes cerradas; no se elige ninguna`,
    );
  }

  return fallo(
    `job_id ${jobId}: sin vínculo web_vacancy_id y ninguna ht_vacancies del cliente contiene el título "${hint}"`,
  );
}

export type DecisionAlta =
  | { accion: "insertar"; registrarEvento: true }
  | {
      accion: "actualizar";
      candidateId: string;
      registrarEvento: false;
      duplicadosPrevios: boolean;
    }
  | { accion: "detener"; registrarEvento: false; motivo: string };

/**
 * Reintento de la misma postulación. Si ya hay candidato para ese correo en
 * esa vacante, solo se toca la fecha: otro insert y otro evento de "aplicó"
 * contarían a la persona dos veces. Si la lectura falla, no se inserta:
 * un error no es lo mismo que "no existe".
 */
export function decidirAltaFunnel(
  existentes: { id: string }[] | null | undefined,
  errorLectura: boolean,
): DecisionAlta {
  if (errorLectura || existentes == null) {
    return {
      accion: "detener",
      registrarEvento: false,
      motivo: "no se pudo leer ht_candidates; no se inserta para no duplicar candidatos ni eventos",
    };
  }
  const ids = existentes.map((fila) => fila.id).filter((id) => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return { accion: "insertar", registrarEvento: true };
  return {
    accion: "actualizar",
    candidateId: ids[0],
    registrarEvento: false,
    duplicadosPrevios: ids.length > 1,
  };
}
