import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const accessSecret = 'test-only-access-secret-that-is-longer-than-thirty-two-bytes';
const jwt = new JwtService({ secret: accessSecret, signOptions: { algorithm: 'HS256', expiresIn: 15 * 60 } });

interface MemberFixture {
  accessToken: string;
  id: string;
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

async function insertMember(email: string, displayName: string): Promise<MemberFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "User" ("id", "email", "email_canonical", "display_name", "password_hash", "email_verified_at")
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [userId, email, email.trim().normalize('NFC').toLowerCase(), displayName, passwordHash],
    );
    await client.query(
      `INSERT INTO "AuthSession" ("id", "user_id", "absolute_ends_at")
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      [sessionId, userId],
    );
  });
  return {
    id: userId,
    accessToken: await jwt.signAsync({ sub: userId, sid: sessionId }),
  };
}

let app: NestFastifyApplication;
let passwordHash: string;
let member: MemberFixture;
let memberA: MemberFixture;
let memberB: MemberFixture;

async function me(
  accessToken: string,
  method: 'GET' | 'PATCH' = 'GET',
  body?: Record<string, unknown>,
) {
  return app.getHttpAdapter().getInstance().inject({
    method,
    url: '/api/v1/users/me',
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { payload: body }),
  });
}

beforeAll(async () => {
  passwordHash = await argon2.hash('users-me-fixture-password', {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test',
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
  [member, memberA, memberB] = await Promise.all([
    insertMember('member@example.test', 'Member'),
    insertMember('member-a@example.test', 'Member A'),
    insertMember('member-b@example.test', 'Member B'),
  ]);
});

describe('current-user API contract', () => {
  test('registers UsersModule so GET /api/v1/users/me is reachable over booted HTTP', async () => {
    const response = await me(member.accessToken);
    expect(response.statusCode).toBe(200);
  });

  test('requires a valid active access-token session', async () => {
    const missing = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/users/me',
    });
    const nonexistent = await me(await jwt.signAsync({ sub: randomUUID(), sid: randomUUID() }));
    expect([missing.statusCode, nonexistent.statusCode]).toEqual([401, 401]);
  });

  test('returns only the guard-derived subject public profile', async () => {
    const response = await me(member.accessToken);
    expect(response.json()).toEqual({
      id: member.id,
      email: 'member@example.test',
      displayName: 'Member',
      emailVerified: true,
      hasHousehold: false,
    });
  });

  test('makes PATCH /api/v1/users/me reachable and updates only the guard-derived subject', async () => {
    const response = await me(member.accessToken, 'PATCH', { displayName: '  Updated member  ' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: member.id, displayName: 'Updated member' });

    await withDatabase(async (client) => {
      const other = await client.query<{ display_name: string }>(
        `SELECT "display_name" FROM "User" WHERE "id" = $1`,
        [memberA.id],
      );
      expect(other.rows[0]!.display_name).toBe('Member A');
    });
  });

  test('allows two accounts to use the same display name', async () => {
    const responses = await Promise.all([
      me(memberA.accessToken, 'PATCH', { displayName: 'Shared name' }),
      me(memberB.accessToken, 'PATCH', { displayName: 'Shared name' }),
    ]);
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200]);
    expect(responses.map((response) => response.json().displayName)).toEqual(['Shared name', 'Shared name']);
  });

  test('rejects blank display names and unexpected mass-assignment fields', async () => {
    const blank = await me(member.accessToken, 'PATCH', { displayName: '   ' });
    const tooLong = await me(member.accessToken, 'PATCH', { displayName: 'x'.repeat(81) });
    const massAssignment = await me(member.accessToken, 'PATCH', {
      displayName: 'Updated',
      email: 'takeover@example.test',
      role: 'admin',
    });
    expect([blank.statusCode, tooLong.statusCode, massAssignment.statusCode]).toEqual([400, 400, 400]);
  });

  test('rejects cross-account targeting even when a foreign user id is supplied', async () => {
    const response = await me(member.accessToken, 'PATCH', {
      displayName: 'Updated',
      userId: memberA.id,
    });
    expect(response.statusCode).toBe(400);
  });

  test('does not expose auth internals or claim household and Today data in Phase 1', async () => {
    const response = await me(member.accessToken);
    const body = JSON.stringify(response.json());
    expect(body).not.toMatch(/password|refresh|session|token|households|today/i);
  });
});
