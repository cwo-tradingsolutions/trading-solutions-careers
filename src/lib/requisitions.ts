/**
 * REQUISICIONES · el circuito y sus reglas
 *
 * Un solo lugar que define quién puede mover qué. La bandeja del HR Panel, los
 * endpoints que consume WXM y el tablero del líder leen todos de acá: si el
 * circuito estuviera escrito en tres sitios, tarde o temprano dirían cosas
 * distintas y alguien aprobaría algo que no debía.
 *
 * EL CIRCUITO
 *
 *   pedida ──Wellness arma perfil──> con_perfil ──CWO aprueba──> aprobada ──> publicada
 *      ^                                  │                          │
 *      └───── Wellness devuelve ──────────┘                    CWO rechaza
 *             (devuelta, con motivo)                            (rechazada)
 *
 * El CWO aprueba TODAS las requisiciones, sean reemplazo o incremental
 * (confirmado por Kelly, 26-ago-2026). El tipo se conserva porque cambia el
 * trámite presupuestal, no la ruta de aprobación.
 */

export type RequisitionStatus =
  | "pedida"
  | "con_perfil"
  | "devuelta"
  | "aprobada"
  | "rechazada"
  | "publicada";

export type RequisitionType = "reemplazo" | "incremental";

/** Quién mueve cada transición. Nombra roles, no personas. */
export type Actor = "lider" | "wellness" | "cwo" | "sistema";

export const STATUS_LABEL: Record<RequisitionStatus, string> = {
  pedida: "Pedida",
  con_perfil: "En aprobación",
  devuelta: "Devuelta al líder",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  publicada: "Publicada",
};

/** Qué está pasando, en la voz de quien lo lee. */
export const STATUS_HINT: Record<RequisitionStatus, string> = {
  pedida: "Wellness tiene que armar el perfil",
  con_perfil: "Esperando la decisión del CWO",
  devuelta: "El líder tiene que completar lo que falta",
  aprobada: "Lista para publicar",
  rechazada: "El CWO no la aprobó",
  publicada: "El proceso está corriendo",
};

export const TYPE_LABEL: Record<RequisitionType, string> = {
  reemplazo: "Reemplazo · el cupo ya existe",
  incremental: "Incremental · suma cabeza y pasa por presupuesto",
};

/** Estados donde la pelota está del lado del líder. */
export const ESPERA_AL_LIDER: RequisitionStatus[] = ["devuelta"];

/** Estados donde ya no hay nada más que decidir. */
export const CERRADAS: RequisitionStatus[] = ["rechazada", "publicada"];

type Transicion = {
  from: RequisitionStatus[];
  to: RequisitionStatus;
  actor: Actor;
  /** Un motivo escrito es obligatorio: devolver o rechazar sin decir por qué
   *  deja al líder sin saber qué corregir. */
  requiereNota?: boolean;
  label: string;
};

export const TRANSICIONES: Record<string, Transicion> = {
  armar_perfil: {
    from: ["pedida", "devuelta"],
    to: "con_perfil",
    actor: "wellness",
    label: "Enviar a aprobación del CWO",
  },
  devolver: {
    from: ["pedida", "con_perfil"],
    to: "devuelta",
    actor: "wellness",
    requiereNota: true,
    label: "Devolver al líder",
  },
  aprobar: {
    from: ["con_perfil"],
    to: "aprobada",
    actor: "cwo",
    label: "Aprobar",
  },
  rechazar: {
    from: ["con_perfil"],
    to: "rechazada",
    actor: "cwo",
    requiereNota: true,
    label: "Rechazar",
  },
  publicar: {
    from: ["aprobada"],
    to: "publicada",
    actor: "sistema",
    label: "Publicar",
  },
};

export type AccionRequisicion = keyof typeof TRANSICIONES;

/**
 * ¿Se puede hacer esta acción desde este estado?
 *
 * Devuelve el motivo del rechazo en vez de un booleano pelado: la respuesta
 * viaja a la pantalla, y "no se puede" sin explicación es lo que hace que la
 * gente vuelva a intentar lo mismo tres veces.
 */
export function validarTransicion(
  accion: string,
  estadoActual: RequisitionStatus,
  nota?: string | null,
): { ok: true; destino: RequisitionStatus } | { ok: false; error: string } {
  const t = TRANSICIONES[accion];
  if (!t) return { ok: false, error: `Acción desconocida: ${accion}` };

  if (!t.from.includes(estadoActual)) {
    return {
      ok: false,
      error:
        `No se puede "${t.label}" cuando la requisición está en ` +
        `"${STATUS_LABEL[estadoActual]}". Se puede desde: ` +
        t.from.map((s) => STATUS_LABEL[s]).join(" o ") + ".",
    };
  }

  if (t.requiereNota && !String(nota || "").trim()) {
    return {
      ok: false,
      error: `Para "${t.label}" hay que escribir el motivo. Sin él, del otro lado no se sabe qué corregir.`,
    };
  }

  return { ok: true, destino: t.to };
}

/** Acciones disponibles desde un estado — para pintar los botones. */
export function accionesDisponibles(estado: RequisitionStatus): AccionRequisicion[] {
  return (Object.keys(TRANSICIONES) as AccionRequisicion[]).filter((a) =>
    TRANSICIONES[a].from.includes(estado),
  );
}

/**
 * Días que lleva la requisición parada donde está.
 *
 * Es la única métrica que importa mientras no hay candidatos: una requisición
 * de hace nueve días sin tocar es un proceso que todavía no arrancó y nadie
 * está mirando.
 */
export function diasEnEstado(desde: string | null | undefined): number | null {
  if (!desde) return null;
  const ms = Date.now() - new Date(desde).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

/** Campos que Wellness tiene que llenar antes de mandarla al CWO. */
export const CAMPOS_DEL_PERFIL = [
  "job_description",
  "requirements",
  "form_template_key",
] as const;

export function faltaParaElPerfil(req: Record<string, unknown>): string[] {
  const faltantes: string[] = [];
  if (!String(req.job_description || "").trim()) faltantes.push("descripción del cargo");
  if (!String(req.requirements || "").trim()) faltantes.push("requisitos");
  if (!String(req.form_template_key || "").trim()) faltantes.push("plantilla de prefiltro");
  return faltantes;
}

/**
 * Fallback de fuentes. La lista viva es `ht_recruitment_sources`
 * (`cargarFuentes` en recruitment-sources-db.ts). Si la tabla no responde,
 * las pantallas y el POST de postings usan esta constante: las mismas seis
 * claves con las que se siembra la tabla, así un posting ya guardado sigue
 * siendo válido.
 */
export const FUENTES = [
  { key: "careers", label: "Careers", automatico: true, active: true, sort_order: 10 },
  { key: "linkedin", label: "LinkedIn", automatico: false, active: true, sort_order: 20 },
  { key: "turpial", label: "Turpial", automatico: false, active: true, sort_order: 30 },
  { key: "magneto", label: "Magneto", automatico: false, active: true, sort_order: 40 },
  { key: "referidos", label: "Referidos", automatico: false, active: true, sort_order: 50 },
  { key: "otro", label: "Otro", automatico: false, active: true, sort_order: 60 },
] as const;

export type FuenteKey = (typeof FUENTES)[number]["key"];
