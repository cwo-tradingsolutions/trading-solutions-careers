/**
 * Pruebas complementarias · armado del borrador (sin I/O).
 *
 * El botón «Pruebas complementarias» del Funnel arma un borrador de Gmail con
 * TODAS las pruebas externas del catálogo (`ts_test_providers`, activas) que
 * apliquen. Este módulo es puro: recibe el catálogo y devuelve qué pruebas van
 * y el texto del correo. No lee la base, no llama a Gmail y no envía nada.
 *
 * DISC: el oficial es DISC Prime (`disc_prime`, decisión de Kelly 4-nov-2026).
 * myDISCprofile (`disc_free`) y miperfildisc.com salen del borrador. Sus datos
 * (catálogo y resultados ya cargados) NO se tocan: solo dejan de ofrecerse.
 */
import { candidateSignatureHtml } from "./ats-from";

export type Idioma = "es" | "en";

/** Lo mínimo del catálogo que necesita el armado. */
export type ProveedorCatalogo = {
  key: string;
  nombre: string;
  categoria: string | null;
  portal_url: string | null;
  via: string;
  activo: boolean;
};

export type PruebaBorrador = {
  key: string;
  nombre: string;
  categoria: string | null;
  /** Enlace que ve el candidato; null = placeholder a completar a mano. */
  enlace: string | null;
  /** Nota corta para el candidato (cómo devolver el resultado). */
  nota: string | null;
};

/** Único DISC que se ofrece. */
export const DISC_OFICIAL = "disc_prime";

/**
 * Claves que no van al borrador aunque estén activas en el catálogo.
 * `disc_free` = myDISCprofile. miperfildisc.com nunca estuvo en el catálogo;
 * se excluye por si alguien lo agrega.
 */
export const EXCLUIDAS_DEL_BORRADOR = new Set(["disc_free", "miperfildisc", "mi_perfil_disc"]);

/** Orden en el correo. Las claves nuevas del catálogo van al final. */
const ORDEN = [
  "disc_prime",
  "16personalities",
  "motivacion",
  "betesa",
  "skills_3d",
  "psico_alianza",
  "turing",
  "assessment_tally",
];

/**
 * Enlaces públicos que el candidato puede abrir directamente. El resto del
 * catálogo apunta al portal de administración del proveedor (login de la
 * cuenta de TS) y no sirve para el candidato: va como placeholder para que
 * Talent pegue el enlace personal antes de enviar.
 */
const ENLACE_PUBLICO: Record<string, Partial<Record<Idioma, string>>> = {
  "16personalities": {
    es: "https://www.16personalities.com/es/test-de-personalidad",
    en: "https://www.16personalities.com/free-personality-test",
  },
  motivacion: {
    es: "https://motivation-test-production.up.railway.app/",
    en: "https://motivation-test-production.up.railway.app/",
  },
  assessment_tally: {
    es: "https://tally.so/r/Pdg8EB",
    en: "https://tally.so/r/Pdg8EB",
  },
};

const NOTAS: Record<string, Record<Idioma, string>> = {
  "16personalities": {
    es: "Al terminar, compártenos los dos links que aparecen al darle al ícono de compartir.",
    en: "When you finish, send us the two links that appear under the share icon.",
  },
  disc_prime: {
    es: "Te llegará un enlace personal de DISC Prime.",
    en: "You will get a personal DISC Prime link.",
  },
};

const NOMBRE_VISIBLE: Record<string, Record<Idioma, string>> = {
  disc_prime: { es: "DISC (DISC Prime)", en: "DISC (DISC Prime)" },
  "16personalities": { es: "16 Personalities (MBTI)", en: "16 Personalities (MBTI)" },
  motivacion: { es: "Test de motivación", en: "Motivation test" },
  betesa: { es: "BETESA (Bluesite)", en: "BETESA (Bluesite)" },
  skills_3d: { es: "3D Skills (Bluesite)", en: "3D Skills (Bluesite)" },
  psico_alianza: { es: "Psicoalianza", en: "Psicoalianza" },
  turing: { es: "Máquina de Turing (TuringLab)", en: "Turing Machine (TuringLab)" },
  assessment_tally: { es: "Assessment situacional", en: "Situational assessment" },
};

function esDisc(p: ProveedorCatalogo): boolean {
  const k = p.key.toLowerCase();
  return k.includes("disc") || /\bdisc\b/i.test(p.nombre);
}

/**
 * Qué pruebas van al borrador: activas, sin las excluidas y con DISC Prime
 * como único DISC (cualquier otro DISC del catálogo queda fuera).
 */
export function seleccionarPruebas(catalogo: ProveedorCatalogo[]): ProveedorCatalogo[] {
  const elegidas = catalogo.filter((p) => {
    const k = p.key.toLowerCase();
    if (!p.activo) return false;
    if (EXCLUIDAS_DEL_BORRADOR.has(k)) return false;
    if (esDisc(p) && k !== DISC_OFICIAL) return false;
    return true;
  });
  const pos = (k: string) => {
    const i = ORDEN.indexOf(k.toLowerCase());
    return i === -1 ? ORDEN.length : i;
  };
  return elegidas.sort((a, b) => pos(a.key) - pos(b.key) || a.nombre.localeCompare(b.nombre));
}

