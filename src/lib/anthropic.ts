import Anthropic from '@anthropic-ai/sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

// En Vertex AI los modelos llevan la fecha con "@" y los alias sin fecha no
// existen. Se traducen aquí para no tocar los nombres en cada ruta.
const MODELOS_VERTEX: Record<string, string> = {
  'claude-sonnet-4-5': 'claude-sonnet-4-5@20250929',
  'claude-haiku-4-5': 'claude-haiku-4-5@20251001',
  'claude-sonnet-4': 'claude-sonnet-4@20250514',
};

export function modeloVertex(modelo: string): string {
  if (modelo.includes('@')) return modelo;
  const conFecha = modelo.match(/^(.*)-(\d{8})$/);
  if (conFecha) return `${conFecha[1]}@${conFecha[2]}`;
  return MODELOS_VERTEX[modelo] ?? modelo;
}

// Con ANTHROPIC_VERTEX_PROJECT_ID (Google Cloud) usa Vertex AI con la cuenta
// de servicio del servicio, sin llave. Si no, la API de Anthropic con
// ANTHROPIC_API_KEY, como en Vercel.
export function crearAnthropic(): Anthropic {
  const proyecto = process.env.ANTHROPIC_VERTEX_PROJECT_ID;
  if (proyecto) {
    const v = new AnthropicVertex({ projectId: proyecto, region: process.env.CLOUD_ML_REGION || 'global' });
    const crear = v.messages.create.bind(v.messages) as (...a: any[]) => any;
    (v.messages as any).create = (cuerpo: any, opciones?: any) =>
      crear({ ...cuerpo, model: modeloVertex(cuerpo.model) }, opciones);
    return v as unknown as Anthropic;
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
