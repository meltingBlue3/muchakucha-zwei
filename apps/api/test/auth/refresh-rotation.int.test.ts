import { createHash } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const allowedOrigin = 'http://127.0.0.1:8081';
const accessSecret = 'test-only-access-secret-that-is-longer-than-thirty-two-bytes';

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
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

async function insertSession(
  token: string,
  input: { absoluteExpired?: boolean; consumed?: boolean; refreshExpired?: boolean; revoked?: boolean } = {},
): Promise<{ sessionId: string; tokenId: string }> {
  return withDatabase(async (client) => {
    const user = await client.query<{ id: string }>(
      `INSERT INTO "User" ("email", "email_canonical", "display_name", "password_hash", "email_verified_at")
       VALUES ($1, $1, 'Member', '$argon2id$fixture', CURRENT_TIMESTAMP) RETURNING "id"`,
      [`${token}@example.test`],
    );
    const createdAt = input.absoluteExpired ? new Date(Date.now() - 100_000) : new Date();
    const absoluteEndsAt = input.absoluteExpired ? new Date(Date.now() - 50_000) : new Date(Date.now() + 90 * 86_400_000);
    const session = await client.query<{ id: string }>(
      `INSERT INTO "AuthSession" ("user_id", "created_at", "last_seen_at", "absolute_ends_at", "revoked_at")
       VALUES ($1, $2, $2, $3, $4) RETURNING "id"`,
      [user.rows[0]!.id, createdAt, absoluteEndsAt, input.revoked ? new Date() : null],
    );
    const tokenCreatedAt = input.refreshExpired ? new Date(Date.now() - 100_000) : createdAt;
    const expiresAt = input.refreshExpired ? new Date(Date.now() - 50_000) : new Date(Date.now() + 30 * 86_400_000);
    const refresh = await client.query<{ id: string }>(
      `INSERT INTO "RefreshToken" ("session_id", "token_hash", "created_at", "expires_at", "consumed_at")
       VALUES ($1, $2, $3, $4, $5) RETURNING "id"`,
      [session.rows[0]!.id, hashToken(token), tokenCreatedAt, expiresAt, input.consumed ? new Date() : null],
    );
    return { sessionId: session.rows[0]!.id, tokenId: refresh.rows[0]!.id };
  });
}

let app: NestFastifyApplication;
let requestAddress = 1;

async function refresh(input: { refreshToken?: string; cookie?: string; origin?: string }) {
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    headers: {
      'content-type': 'application/json',
      ...(input.cookie ? { cookie: input.cookie } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
    },
    payload: input.refreshToken === undefined ? {} : { refreshToken: input.refreshToken },
    remoteAddress: `127.30.${Math.floor(requestAddress / 250)}.${(requestAddress++ % 250) + 1}`,
  });
  return response;
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

