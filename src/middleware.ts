import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasMaskedCredentialConfig } from './lib/credential-config';
import { previewReadOnlyBlock } from '@/lib/preview-readonly';
import {
  emailFromToken,
  sessionIssuedAtOk,
  sessionSigningInput,
} from './lib/hr-admin-session-format';

/**
 * Middleware combinado:
 *  1) /api/*        -> CORS preflight + headers
 *  2) /hr-admin/*   -> requiere cookie de sesión HMAC válida, si no → /hr-admin/login
 */

const SESSION_COOKIE = 'hr_admin_session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12 h

// Validación HMAC con Web Crypto (Edge runtime)
async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Sesión Google (email firmado con HR_ADMIN_SESSION_SECRET, 8 h): `<ts>.<b64url(email)>.<hmac>`
async function isValidEmailSession(token: string | undefined, secret: string): Promise<boolean> {
  if (!token || secret.length < 16) return false;
  const parsed = sessionSigningInput(token);
  if (!parsed || !parsed.emailToken || !sessionIssuedAtOk(parsed.issuedAt, Date.now())) return false;
  try {
    const expected = await hmacHex(secret, parsed.payload);
    if (expected.length !== parsed.signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parsed.signature.charCodeAt(i);
    return diff === 0 && Boolean(emailFromToken(parsed.emailToken));
  } catch {
    return false;
  }
}

async function isValidSession(token: string | undefined, secret: string | undefined): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [ts, sig] = parts;
  const ageMs = Date.now() - parseInt(ts, 10);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > SESSION_MAX_AGE_MS) return false;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts));
    const expectedHex = Array.from(new Uint8Array(expected))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    // Comparación en tiempo constante manual
    if (expectedHex.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expectedHex.length; i++) diff |= expectedHex.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Los marcadores de exportación nunca son credenciales. Fallar antes de
  // aceptar cookies, tokens o login evita autorizar un literal adivinable.
  if ((pathname.startsWith('/api') || pathname.startsWith('/hr-admin')) &&
      hasMaskedCredentialConfig({
        ADMIN_SECRET: process.env.ADMIN_SECRET,
        CRON_SECRET: process.env.CRON_SECRET,
        WXM_SERVICE_SECRET: process.env.WXM_SERVICE_SECRET,
      })) {
    return NextResponse.json(
      { error: 'Servicio temporalmente no disponible.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Preview de Vercel puede apuntar a la base de producción. Ahí no se escribe.
  const blocked = previewReadOnlyBlock(process.env.VERCEL_ENV, request.method, pathname);
  if (blocked) {
    return NextResponse.json(blocked, { status: 403 });
  }

  // ---------- 1) Protección de /hr-admin ----------
  if (pathname.startsWith('/hr-admin')) {
    // Permitir login y su API
    if (pathname === '/hr-admin/login' || pathname.startsWith('/api/hr-admin/login')) {
      return NextResponse.next();
    }
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const secret = (process.env.ADMIN_SECRET ?? '').trim();
    const sessionSecret = (process.env.HR_ADMIN_SESSION_SECRET ?? '').trim();
    const ok = (await isValidSession(token, secret)) || (await isValidEmailSession(token, sessionSecret));
    if (!ok) {
      const url = request.nextUrl.clone();
      url.pathname = '/hr-admin/login';
      url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ---------- 2) CORS para /api ----------
  if (pathname.startsWith('/api')) {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/hr-admin/:path*'],
};
