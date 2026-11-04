/**
 * La bateria en ingles.
 *
 * POR QUE UNA CAPA APARTE Y NO UN BANCO NUEVO
 * El banco de items (items.ts) define codigos, escalas, items invertidos,
 * respuestas correctas y pares de consistencia. Si se duplicara el archivo para
 * traducirlo, cualquier ajuste futuro habria que hacerlo dos veces y bastaria
 * un olvido para que dos candidatos quedaran evaluados con instrumentos
 * distintos. Aca solo vive el TEXTO que ve el candidato: el codigo, el orden y
 * el puntaje siguen saliendo de items.ts.
 *
 * ADVERTENCIA PSICOMETRICA
 * Un item traducido no es el mismo item validado. Los puntajes en ingles se
 * leen dentro del grupo en ingles; comparar un percentil de China contra uno de
 * Colombia como si fueran la misma escala no es correcto. Por eso la version
 * que se guarda con cada sesion en ingles lleva el sufijo `-en`.
 */
import {
  BLOCKS,
  BATTERY_VERSION,
  type Block,
  type Item,
} from './items';
import { ITEMS_EN_A } from './items-en-a';
import { ITEMS_EN_BC } from './items-en-bc';
import { ITEMS_EN_DE } from './items-en-de';

export type BatLang = 'es' | 'en';

/** Texto en ingles de un item, indexado por la clave de cada opcion. */
export type ItemTextEn = {
  stem?: string;
  prompt?: string;
  /** tetradas · key -> texto */
  statements?: Record<string, string>;
  /** mc y situacionales · key -> texto */
  options?: Record<string, string>;
  /** figurales · key -> texto alternativo de la imagen */
  alts?: Record<string, string>;
};

export const ITEMS_EN: Record<string, ItemTextEn> = {
  ...ITEMS_EN_A,
  ...ITEMS_EN_BC,
  ...ITEMS_EN_DE,
};

/** Version que se guarda con la sesion. El sufijo deja el idioma en el dato. */
export function batteryVersionFor(lang: BatLang): string {
  return lang === 'en' ? `${BATTERY_VERSION}-en` : BATTERY_VERSION;
}

/**
 * Consentimiento PIPL (solo vacantes de China). Desde 2026-11-04 el resto de
 * candidatos, en ingles o en espanol, ve el texto neutro: ver consent.ts.
 */
export const CONSENT_TEXT_VERSION_EN = 'pipl-2026-09-18';

export const BLOCKS_EN: Record<Block, { label: string; intro: string; timedSeconds: number | null }> = {
  A: {
    label: 'Part 1 of 5',
    intro:
      'You will read a series of statements. Indicate how much you agree with each one, thinking about how you usually are rather than how you would like to be. There are no right or wrong answers, and this part is not timed. Answer with your first reaction; thinking it over does not improve the result.',
    timedSeconds: BLOCKS.A.timedSeconds,
  },
  B: {
    label: 'Part 2 of 5',
    intro:
      'Each group shows four words or phrases. Choose the one that describes you MOST and the one that describes you LEAST. All four may feel similar: choose anyway. Not timed.',
    timedSeconds: BLOCKS.B.timedSeconds,
  },
  C: {
    label: 'Part 3 of 5',
    intro:
      'Another set of statements, this time about what matters to you at work. Same as before: how much you agree. Not timed.',
    timedSeconds: BLOCKS.C.timedSeconds,
  },
  D: {
    label: 'Part 4 of 5',
    intro:
      'This part is timed. It requires no prior knowledge of any trade: everything you need is in each question. If you are not sure, choose the option that seems most reasonable and move on.',
    timedSeconds: BLOCKS.D.timedSeconds,
  },
  E: {
    label: 'Part 5 of 5',
    intro:
      'Last part. Indicate how much you agree, or choose the option that seems most reasonable. Answer frankly. Not timed.',
    timedSeconds: BLOCKS.E.timedSeconds,
  },
};

export function blocksFor(lang: BatLang) {
  return lang === 'en' ? BLOCKS_EN : BLOCKS;
}

/**
 * Devuelve el item con el texto en ingles. Si falta la traduccion de un item,
 * se devuelve el original en espanol: mejor un item en espanol dentro de una
 * prueba en ingles que una pregunta vacia que rompe el conteo del bloque.
 */
export function localizeItem(item: Item, lang: BatLang): Item {
  if (lang !== 'en') return item;
  const t = ITEMS_EN[item.code];
  if (!t) return item;

  switch (item.type) {
    case 'likert':
      return { ...item, stem: t.stem ?? item.stem };
    case 'tetrad':
      return {
        ...item,
        prompt: t.prompt ?? item.prompt,
        statements: item.statements.map((s) => ({ ...s, text: t.statements?.[s.key] ?? s.text })),
      };
    case 'mc':
      return {
        ...item,
        stem: t.stem ?? item.stem,
        options: item.options.map((o) => ({ ...o, text: t.options?.[o.key] ?? o.text })),
      };
    case 'figure':
      return {
        ...item,
        stem: t.stem ?? item.stem,
        options: item.options.map((o) => ({ ...o, alt: t.alts?.[o.key] ?? o.alt })),
      };
    case 'situational':
      return {
        ...item,
        stem: t.stem ?? item.stem,
        options: item.options.map((o) => ({ ...o, text: t.options?.[o.key] ?? o.text })),
      };
  }
}

/** Items del banco sin traduccion en ingles · lo usa el chequeo de cobertura. */
export function missingEnglish(items: Item[]): string[] {
  return items.filter((i) => !ITEMS_EN[i.code]).map((i) => i.code);
}
