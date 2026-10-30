import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasMaskedCredentialConfig } from './lib/credential-config';
import { previewReadOnlyBlock } from '@/lib/preview-readonly';
import {
  emailFromToken,
  HR_ADMIN_SESSION_COOKIE,
  sessionIssuedAtOk,
  sessionSigningInput,
} from './lib/hr-admin-session-format';

/**
 * Middleware combinado:
 *  1) /api/*        -> CORS preflight + headers
 *  2) /hr-admin/*   -> requiere cookie de sesión HMAC válida (8h), si no → /hr-admin/login
 */

// Validación HMAC con Web Crypto (Edge runtime). Mismo formato que readAdminSession.
async function isValidSession(token: string | undefined, secret: string | undefined): Promise<boolean> {
  if (!token || !secret) return false;
  const parsed = sessionSigningInput(token);
  if (!parsed || !sessionIssuedAtOk(parsed.issuedAt, Date.now())) return false;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(parsed.payload));
    const expectedHex = Array.from(new Uint8Array(expected))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (expectedHex.length !== parsed.signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expectedHex.length; i++) {
      diff |= expectedHex.charCodeAt(i) ^ parsed.signature.charCodeAt(i);
    }
    if (diff !== 0) return false;
    if (!parsed.emailToken || !emailFromToken(parsed.emailToken)) return false;
    return true;
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
        HR_ADMIN_SESSION_SECRET: process.env.HR_ADMIN_SESSION_SECRET,
        ADMIN_SCRIPTS_SECRET: process.env.ADMIN_SCRIPTS_SECRET,
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
    const token = request.cookies.get(HR_ADMIN_SESSION_COOKIE)?.value;
    const secret = (process.env.HR_ADMIN_SESSION_SECRET ?? '').trim();
    const ok = secret.length >= 16 && await isValidSession(token, secret);
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
