import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { MAIL_PORT } from '../src/infrastructure/mail/mail.port.js';
import { ConsoleMailAdapter } from '../src/infrastructure/mail/console-mail.adapter.js';
import { DisabledMailAdapter } from '../src/infrastructure/mail/disabled-mail.adapter.js';
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
  test('starts in production without SMTP for username-only households', async () => {
    const productionApp = await createApplication({
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://family.example.test',
      JWT_ACCESS_SECRET: 'test-only-production-secret-with-at-least-32-bytes',
      LOG_LEVEL: 'silent',
    });
    try {
      await productionApp.init();
      await productionApp.getHttpAdapter().getInstance().ready();
      expect(productionApp.get(MAIL_PORT)).toBeInstanceOf(DisabledMailAdapter);
      const response = await productionApp.getHttpAdapter().getInstance().inject({
        method: 'GET', url: '/api/v1/openapi.json',
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await productionApp.close();
    }
  });

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

describe('proxy-aware client attribution', () => {
  const proxiedEnvironment = {
    NODE_ENV: 'test',
    WEB_ORIGIN: allowedOrigin,
    JWT_ACCESS_SECRET: 'test-only-secret-with-at-least-32-bytes-of-entropy',
    LOG_LEVEL: 'silent',
    DATABASE_URL: process.env.DATABASE_URL,
  } as const;

  // Registration is the cheapest throttled route to exhaust: the global guard runs
  // before validation, so a rejected body still consumes the 5-per-hour quota.
  async function registerAttempt(
    application: NestFastifyApplication,
    forwardedFor: string,
  ): Promise<number> {
    const response = await application.getHttpAdapter().getInstance().inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: allowedOrigin, 'x-forwarded-for': forwardedFor },
      payload: {},
    });
    return response.statusCode;
  }

  test('leaves the proxy untrusted by default', () => {
    expect(parseRuntimeConfig({ NODE_ENV: 'test', WEB_ORIGIN: allowedOrigin }).trustProxy).toBe(false);
    expect(parseRuntimeConfig({ NODE_ENV: 'test', WEB_ORIGIN: allowedOrigin, TRUST_PROXY: '  ' }).trustProxy)
      .toBe(false);
  });

  test('accepts named proxy addresses and ranges', () => {
    expect(
      parseRuntimeConfig({ NODE_ENV: 'test', WEB_ORIGIN: allowedOrigin, TRUST_PROXY: '127.0.0.1, 10.0.0.0/8' })
        .trustProxy,
    ).toEqual(['127.0.0.1', '10.0.0.0/8']);
  });

  test('rejects blanket proxy trust that would let callers spoof their address', () => {
    for (const value of ['true', '*', 'proxy.example.test', '127.0.0.1/8/8']) {
      expect(() => parseRuntimeConfig({ NODE_ENV: 'test', WEB_ORIGIN: allowedOrigin, TRUST_PROXY: value }))
        .toThrow('TRUST_PROXY must be a comma-separated list');
    }
  });

  test('meters each forwarded client separately behind a trusted proxy', async () => {
    const proxied = await createApplication({ ...proxiedEnvironment, TRUST_PROXY: '127.0.0.1' });
    try {
      await proxied.init();
      await proxied.getHttpAdapter().getInstance().ready();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect(await registerAttempt(proxied, '203.0.113.10')).toBe(400);
      }
      expect(await registerAttempt(proxied, '203.0.113.10')).toBe(429);

      // A different household on the same proxy keeps its own quota.
      expect(await registerAttempt(proxied, '203.0.113.11')).toBe(400);
    } finally {
      await proxied.close();
    }
  });

  test('ignores forwarded addresses when no proxy is trusted', async () => {
    const direct = await createApplication(proxiedEnvironment);
    try {
      await direct.init();
      await direct.getHttpAdapter().getInstance().ready();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect(await registerAttempt(direct, '203.0.113.20')).toBe(400);
      }
      expect(await registerAttempt(direct, '203.0.113.21')).toBe(429);
    } finally {
      await direct.close();
    }
  });
});
