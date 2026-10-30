import { GoogleAuth } from 'google-auth-library';

// IA del ATS en Google Cloud: Gemini en Vertex AI, facturado a la misma
// cuenta del proyecto. Las 15 funciones del ATS hablan el formato de mensajes
// de Anthropic (messages.create / messages.stream().finalMessage()); este
// archivo lo traduce a Gemini para no reescribir cada ruta.
//
// Modelos: lo que pedía Sonnet/Opus va al Pro, lo que pedía Haiku al Flash.
// Se cambian con GEMINI_MODELO_PRO / GEMINI_MODELO_RAPIDO sin tocar código.

const PRO = () => process.env.GEMINI_MODELO_PRO || 'gemini-3.1-pro-preview';
const RAPIDO = () => process.env.GEMINI_MODELO_RAPIDO || 'gemini-3-flash-preview';

export function modeloGemini(modelo: string): string {
  if (modelo.startsWith('gemini-')) return modelo;
  return /haiku/i.test(modelo) ? RAPIDO() : PRO();
}

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

// Gemini 3 piensa antes de responder y ese razonamiento gasta del mismo tope
// de salida. Se le suma este margen al max_tokens que pide cada ruta, para que
// el texto visible tenga el espacio que la ruta calculó.
const MARGEN_RAZONAMIENTO = 8192;

class ErrorGemini extends Error {
  status?: number;
  constructor(mensaje: string, status?: number, nombre = 'GeminiError') {
    super(mensaje);
    this.status = status;
    this.name = nombre;
  }
}

function textoDe(c: any): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((b) => (typeof b === 'string' ? b : b?.text ?? '')).join('\n');
  return '';
}

function partes(contenido: any): any[] {
  if (typeof contenido === 'string') return [{ text: contenido }];
  const out: any[] = [];
  for (const b of contenido ?? []) {
    if (b.type === 'text') out.push({ text: b.text });
    else if ((b.type === 'image' || b.type === 'document') && b.source?.type === 'base64') {
      if (b.title || b.context) out.push({ text: [b.title && `Documento: ${b.title}`, b.context].filter(Boolean).join(' · ') });
      out.push({ inlineData: { mimeType: b.source.media_type, data: b.source.data } });
    } else if (b.type === 'document' && b.source?.type === 'text') {
      out.push({ text: b.source.data });
    }
    // tool_use / tool_result: el ATS no los usa.
  }
  return out;
}

// Con Claude, un último mensaje del asistente («{») es el comienzo forzado de
// la respuesta, y la ruta lo vuelve a pegar delante del texto que recibe.
// Gemini no continúa un turno propio: se le pide empezar así y, al volver, se
// quita ese comienzo para que la ruta no lo duplique («{{»).
function separarComienzo(mensajes: any[]): { mensajes: any[]; comienzo: string } {
  const ultimo = mensajes[mensajes.length - 1];
  if (ultimo?.role !== 'assistant') return { mensajes, comienzo: '' };
  const comienzo = textoDe(ultimo.content);
  const resto = mensajes.slice(0, -1);
  const pedido = `\n\nTu respuesta debe empezar exactamente con: ${comienzo}`;
  const previo = resto[resto.length - 1];
  if (previo?.role === 'user') {
    const contenido = typeof previo.content === 'string'
      ? previo.content + pedido
      : [...previo.content, { type: 'text', text: pedido }];
    resto[resto.length - 1] = { ...previo, content: contenido };
  }
  return { mensajes: resto, comienzo };
}

function quitarComienzo(texto: string, comienzo: string): string {
  if (!comienzo) return texto;
  const t = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return t.startsWith(comienzo) ? t.slice(comienzo.length) : t;
}

