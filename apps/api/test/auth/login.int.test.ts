import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import { AccessTokenGuard } from '../../src/modules/auth/access-token.guard.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const allowedOrigin = 'http://127.0.0.1:8081';
const productionOrigin = 'https://app.example.test';
const accessSecret = 'test-only-access-secret-that-is-longer-than-thirty-two-bytes';
const password = 'correct horse battery staple';

function canonicalizeEmail(email: string): string {
  return email.trim().normalize('NFC').toLowerCase();
}

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function insertUser(email: string, verified: boolean): Promise<string> {
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  return withDatabase(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO "User" ("email", "email_canonical", "display_name", "password_hash", "email_verified_at")
       VALUES ($1, $2, 'Member', $3, CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE NULL END)
       RETURNING "id"`,
      [email, canonicalizeEmail(email), passwordHash, verified],
    );
    return result.rows[0]!.id;
  });
}

let app: NestFastifyApplication;
let requestAddress = 1;

async function login(
  body: Record<string, unknown>,
  options: { origin?: string; production?: boolean; remoteAddress?: string } = {},
) {
  const application = app;
  if (options.production) {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = productionOrigin;
  }
  try {
    const response = await application.getHttpAdapter().getInstance().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: {
        'content-type': 'application/json',
        ...(options.origin ? { origin: options.origin } : {}),
      },
      payload: body,
      remoteAddress: options.remoteAddress
        ?? `127.20.${Math.floor(requestAddress / 250)}.${(requestAddress++ % 250) + 1}`,
    });
    return response;
  } finally {
    if (options.production) {
      process.env.NODE_ENV = 'test';
      process.env.WEB_ORIGIN = allowedOrigin;
    }
  }
}

beforeAll(async () => {
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test',
    WEB_ORIGIN: allowedOrigin,
    JWT_ACCESS_SECRET: accessSecret,
    DATABASE_URL: getTestDatabaseUrl(),
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('login API contract', () => {
  test('logs in a verified account and creates an independent device session', async () => {
    const userId = await insertUser('verified@example.test', true);
    const first = await login({ email: 'VERIFIED@example.test', password, platform: 'native' });
    const second = await login({ email: 'verified@example.test', password, platform: 'native' });
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect(first.json()).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(second.json()).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(second.json().refreshToken).not.toBe(first.json().refreshToken);

    await withDatabase(async (client) => {
      const sessions = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "AuthSession" WHERE "user_id" = $1`, [userId],
      );
      const tokens = await client.query<{ token_hash: string }>(
        `SELECT "token_hash" FROM "RefreshToken" ORDER BY "created_at"`,
      );
      expect(sessions.rows[0]!.count).toBe('2');
      expect(tokens.rows).toHaveLength(2);
      expect(tokens.rows.map(({ token_hash }) => token_hash.trim())).toEqual(expect.arrayContaining([
        createHash('sha256').update(first.json().refreshToken).digest('hex'),
        createHash('sha256').update(second.json().refreshToken).digest('hex'),
      ]));
      expect(tokens.rows.map(({ token_hash }) => token_hash)).not.toContain(first.json().refreshToken);
    });
  });

  test('denies an unverified account without creating a session', async () => {
    const userId = await insertUser('pending@example.test', false);
    const response = await login({ email: 'pending@example.test', password, platform: 'native' });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('EMAIL_NOT_VERIFIED');
    await withDatabase(async (client) => {
      const result = await client.query(`SELECT 1 FROM "AuthSession" WHERE "user_id" = $1`, [userId]);
      expect(result.rows).toHaveLength(0);
    });
  });

  test('uses the same generic invalid-credentials response for unknown email and wrong password', async () => {
    await insertUser('verified@example.test', true);
    const unknown = await login({ email: 'unknown@example.test', password: 'wrong password', platform: 'native' });
    const wrong = await login({ email: 'verified@example.test', password: 'wrong password', platform: 'native' });
    expect([unknown.statusCode, wrong.statusCode]).toEqual([401, 401]);
    expect(wrong.json().error).toEqual(unknown.json().error);
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  test('issues a short-lived access JWT with only verified sub, sid, signature, algorithm, key, and expiry claims', async () => {
    const userId = await insertUser('verified@example.test', true);
    const response = await login({ email: 'verified@example.test', password, platform: 'native' });
    const { accessToken } = response.json() as { accessToken: string };
    const jwt = new JwtService({ secret: accessSecret, signOptions: { algorithm: 'HS256' } });
    const header = JSON.parse(Buffer.from(accessToken.split('.')[0]!, 'base64url').toString('utf8')) as Record<string, unknown>;
    const claims = jwt.verify<Record<string, unknown>>(accessToken, {
      secret: accessSecret,
      algorithms: ['HS256'],
    });
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'sid', 'sub']);
    expect(claims.sub).toBe(userId);
    expect(typeof claims.sid).toBe('string');
    expect((claims.exp as number) - (claims.iat as number)).toBe(15 * 60);
    expect(() => jwt.verify(accessToken, { secret: `${accessSecret}-wrong`, algorithms: ['HS256'] })).toThrow();
    expect(() => jwt.verify(accessToken, { secret: accessSecret, algorithms: ['HS384'] })).toThrow();
  });

  test('access guard accepts an active signed session and rejects it after targeted revocation', async () => {
    await insertUser('guarded@example.test', true);
    const response = await login({ email: 'guarded@example.test', password, platform: 'native' });
    const { accessToken } = response.json() as { accessToken: string };
    const request: { headers: { authorization: string }; auth?: { sub: string; sid: string } } = {
      headers: { authorization: `Bearer ${accessToken}` },
    };
    class GuardTestController {}
    const guardTestHandler = (): void => undefined;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: () => GuardTestController,
      getHandler: () => guardTestHandler,
    } as unknown as ExecutionContext;
    const guard = app.get(AccessTokenGuard);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.auth).toMatchObject({ sub: expect.any(String), sid: expect.any(String) });
    await withDatabase(async (client) => {
      await client.query(`UPDATE "AuthSession" SET "revoked_at" = CURRENT_TIMESTAMP WHERE "id" = $1`, [request.auth!.sid]);
    });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
  });

  test('issues Web refresh only in an HttpOnly cookie and never in JSON', async () => {
    await insertUser('verified@example.test', true);
    const response = await login(
      { email: 'verified@example.test', password, platform: 'web' },
      { origin: allowedOrigin },
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toMatch(/mk_refresh_dev=.*HttpOnly.*SameSite=Lax/i);
    expect(response.headers['set-cookie']).toContain('Path=/api/v1/auth');
    expect(response.headers['set-cookie']).toMatch(/Max-Age=2592000/i);
    expect(JSON.stringify(response.json())).not.toMatch(/refreshToken/);
  });

  test('uses a Secure-prefixed production cookie with bounded Path, SameSite, Secure, and Max-Age attributes', async () => {
    await insertUser('verified@example.test', true);
    const response = await login(
      { email: 'verified@example.test', password, platform: 'web' },
      { origin: productionOrigin, production: true },
    );
    const cookie = response.headers['set-cookie']!;
    expect(cookie).toMatch(/^__Secure-mk_refresh=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/i);
    expect(cookie).toMatch(/Max-Age=2592000/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  test('allows all credentialed CORS origins in non-production environments', async () => {
    await insertUser('verified@example.test', true);
    const accepted = await login(
      { email: 'verified@example.test', password, platform: 'web' },
      { origin: allowedOrigin },
    );
    const crossOrigin = await login(
      { email: 'verified@example.test', password, platform: 'web' },
      { origin: 'https://evil.example' },
    );
    expect(accepted.headers['access-control-allow-origin']).toBe(allowedOrigin);
    // In test/development, all origins are allowed
    expect(crossOrigin.headers['access-control-allow-origin']).toBe('https://evil.example');
    // Login still succeeds for valid credentials regardless of origin
    expect(crossOrigin.statusCode).toBe(200);
  });

  test('rejects caller metadata that crosses native and Web credential transports', async () => {
    await insertUser('verified@example.test', true);
    const nativeWithOrigin = await login(
      { email: 'verified@example.test', password, platform: 'native' },
      { origin: allowedOrigin },
    );
    const webWithoutOrigin = await login({ email: 'verified@example.test', password, platform: 'web' });
    expect([nativeWithOrigin.statusCode, webWithoutOrigin.statusCode]).toEqual([400, 400]);
  });

  test('throttles repeated login attempts without revealing account existence', async () => {
    await insertUser('throttle@example.test', true);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await login(
        { email: 'throttle@example.test', password: 'wrong password', platform: 'native' },
        { remoteAddress: '127.40.0.1' },
      );
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);
  });
});
