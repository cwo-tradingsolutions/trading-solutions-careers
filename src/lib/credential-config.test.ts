import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { isMaskedCredential } from './credential-config';

const KEYS = ['ADMIN_SECRET', 'CRON_SECRET', 'WXM_SERVICE_SECRET', 'HR_ADMIN_SESSION_SECRET', 'ADMIN_SCRIPTS_SECRET'] as const;
const originals = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));
const VALID = 'clave-valida-ficticia-para-pruebas';

beforeEach(() => {
  for (const key of KEYS) process.env[key] = VALID;
});
afterEach(() => {
  for (const key of KEYS) {
    if (originals[key] === undefined) delete process.env[key];
    else process.env[key] = originals[key];
  }
});

function sessionCookie(secret: string): string {
  const timestamp = Date.now().toString();
  const email = Buffer.from('kelly@tradingsolutions.com', 'utf8').toString('base64url');
  const payload = `${timestamp}.${email}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `hr_admin_session=${payload}.${signature}`;
}

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(`https://careers.example.invalid${path}`, init);
}

test('solo los marcadores completos se rechazan; las claves reales y ausencias conservan su tratamiento', () => {
  for (const value of ['[SENSITIVE]', ' [sensitive] ', '\t[REDACTED]\n', '[hidden]']) {
    assert.equal(isMaskedCredential(value), true);
  }
  for (const value of [undefined, '', 'x', VALID, 'prefijo-[SENSITIVE]', '[HIDDEN]-sufijo']) {
    assert.equal(isMaskedCredential(value), false);
  }
});

test('API con un token marcador termina en 503 antes de pasar al handler, sin eco de configuración', async () => {
  for (const key of KEYS) {
    for (const marker of ['[SENSITIVE]', ' [redacted] ', '\t[HIDDEN]\n']) {
      for (const name of KEYS) process.env[name] = VALID;
      process.env[key] = marker;
      const response = await middleware(request('/api/cron/run-reminders', {
        headers: { Authorization: 'Bearer [SENSITIVE]' },
      }));
      let handlerCalled = false;
      // Next ejecuta el handler siguiente solo para una respuesta next().
      if (response.headers.get('x-middleware-next') === '1') handlerCalled = true;
      assert.equal(handlerCalled, false);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      const body = await response.text();
      assert.equal(body, JSON.stringify({ error: 'Servicio temporalmente no disponible.' }));
      for (const secretName of KEYS) assert.equal(body.includes(secretName), false);
      for (const secretValue of ['[SENSITIVE]', '[REDACTED]', '[HIDDEN]', VALID]) {
        assert.equal(body.includes(secretValue), false);
      }
    }
  }
});

test('una cookie HMAC correcta pero firmada con el marcador no abre hr-admin', async () => {
  process.env.ADMIN_SECRET = '[SENSITIVE]';
  const response = await middleware(request('/hr-admin', {
    headers: { Cookie: sessionCookie('[SENSITIVE]') },
  }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-middleware-next'), null);
  assert.equal(response.headers.get('location'), null);
});

test('el marcador bloquea también las pantallas y API de login antes de sus excepciones públicas', async () => {
  process.env.WXM_SERVICE_SECRET = '[HIDDEN]';
  for (const path of ['/hr-admin/login', '/api/hr-admin/login']) {
    const response = await middleware(request(path));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('x-middleware-next'), null);
  }
});

test('cookie válida con clave real sigue pasando y cookie inválida conserva la redirección', async () => {
  const allowed = await middleware(request('/hr-admin', { headers: { Cookie: sessionCookie(VALID) } }));
  assert.equal(allowed.headers.get('x-middleware-next'), '1');
  const denied = await middleware(request('/hr-admin/prep?tab=uno'));
  assert.equal(denied.status, 307);
  assert.equal(new URL(denied.headers.get('location')!).pathname, '/hr-admin/login');
  assert.equal(new URL(denied.headers.get('location')!).searchParams.get('next'), '/hr-admin/prep?tab=uno');
});

test('CORS de API y preflight válidos conservan exactamente sus headers actuales', async () => {
  const preflight = await middleware(request('/api/applications', { method: 'OPTIONS' }));
  assert.equal(preflight.status, 200);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PATCH, DELETE, OPTIONS');
  assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization');
  assert.equal(preflight.headers.get('Access-Control-Max-Age'), '86400');
  const api = await middleware(request('/api/applications'));
  assert.equal(api.headers.get('x-middleware-next'), '1');
  assert.equal(api.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(api.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PATCH, DELETE, OPTIONS');
  assert.equal(api.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization');
});

test('no se agrega bloqueo de configuración por credenciales ausentes o cortas', async () => {
  for (const key of KEYS) delete process.env[key];
  const api = await middleware(request('/api/applications'));
  assert.equal(api.headers.get('x-middleware-next'), '1');
  const admin = await middleware(request('/hr-admin'));
  assert.equal(admin.status, 307);
  const login = await middleware(request('/hr-admin/login'));
  assert.equal(login.headers.get('x-middleware-next'), '1');
  process.env.ADMIN_SECRET = 'x';
  process.env.HR_ADMIN_SESSION_SECRET = VALID;
  const short = await middleware(request('/hr-admin', { headers: { Cookie: sessionCookie(VALID) } }));
  assert.equal(short.headers.get('x-middleware-next'), '1');
});

test('fuera de las rutas cubiertas se conserva next aunque exista un marcador', async () => {
  process.env.ADMIN_SECRET = '[SENSITIVE]';
  const response = await middleware(request('/vacantes'));
  assert.equal(response.headers.get('x-middleware-next'), '1');
});
