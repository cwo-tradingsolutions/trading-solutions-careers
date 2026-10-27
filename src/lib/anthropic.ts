import Anthropic from '@anthropic-ai/sdk';
import { crearClienteGemini } from './gemini';

// En Google Cloud (GEMINI_VERTEX_PROJECT_ID) la IA es Gemini en Vertex AI,
// con la cuenta de servicio del servicio y sin llave; ver gemini.ts. Si no,
// la API de Anthropic con ANTHROPIC_API_KEY, como en Vercel hasta el cambio.
export function crearAnthropic(): Anthropic {
  if (process.env.GEMINI_VERTEX_PROJECT_ID) {
    return crearClienteGemini() as unknown as Anthropic;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  return new Anthropic({ apiKey: key });
}

// ─── Lazy init para que el build de Next.js no requiera ANTHROPIC_API_KEY ─
let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  _client = crearAnthropic();
  return _client;
}

// Proxy para mantener la API antigua (anthropic.messages.create(...)) sin romper imports
export const anthropic: Anthropic = new Proxy({} as Anthropic, {
  get(_t, prop) {
    const c = getAnthropic() as unknown as Record<PropertyKey, unknown>;
    const v = c[prop];
    return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(c) : v;
  },
});