export function aPruebaBorrador(p: ProveedorCatalogo, lang: Idioma): PruebaBorrador {
  const k = p.key.toLowerCase();
  let enlace = ENLACE_PUBLICO[k]?.[lang] ?? null;
  // Una clave nueva que el candidato presenta solo con un enlace público.
  if (!enlace && !(k in ENLACE_PUBLICO) && p.via === "candidato" && p.portal_url) enlace = p.portal_url;
  return {
    key: p.key,
    nombre: NOMBRE_VISIBLE[k]?.[lang] ?? p.nombre,
    categoria: p.categoria,
    enlace,
    nota: NOTAS[k]?.[lang] ?? null,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const PLACEHOLDER: Record<Idioma, string> = {
  es: "[ PEGAR ENLACE PERSONALIZADO ]",
  en: "[ PASTE PERSONAL LINK ]",
};

export type BorradorArmado = {
  subject: string;
  html: string;
  texto: string;
  pruebas: PruebaBorrador[];
  /** Nombres de las pruebas que quedaron con placeholder. */
  placeholders: string[];
};

export function armarBorrador(opts: {
  catalogo: ProveedorCatalogo[];
  lang: Idioma;
  candidateName: string;
  firstName: string;
  vacancyTitle: string;
}): BorradorArmado {
  const { lang } = opts;
  const pruebas = seleccionarPruebas(opts.catalogo).map((p) => aPruebaBorrador(p, lang));
  const placeholders = pruebas.filter((p) => !p.enlace).map((p) => p.nombre);
  const en = lang === "en";

  const subject = en
    ? `Trading Solutions · Complementary assessments for ${opts.candidateName}`
    : `Trading Solutions · Pruebas complementarias para ${opts.candidateName}`;

  const intro = en
    ? `You have reached the next stage for the <strong>${esc(opts.vacancyTitle)}</strong> position. Before the final interview we would like to understand a little more about how you think and work · these questionnaires give us that picture.`
    : `Llegaste a la siguiente etapa para la posición de <strong>${esc(opts.vacancyTitle)}</strong>. Antes de la entrevista final queremos conocer un poco más cómo piensas y trabajas · estos cuestionarios nos ayudan a tener esa lectura.`;
  const tiempo = en
    ? "Take your time · you can split them across several sessions. There are no right answers, only your own way of seeing things."
    : "Tómate tu tiempo · puedes repartirlas en varias sesiones. No hay respuestas correctas, solo tu forma de ver las cosas.";
  const cierre = en
    ? "Let us know through this same email when you are done. If anything comes up along the way, just write to us."
    : "Cuando termines, cuéntanos por este mismo correo. Si surge cualquier duda en el camino, escríbenos.";
  const saludo = en ? "Hi" : "Hola";

  const items = pruebas
    .map((p) => {
      const destino = p.enlace
        ? `<a href="${esc(p.enlace)}">${esc(p.enlace.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>`
        : `<span class="placeholder">${PLACEHOLDER[lang]}</span>`;
      const nota = p.nota ? `<br>\n        <span class="nota">${esc(p.nota)}</span>` : "";
      return `      <li>\n        <strong>${esc(p.nombre)}:</strong> ${destino}${nota}\n      </li>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; margin: 0; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  ol { padding-left: 20px; }
  ol li { margin-bottom: 14px; }
  a { color: #0a0a0a; text-decoration: underline; }
  .nota { color: #737373; font-size: 13px; }
  .placeholder { background: #fff8e1; padding: 6px 10px; color: #8a6d1c; font-weight: 600; font-size: 13px; }
  p { margin: 0 0 14px; font-size: 14px; }
</style></head><body>
  <div class="container">
    <p>${saludo} <strong>${esc(opts.firstName)}</strong>,</p>

    <p>${intro}</p>

    <ol>
${items}
    </ol>

    <p>${tiempo}</p>

    <p>${cierre}</p>

    ${candidateSignatureHtml(lang)}
  </div>
</body></html>`;

  const texto = [
    `${saludo} ${opts.firstName},`,
    "",
    intro.replace(/<\/?strong>/g, ""),
    "",
    ...pruebas.map(
      (p, i) =>
        `${i + 1}. ${p.nombre}: ${p.enlace ?? PLACEHOLDER[lang]}${p.nota ? `\n   ${p.nota}` : ""}`,
    ),
    "",
    tiempo,
    "",
    cierre,
  ].join("\n");

  return { subject, html, texto, pruebas, placeholders };
}

// ── Registro del borrador ───────────────────────────────────────────────
// Antes se escribía `ht_candidates.tests_battery_sent_at` (columna que no
// existe) dentro de un try/catch vacío: supabase-js no lanza, devuelve
// `{ error }`, así que el fallo se perdía y no quedaba constancia de nada.
// Ahora cada borrador deja una fila en `ht_pruebas_complementarias_envios`
// (sql/20261104_pruebas_complementarias_envios.sql) y el error se devuelve.

export const TABLA_REGISTRO = "ht_pruebas_complementarias_envios";

export type ModoRegistro = "borrador_gmail" | "dry_run";

export type FilaRegistro = {
  candidate_id: string;
  vacancy_id: string | null;
  modo: ModoRegistro;
  idioma: Idioma;
  pruebas: string[];
  placeholders: string[];
  draft_id: string | null;
  gmail_email: string | null;
  creado_por: string | null;
};

/** Lo único que se usa del cliente: insert(...).select(...).single(). */
type ClienteInsert = {
  from: (t: string) => {
    insert: (v: unknown) => {
      select: (c: string) => {
        single: () => PromiseLike<{ data: any; error: { message: string } | null }>;
      };
    };
  };
};

export type ResultadoRegistro =
  | { ok: true; id: string; created_at: string }
  | { ok: false; error: string };

export async function registrarBorrador(db: ClienteInsert, fila: FilaRegistro): Promise<ResultadoRegistro> {
  try {
    const { data, error } = await db.from(TABLA_REGISTRO).insert(fila).select("id, created_at").single();
    if (error) {
      console.error(`[pruebas-complementarias] registro falló (${fila.candidate_id}): ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data.id, created_at: data.created_at };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[pruebas-complementarias] registro falló (${fila.candidate_id}): ${msg}`);
    return { ok: false, error: msg };
  }
}