describe('refresh rotation API contract', () => {
  test('rotates a valid refresh token and retains only generation hashes', async () => {
    const token = 'generation-zero';
    const fixture = await insertSession(token);
    const response = await refresh({ refreshToken: token });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    await withDatabase(async (client) => {
      const rows = await client.query<{
        id: string; parent_id: string | null; token_hash: string; consumed_at: Date | null;
      }>(`SELECT "id", "parent_id", "token_hash", "consumed_at" FROM "RefreshToken" ORDER BY "created_at", "id"`);
      expect(rows.rows).toHaveLength(2);
      const predecessor = rows.rows.find(({ id }) => id === fixture.tokenId)!;
      const successor = rows.rows.find(({ id }) => id !== fixture.tokenId)!;
      expect(predecessor.consumed_at).not.toBeNull();
      expect(successor.parent_id).toBe(predecessor.id);
      expect(successor.token_hash.trim()).toBe(hashToken(response.json().refreshToken));
      expect(rows.rows.map(({ token_hash }) => token_hash)).not.toContain(response.json().refreshToken);
    });
  });

  test.each([
    ['expired', { refreshExpired: true }],
    ['revoked', { revoked: true }],
  ] as const)('rejects a %s refresh token without issuing successor credentials', async (_kind, options) => {
    const token = `${_kind}-refresh-token`;
    await insertSession(token, options);
    const response = await refresh({ refreshToken: token });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    await withDatabase(async (client) => {
      const result = await client.query(`SELECT 1 FROM "RefreshToken"`);
      expect(result.rows).toHaveLength(1);
    });
  });

  test('rejects an unknown refresh token without issuing credentials', async () => {
    const response = await refresh({ refreshToken: 'unknown-refresh-token' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  test('detects replay of a consumed generation and revokes that session family', async () => {
    const token = 'replay-generation-zero';
    const fixture = await insertSession(token);
    const first = await refresh({ refreshToken: token });
    expect(first.statusCode).toBe(200);
    const replay = await refresh({ refreshToken: token });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('REFRESH_REPLAYED');
    await withDatabase(async (client) => {
      const session = await client.query<{ revoked_at: Date | null; compromised_at: Date | null }>(
        `SELECT "revoked_at", "compromised_at" FROM "AuthSession" WHERE "id" = $1`, [fixture.sessionId],
      );
      expect(session.rows[0]!.revoked_at).not.toBeNull();
      expect(session.rows[0]!.compromised_at).not.toBeNull();
    });
  });

  test('keeps two device session families independent when one is compromised', async () => {
    const deviceA = await insertSession('device-a-generation-zero');
    const deviceB = await insertSession('device-b-generation-zero');
    expect((await refresh({ refreshToken: 'device-a-generation-zero' })).statusCode).toBe(200);
    expect((await refresh({ refreshToken: 'device-a-generation-zero' })).statusCode).toBe(401);
    expect((await refresh({ refreshToken: 'device-b-generation-zero' })).statusCode).toBe(200);
    await withDatabase(async (client) => {
      const sessions = await client.query<{ id: string; revoked_at: Date | null }>(
        `SELECT "id", "revoked_at" FROM "AuthSession" WHERE "id" IN ($1, $2)`,
        [deviceA.sessionId, deviceB.sessionId],
      );
      expect(sessions.rows.find(({ id }) => id === deviceA.sessionId)!.revoked_at).not.toBeNull();
      expect(sessions.rows.find(({ id }) => id === deviceB.sessionId)!.revoked_at).toBeNull();
    });
  });

  test('serializes simultaneous use so one succeeds and replay revokes the family', async () => {
    const fixture = await insertSession('contended-generation');
    const responses = await Promise.all([
      refresh({ refreshToken: 'contended-generation' }),
      refresh({ refreshToken: 'contended-generation' }),
    ]);
    expect(responses.filter(({ statusCode }) => statusCode === 200)).toHaveLength(1);
    expect(responses.filter(({ statusCode }) => statusCode === 401)).toHaveLength(1);
    await withDatabase(async (client) => {
      const session = await client.query<{ revoked_at: Date | null; compromised_at: Date | null }>(
        `SELECT "revoked_at", "compromised_at" FROM "AuthSession" WHERE "id" = $1`, [fixture.sessionId],
      );
      expect(session.rows[0]!.revoked_at).not.toBeNull();
      expect(session.rows[0]!.compromised_at).not.toBeNull();
    });
  });

  test('enforces the session absolute expiry even when the refresh generation is otherwise valid', async () => {
    await insertSession('absolute-expiry-generation', { absoluteExpired: true });
    const response = await refresh({ refreshToken: 'absolute-expiry-generation' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  test('password-reset-style global revoke invalidates refresh tokens from every device', async () => {
    const deviceA = await insertSession('reset-device-a');
    const deviceB = await insertSession('reset-device-b');
    await withDatabase(async (client) => {
      await client.query(
        `UPDATE "AuthSession" SET "revoked_at" = CURRENT_TIMESTAMP WHERE "id" IN ($1, $2)`,
        [deviceA.sessionId, deviceB.sessionId],
      );
    });
    const responses = await Promise.all([
      refresh({ refreshToken: 'reset-device-a' }),
      refresh({ refreshToken: 'reset-device-b' }),
    ]);
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([401, 401]);
  });

  test('accepts one credential source and rejects ambiguous, missing, or cross-platform transport', async () => {
    await insertSession('web-token');
    const ambiguous = await refresh({
      refreshToken: 'native-token', cookie: 'mk_refresh_dev=web-token', origin: allowedOrigin,
    });
    const missing = await refresh({});
    const nativeOrigin = await refresh({ refreshToken: 'web-token', origin: allowedOrigin });
    const webNoOrigin = await refresh({ cookie: 'mk_refresh_dev=web-token' });
    expect([ambiguous.statusCode, missing.statusCode, nativeOrigin.statusCode, webNoOrigin.statusCode])
      .toEqual([400, 400, 400, 400]);
  });

  test('rotates Web cookie credentials without exposing refresh material in JSON', async () => {
    await insertSession('web-generation-zero');
    const response = await refresh({
      cookie: 'mk_refresh_dev=web-generation-zero',
      origin: allowedOrigin,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toMatch(/mk_refresh_dev=.*HttpOnly.*SameSite=None/i);
    expect(response.headers['set-cookie']).toContain('Path=/api/v1/auth');
    expect(JSON.stringify(response.json())).not.toMatch(/refreshToken/);
  });
});
