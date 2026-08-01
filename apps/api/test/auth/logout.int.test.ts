import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const allowedOrigin = 'http://127.0.0.1:8081';
const accessSecret = 'test-only-access-secret-that-is-longer-than-thirty-two-bytes';
const password = 'correct horse battery staple';

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function insertVerifiedUser(): Promise<string> {
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  return withDatabase(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO "User" ("email", "email_canonical", "display_name", "password_hash", "email_verified_at")
       VALUES ('logout@example.test', 'logout@example.test', 'Member', $1, CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [passwordHash],
    );
    return result.rows[0]!.id;
  });
}

let app: NestFastifyApplication;
let requestAddress = 1;

async function login(platform: 'native' | 'web', origin = allowedOrigin) {
  return app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: {
      'content-type': 'application/json',
      ...(platform === 'web' ? { origin } : {}),
    },
    payload: { email: 'logout@example.test', password, platform },
    remoteAddress: `127.60.${Math.floor(requestAddress / 250)}.${(requestAddress++ % 250) + 1}`,
  });
}

async function logout(
  accessToken: string,
  body?: Record<string, unknown>,
  cookie?: string,
  origin = allowedOrigin,
) {
  return app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/auth/logout',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(cookie ? { origin } : {}),
    },
    payload: body ?? {},
  });
}

async function refresh(refreshToken: string) {
  return app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    headers: { 'content-type': 'application/json' },
    payload: { refreshToken },
  });
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

  const routeProbe = await logout('not-a-token');
  if (routeProbe.statusCode === 404) {
    throw new Error('IMPLEMENTATION_MISSING_LOGOUT_API');
  }
});

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('current-device logout API contract', () => {
  test('revokes exactly the session sid from the verified access token', async () => {
    await insertVerifiedUser();
    const deviceA = await login('native');
    const { accessToken } = deviceA.json() as { accessToken: string };
    expect((await logout(accessToken)).statusCode).toBe(204);

    await withDatabase(async (client) => {
      const sessions = await client.query<{ revoked_at: Date | null }>(
        `SELECT "revoked_at" FROM "AuthSession"`,
      );
      expect(sessions.rows).toHaveLength(1);
      expect(sessions.rows[0]!.revoked_at).not.toBeNull();
    });
  });

  test('rejects attempts to target a user or session through the request body', async () => {
    await insertVerifiedUser();
    const deviceA = await login('native');
    const { accessToken } = deviceA.json() as { accessToken: string };
    const response = await logout(accessToken, { sessionId: 'device-b', userId: 'another-user' });
    expect(response.statusCode).toBe(400);
  });

  test('is idempotent for repeated current-device logout', async () => {
    await insertVerifiedUser();
    const deviceA = await login('native');
    const { accessToken } = deviceA.json() as { accessToken: string };
    const first = await logout(accessToken);
    const second = await logout(accessToken);
    expect([first.statusCode, second.statusCode]).toEqual([204, 204]);
  });

  test('clears the Web refresh cookie with matching name, path, SameSite, HttpOnly, and Secure topology', async () => {
    const productionOrigin = 'https://app.example.test';
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = productionOrigin;
    try {
      await insertVerifiedUser();
      const deviceA = await login('web', productionOrigin);
      const { accessToken } = deviceA.json() as { accessToken: string };
      const issuedCookie = deviceA.headers['set-cookie'] as string;
      const response = await logout(accessToken, undefined, issuedCookie.split(';')[0], productionOrigin);
      const clearedCookie = response.headers['set-cookie'] as string;
      expect(response.statusCode).toBe(204);
      for (const cookie of [issuedCookie, clearedCookie]) {
        expect(cookie).toContain('__Secure-mk_refresh=');
        expect(cookie).toContain('Path=/api/v1/auth');
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Lax/i);
        expect(cookie).toMatch(/; Secure/i);
      }
      expect(clearedCookie).toContain('Max-Age=0');
    } finally {
      process.env.NODE_ENV = 'test';
      process.env.WEB_ORIGIN = allowedOrigin;
    }
  });

  test('prevents the logged-out device refresh token from being used again', async () => {
    const userId = await insertVerifiedUser();
    const deviceA = await login('native');
    const deviceB = await login('native');
    const credentialsA = deviceA.json() as { accessToken: string; refreshToken: string };
    const credentialsB = deviceB.json() as { accessToken: string; refreshToken: string };

    expect((await logout(credentialsA.accessToken)).statusCode).toBe(204);
    expect((await refresh(credentialsA.refreshToken)).statusCode).toBe(401);
    expect((await refresh(credentialsB.refreshToken)).statusCode).toBe(200);

    await withDatabase(async (client) => {
      const sessions = await client.query<{ revoked_at: Date | null }>(
        `SELECT "revoked_at" FROM "AuthSession" WHERE "user_id" = $1 ORDER BY "created_at", "id"`,
        [userId],
      );
      expect(sessions.rows).toHaveLength(2);
      expect(sessions.rows.filter(({ revoked_at }) => revoked_at !== null)).toHaveLength(1);
      expect(sessions.rows.filter(({ revoked_at }) => revoked_at === null)).toHaveLength(1);
    });
  });
});
