import { supabaseAdmin } from '@/lib/supabase';

// Archivos de candidatos y capturas de pruebas.
// Con ARCHIVOS_GCS_BUCKET (Google Cloud) van a Cloud Storage, cada bucket de
// Supabase como carpeta: gs://<bucket>/<bucket-supabase>/<ruta>. Sin la
// variable siguen en Supabase Storage. Devuelve la misma forma que
// `supabaseAdmin.storage.from(...)` para que las rutas no cambien.

type Err = { message: string } | null;
type Firmada = { path: string; signedUrl: string; error: string | null };

export interface Almacen {
  upload(ruta: string, cuerpo: Buffer | Uint8Array, opciones?: { upsert?: boolean; contentType?: string; cacheControl?: string }): Promise<{ data: { path: string } | null; error: Err }>;
  remove(rutas: string[]): Promise<{ data: null; error: Err }>;
  download(ruta: string): Promise<{ data: Blob | null; error: Err }>;
  createSignedUrl(ruta: string, segundos: number): Promise<{ data: { signedUrl: string } | null; error: Err }>;
  createSignedUrls(rutas: string[], segundos: number): Promise<{ data: Firmada[] | null; error: Err }>;
  list(carpeta: string, opciones?: { limit?: number; sortBy?: { column: string; order: string } }): Promise<{ data: { name: string; metadata: { size?: number } }[] | null; error: Err }>;
}

const BUCKET_GCS = process.env.ARCHIVOS_GCS_BUCKET;

function mensaje(e: unknown): { message: string } {
  return { message: e instanceof Error ? e.message : String(e) };
}

async function bucketGcs() {
  const { Storage } = await import('@google-cloud/storage');
  return new Storage().bucket(BUCKET_GCS as string);
}

function enGcs(nombre: string): Almacen {
  const objeto = async (ruta: string) => (await bucketGcs()).file(`${nombre}/${ruta}`);
  const firmar = async (ruta: string, segundos: number) => {
    const [url] = await (await objeto(ruta)).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + segundos * 1000 });
    return url;
  };
  return {
    async upload(ruta, cuerpo, opciones) {
      try {
        const f = await objeto(ruta);
        if (!opciones?.upsert) {
          const [existe] = await f.exists();
          if (existe) return { data: null, error: { message: 'The resource already exists' } };
        }
        await f.save(Buffer.from(cuerpo), {
          contentType: opciones?.contentType,
          metadata: opciones?.cacheControl ? { cacheControl: `max-age=${opciones.cacheControl}` } : undefined,
          resumable: false,
        });
        return { data: { path: ruta }, error: null };
      } catch (e) {
        return { data: null, error: mensaje(e) };
      }
    },
    async remove(rutas) {
      try {
        await Promise.all(rutas.map(async (r) => (await objeto(r)).delete({ ignoreNotFound: true })));
        return { data: null, error: null };
      } catch (e) {
        return { data: null, error: mensaje(e) };
      }
    },
    async download(ruta) {
      try {
        const f = await objeto(ruta);
        const [[cuerpo], [meta]] = await Promise.all([f.download(), f.getMetadata()]);
        return { data: new Blob([new Uint8Array(cuerpo)], { type: meta.contentType || 'application/octet-stream' }), error: null };
      } catch (e) {
        return { data: null, error: mensaje(e) };
      }
    },
    async createSignedUrl(ruta, segundos) {
      try {
        return { data: { signedUrl: await firmar(ruta, segundos) }, error: null };
      } catch (e) {
        return { data: null, error: mensaje(e) };
      }
    },
    async createSignedUrls(rutas, segundos) {
      try {
        const data = await Promise.all(rutas.map(async (path) => {
          try {
            return { path, signedUrl: await firmar(path, segundos), error: null };
          } catch (e) {
            return { path, signedUrl: '', error: mensaje(e).message };
          }
        }));
        return { data, error: null };
      } catch (e) {
        return { data: null, error: mensaje(e) };
      }
    },
    async list(carpeta, opciones) {
      try {
        const prefijo = `${nombre}/${carpeta.replace(/\/$/, '')}/`;
        const [archivos] = await (await bucketGcs()).getFiles({ prefix: prefijo, delimiter: '/', maxResults: opciones?.limit ?? 100 });
        const data = archivos
          .map((f) => ({ name: f.name.slice(prefijo.length), metadata: { size: Number(f.metadata.size ?? 0) } }))
          .sort((a, b) => (opciones?.sortBy?.order === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
        return { data, error: null };
      } catch (e) {
        return { data: null, error: mensaje(e) };
      }
    },
  };
}

export function almacen(nombre: string): Almacen {
  return BUCKET_GCS ? enGcs(nombre) : (supabaseAdmin.storage.from(nombre) as unknown as Almacen);
}
