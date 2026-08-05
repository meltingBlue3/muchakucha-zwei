import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { MAIL_PORT } from '../src/infrastructure/mail/mail.port.js';
import { ConsoleMailAdapter } from '../src/infrastructure/mail/console-mail.adapter.js';
import { createApplication, parseRuntimeConfig } from '../src/main.js';

const allowedOrigin = 'http://127.0.0.1:8081';
let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test',
    WEB_ORIGIN: allowedOrigin,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  if (app !== undefined) {
    await app.close();
  }
});

describe('versioned Fastify application boundary', () => {
  test('boots Prisma, AuthModule, cookie parsing, throttling, and OpenAPI under /api/v1', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    expect(fastify.hasRequestDecorator('cookies')).toBe(true);
    expect(app.get(MAIL_PORT)).toBeInstanceOf(ConsoleMailAdapter);

    const openApi = await fastify.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(openApi.statusCode).toBe(200);
    expect(openApi.json()).toMatchObject({ info: { title: 'Muchakucha Zwei API', version: '1.0' } });
  });

  test('allows all credentialed CORS origins in non-production environments', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const allowed = await fastify.inject({
      method: 'OPTIONS',
      url: '/api/v1/docs',
      headers: {
        origin: allowedOrigin,
        'access-control-request-method': 'GET',
      },
    });
    const crossOrigin = await fastify.inject({
      method: 'OPTIONS',
      url: '/api/v1/docs',
      headers: {
        origin: 'http://evil.example',
        'access-control-request-method': 'GET',
      },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    // In test/development, all origins are allowed
    expect(crossOrigin.headers['access-control-allow-origin']).toBe('http://evil.example');
  });

  test('returns stable errors with correlation IDs and rejects non-POST auth mutations', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const missing = await fastify.inject({ method: 'GET', url: '/api/v1/missing' });
    const unsafeMutation = await fastify.inject({ method: 'PATCH', url: '/api/v1/auth/login' });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
      requestId: expect.any(String),
    });
    expect(unsafeMutation.statusCode).toBe(405);
    expect(unsafeMutation.json()).toMatchObject({ error: { code: 'METHOD_NOT_ALLOWED' } });
  });

  test('fails fast on invalid production origins without exposing their values', () => {
    expect(() => parseRuntimeConfig({ NODE_ENV: 'production', WEB_ORIGIN: 'http://example.test/path' }))
      .toThrow('WEB_ORIGIN entries must be exact origins');
  });
});
