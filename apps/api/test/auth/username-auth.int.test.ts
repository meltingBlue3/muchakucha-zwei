import { createHash } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { MAIL_PORT, type MailPort } from '../../src/infrastructure/mail/mail.port.js';
import { createApplication } from '../../src/main.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const origin = 'http://127.0.0.1:8081';
const password = 'password';
const registration = { username: 'Family_member', password, confirmPassword: password, platform: 'native' };
let app: NestFastifyApplication;
let mail: MailPort;
let requestAddress = 1;

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function post(path: string, payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: `/api/v1/auth/${path}`,
    headers: { 'content-type': 'application/json', ...headers },
    payload,
    remoteAddress: `127.51.${Math.floor(requestAddress / 250)}.${(requestAddress++ % 250) + 1}`,
  });
}

beforeAll(async () => {
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test',
    WEB_ORIGIN: origin,
    DATABASE_URL: getTestDatabaseUrl(),
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  mail = app.get<MailPort>(MAIL_PORT);
  vi.spyOn(mail, 'sendEmailVerification').mockResolvedValue(undefined);
});

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(mail.sendEmailVerification).mockClear();
});

describe('username registration and login', () => {
  test('registers directly into a native session without an email or verification step', async () => {
    const response = await post('register', registration);
    expect(response.statusCode).toBe(202);
    const credentials = response.json<{ code: string; accessToken: string; refreshToken: string }>();
    expect(credentials).toEqual({
      code: 'REGISTRATION_ACCEPTED', accessToken: expect.any(String), refreshToken: expect.any(String),
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(mail.sendEmailVerification).not.toHaveBeenCalled();

    const me = await app.getHttpAdapter().getInstance().inject({
      method: 'GET', url: '/api/v1/users/me', headers: { authorization: `Bearer ${credentials.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ username: 'Family_member', displayName: 'Family_member', email: '', emailVerified: false });

    await withDatabase(async (client) => {
      const result = await client.query<{ email: null; email_canonical: null; password_hash: string; email_verified_at: null }>(
        `SELECT "email", "email_canonical", "password_hash", "email_verified_at"
         FROM "User" WHERE "username_canonical" = 'family_member'`,
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ email: null, email_canonical: null, email_verified_at: null });
      expect(result.rows[0]!.password_hash).toMatch(/^\$argon2id\$/);
      expect(await argon2.verify(result.rows[0]!.password_hash, password)).toBe(true);
      const tokens = await client.query<{ token_hash: string }>('SELECT "token_hash" FROM "RefreshToken"');
      expect(tokens.rows).toEqual([{ token_hash: createHash('sha256').update(credentials.refreshToken).digest('hex') }]);
      const verification = await client.query('SELECT 1 FROM "EmailVerificationToken"');
      expect(verification.rows).toHaveLength(0);
    });

    const refreshed = await post('refresh', { refreshToken: credentials.refreshToken });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().refreshToken).not.toBe(credentials.refreshToken);
  });

  test('issues Web refresh only in a bounded HttpOnly cookie and restores the registered session', async () => {
    const response = await post('register', { ...registration, platform: 'web' }, { origin });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ code: 'REGISTRATION_ACCEPTED', accessToken: expect.any(String) });
    const cookie = response.headers['set-cookie'] as string;
    expect(cookie).toMatch(/^mk_refresh_dev=/);
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=None/i);
    expect(cookie).toMatch(/Max-Age=2592000/i);
    expect(cookie).not.toContain('pending');
    const restored = await post('refresh', {}, { origin, cookie: cookie.split(';')[0]! });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toEqual({ accessToken: expect.any(String) });
    expect(restored.headers['set-cookie']).not.toBe(cookie);
  });

  test('keeps production registration cookies Secure, HttpOnly, and SameSite=Lax', async () => {
    const previousEnvironment = process.env.NODE_ENV;
    const previousOrigin = process.env.WEB_ORIGIN;
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://family.example.test';
    try {
      const response = await post('register', { ...registration, platform: 'web' }, { origin: 'https://family.example.test' });
      expect(response.statusCode).toBe(202);
      expect(response.headers['set-cookie']).toMatch(/^__Secure-mk_refresh=/);
      expect(response.headers['set-cookie']).toMatch(/HttpOnly; Secure; SameSite=Lax/i);
      expect(response.json().refreshToken).toBeUndefined();
    } finally {
      if (previousEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnvironment;
      if (previousOrigin === undefined) delete process.env.WEB_ORIGIN;
      else process.env.WEB_ORIGIN = previousOrigin;
    }
  });

  test('enforces one canonical username and one session under concurrent normalized registrations', async () => {
    const responses = await Promise.all([
      post('register', { ...registration, username: '  Me\u0301Mber  ' }),
      post('register', { ...registration, username: 'm\u00e9mber' }),
    ]);
    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([202, 409]);
    expect(responses.find(({ statusCode }) => statusCode === 409)!.json().error.code).toBe('USERNAME_TAKEN');
    await withDatabase(async (client) => {
      const users = await client.query('SELECT 1 FROM "User"');
      const sessions = await client.query('SELECT 1 FROM "AuthSession"');
      expect(users.rows).toHaveLength(1);
      expect(sessions.rows).toHaveLength(1);
    });
  });

  test('accepts Unicode letters and digits and uses Unicode case normalization for login', async () => {
    for (const username of ['家庭123', 'İPEK', '𐐀bc', 'İ'.repeat(32)]) {
      expect((await post('register', { ...registration, username })).statusCode).toBe(202);
      expect((await post('login', { username, password, platform: 'native' })).statusCode).toBe(200);
      expect((await post('login', { username: username.toLowerCase(), password, platform: 'native' })).statusCode).toBe(200);
    }
    expect((await post('register', { ...registration, username: '  Me\u0301Mber ' })).statusCode).toBe(202);
    const response = await post('login', { username: ' MÉMBER ', password, platform: 'native' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(mail.sendEmailVerification).not.toHaveBeenCalled();
  });

  test('returns generic invalid credentials for missing accounts and incorrect passwords', async () => {
    await post('register', registration);
    const wrong = await post('login', { username: registration.username, password: 'wrong-password', platform: 'native' });
    const missing = await post('login', { username: 'missing', password, platform: 'native' });
    expect([wrong.statusCode, missing.statusCode]).toEqual([401, 401]);
    expect(wrong.json().error).toEqual(missing.json().error);
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  test('rejects missing, mixed, malformed, mismatched and excessive signup fields before creating state', async () => {
    const invalid: Record<string, unknown>[] = [
      { ...registration, username: undefined },
      { ...registration, username: null },
      { ...registration, username: '  ' },
      { ...registration, username: 'ab' },
      { ...registration, username: 'x'.repeat(33) },
      { ...registration, username: 'family member' },
      { ...registration, username: 'member@example.test' },
      { ...registration, username: 'family😀' },
      { ...registration, email: 'member@example.test' },
      { ...registration, displayName: 'Member' },
      { ...registration, password: 'short', confirmPassword: 'short' },
      { ...registration, password: 'x'.repeat(129), confirmPassword: 'x'.repeat(129) },
      { ...registration, confirmPassword: undefined },
      { ...registration, confirmPassword: null },
      { ...registration, confirmPassword: 'different-password' },
      { ...registration, role: 'admin' },
    ];
    for (const body of invalid) {
      expect((await post('register', body)).statusCode).toBe(400);
    }
    await withDatabase(async (client) => {
      expect((await client.query('SELECT 1 FROM "User"')).rows).toHaveLength(0);
    });
  });

  test('rejects ambiguous login identities and mixed credential transports', async () => {
    const bodies = [
      { username: registration.username, email: 'member@example.test', password, platform: 'native' },
      { password, platform: 'native' },
      { username: null, password, platform: 'native' },
    ];
    for (const body of bodies) expect((await post('login', body)).statusCode).toBe(400);
    expect((await post('register', registration, { origin })).statusCode).toBe(400);
    expect((await post('register', { ...registration, platform: 'web' })).statusCode).toBe(400);
  });

  test('database requires exactly one complete account identity', async () => {
    await withDatabase(async (client) => {
      const invalidIdentityColumns = [
        { columns: '', values: [] },
        { columns: ', "username"', values: ['family'] },
        { columns: ', "email", "email_canonical", "username", "username_canonical"', values: ['a@example.test', 'a@example.test', 'family', 'family'] },
      ];
      for (const identity of invalidIdentityColumns) {
        const placeholders = identity.values.map((_, index) => `, $${index + 1}`).join('');
        await expect(client.query(
          `INSERT INTO "User" ("display_name", "password_hash"${identity.columns}) VALUES ('Member', '$argon2id$fixture'${placeholders})`,
          identity.values,
        )).rejects.toMatchObject({ code: '23514' });
      }
    });
  });
});