function cuerpoGemini(p: any) {
  const contents = (p.messages ?? []).map((m: any) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: partes(m.content),
  }));
  const sistema = textoDe(p.system);
  return {
    contents,
    ...(sistema ? { systemInstruction: { parts: [{ text: sistema }] } } : {}),
    generationConfig: {
      maxOutputTokens: (p.max_tokens ?? 4096) + MARGEN_RAZONAMIENTO,
      ...(p.temperature != null ? { temperature: p.temperature } : {}),
      ...(p.top_p != null ? { topP: p.top_p } : {}),
      ...(p.stop_sequences ? { stopSequences: p.stop_sequences } : {}),
      thinkingConfig: { thinkingLevel: process.env.GEMINI_RAZONAMIENTO || 'low' },
    },
  };
}

// La respuesta vuelve con la forma de Anthropic que esperan las rutas.
function aMensaje(d: any, modelo: string, maxTokens: number, comienzo: string) {
  const cand = d.candidates?.[0];
  const texto = quitarComienzo(
    (cand?.content?.parts ?? [])
      .filter((x: any) => !x.thought && typeof x.text === 'string')
      .map((x: any) => x.text)
      .join(''),
    comienzo,
  );
  const salida = (d.usageMetadata?.candidatesTokenCount ?? 0) as number;
  const cortado = cand?.finishReason === 'MAX_TOKENS' || salida > maxTokens;
  if (!cand || (cand.finishReason && !['STOP', 'MAX_TOKENS'].includes(cand.finishReason) && !texto)) {
    throw new ErrorGemini(
      `Gemini no devolvió texto (${cand?.finishReason ?? d.promptFeedback?.blockReason ?? 'sin candidatos'})`,
      502,
    );
  }
  return {
    id: d.responseId ?? 'gemini',
    type: 'message',
    role: 'assistant',
    model: modelo,
    content: [{ type: 'text', text: texto }],
    stop_reason: cortado ? 'max_tokens' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: d.usageMetadata?.promptTokenCount ?? 0, output_tokens: salida },
  };
}

async function generar(p: any, opciones?: { timeout?: number; maxRetries?: number }) {
  const proyecto = process.env.GEMINI_VERTEX_PROJECT_ID;
  const region = process.env.GEMINI_REGION || 'global';
  const host = region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`;
  const modelo = modeloGemini(p.model);
  const url = `https://${host}/v1/projects/${proyecto}/locations/${region}/publishers/google/models/${modelo}:generateContent`;
  const token = await auth.getAccessToken();
  const { mensajes, comienzo } = separarComienzo(p.messages ?? []);
  const cuerpo = JSON.stringify(cuerpoGemini({ ...p, messages: mensajes }));
  const intentos = 1 + (opciones?.maxRetries ?? 2);

  for (let i = 0; ; i++) {
    let r: Response;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: cuerpo,
        signal: AbortSignal.timeout(opciones?.timeout ?? 600_000),
      });
    } catch (e: any) {
      if (e?.name === 'TimeoutError') throw new ErrorGemini('Gemini no respondió a tiempo', undefined, 'APIConnectionTimeoutError');
      if (i + 1 < intentos) continue;
      throw new ErrorGemini(`No se pudo contactar a Gemini: ${e?.message ?? e}`);
    }
    const d: any = await r.json().catch(() => ({}));
    if (r.ok) return aMensaje(d, modelo, p.max_tokens ?? 4096, comienzo);
    // 429 y 5xx se reintentan con espera creciente, como el SDK de Anthropic.
    if ((r.status === 429 || r.status >= 500) && i + 1 < intentos) {
      await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
      continue;
    }
    throw new ErrorGemini(d?.error?.message ?? `Gemini respondió ${r.status}`, r.status);
  }
}

// Cliente con la forma mínima de Anthropic que usan las rutas del ATS.
export function crearClienteGemini() {
  return {
    messages: {
      create: (p: any, opciones?: any) => generar(p, opciones),
      // Solo se usa .finalMessage(): se pide la respuesta completa de una vez.
      stream: (p: any, opciones?: any) => {
        const promesa = generar(p, opciones);
        return { finalMessage: () => promesa };
      },
    },
  };
}
