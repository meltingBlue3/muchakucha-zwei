import { createHash } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { MAIL_PORT, type MailPort, type PasswordResetMail } from '../../src/infrastructure/mail/mail.port.js';
import { createApplication } from '../../src/main.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const oldPassword = 'correct horse battery staple';
const newPassword = 'new correct horse battery staple';
const accessSecret = 'test-only-access-secret-that-is-longer-than-thirty-two-bytes';
const memberEmail = 'member@example.test';

let app: NestFastifyApplication;
let mailPort: MailPort;
let prisma: PrismaClient;
let requestAddress = 1;

function tokenHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalizeEmail(email: string): string {
  return email.trim().normalize('NFC').toLowerCase();
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

async function createUser(email = memberEmail): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email,
      emailCanonical: canonicalizeEmail(email),
      displayName: 'Reset member',
      passwordHash: await hashPassword(oldPassword),
    },
    select: { id: true },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });
  return user.id;
}

async function createSession(userId: string, refreshSecret: string): Promise<string> {
  const session = await prisma.authSession.create({
    data: {
      userId,
      absoluteEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
      refreshTokens: {
        create: {
          tokenHash: tokenHash(refreshSecret),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
        },
      },
    },
    select: { id: true },
  });
  return session.id;
}

async function requestReset(email: string, remoteAddress?: string) {
  return app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/auth/password-reset/request',
    headers: { 'content-type': 'application/json' },
    payload: { email },
    remoteAddress: remoteAddress
      ?? `127.50.${Math.floor(requestAddress / 250)}.${(requestAddress++ % 250) + 1}`,
  });
}

async function completeReset(body: Record<string, unknown>) {
  return app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/auth/password-reset/complete',
    headers: { 'content-type': 'application/json' },
    payload: body,
    remoteAddress: `127.51.${Math.floor(requestAddress / 250)}.${(requestAddress++ % 250) + 1}`,
  });
}

async function login(password: string) {
  return app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: { email: memberEmail, password, platform: 'native' },
    remoteAddress: `127.52.${Math.floor(requestAddress / 250)}.${(requestAddress++ % 250) + 1}`,
  });
}

async function issueResetToken(email = memberEmail): Promise<string> {
  let delivered!: PasswordResetMail;
  const deliveredPromise = new Promise<PasswordResetMail>((resolve) => {
    vi.spyOn(mailPort, 'sendPasswordReset').mockImplementationOnce(async (message) => {
      delivered = message;
      resolve(message);
    });
  });
  const response = await requestReset(email);
  if (response.statusCode === 404) {
    throw new Error('IMPLEMENTATION_MISSING_RESET_API');
  }
  expect(response.statusCode).toBe(202);
  await deliveredPromise;
  const token = new URL(delivered.resetUrl).searchParams.get('token');
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return token!;
}

beforeAll(async () => {
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: accessSecret,
    EMAIL_LINK_ORIGIN: 'http://127.0.0.1:8081',
    DATABASE_URL: getTestDatabaseUrl(),
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  mailPort = app.get<MailPort>(MAIL_PORT);
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: getTestDatabaseUrl() }) });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
});

beforeEach(async () => {
  await resetDatabase();
  vi.restoreAllMocks();
});

describe('password reset API contract', () => {
  test('returns an equivalent generic response for existing and absent accounts', async () => {
    await createUser();
    const send = vi.spyOn(mailPort, 'sendPasswordReset').mockResolvedValue(undefined);
    const existing = await requestReset(' MEMBER@example.test ');
    if (existing.statusCode === 404) {
      throw new Error('IMPLEMENTATION_MISSING_RESET_API');
    }
    const absent = await requestReset('absent@example.test');

    expect([existing.statusCode, absent.statusCode]).toEqual([202, 202]);
    expect(absent.json()).toEqual(existing.json());
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  });

  test('throttles reset requests identically without revealing account existence', async () => {
    await createUser();
    vi.spyOn(mailPort, 'sendPasswordReset').mockResolvedValue(undefined);
    const existing: number[] = [];
    const absent: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      existing.push((await requestReset(memberEmail, '127.60.0.1')).statusCode);
      absent.push((await requestReset('absent@example.test', '127.60.0.2')).statusCode);
    }
    expect(existing).toEqual([202, 202, 202, 202, 202, 429]);
    expect(absent).toEqual(existing);
  });

  test('stores only a 30-minute token hash, supersedes its active predecessor, and delivers after commit', async () => {
    const userId = await createUser();
    const first = await issueResetToken();
    const firstStored = await prisma.passwordResetToken.findUnique({ where: { tokenHash: tokenHash(first) } });
    expect(firstStored).toMatchObject({ userId, consumedAt: null, invalidatedAt: null });
    expect(firstStored!.expiresAt.getTime() - firstStored!.createdAt.getTime()).toBe(30 * 60 * 1_000);
    expect(JSON.stringify(firstStored)).not.toContain(first);

    vi.restoreAllMocks();
    const second = await issueResetToken();
    const superseded = await prisma.passwordResetToken.findUnique({ where: { tokenHash: tokenHash(first) } });
    expect(superseded?.invalidatedAt).toBeInstanceOf(Date);
    expect(second).not.toBe(first);
    await expect(prisma.passwordResetToken.count({ where: { userId } })).resolves.toBe(2);
  });

  test.each(['expired', 'used', 'unknown', 'superseded'] as const)(
    'rejects a %s reset token without changing credentials',
    async (kind) => {
      const userId = await createUser();
      let token = 'x'.repeat(43);
      if (kind !== 'unknown') {
        token = await issueResetToken();
        await prisma.passwordResetToken.update({
          where: { tokenHash: tokenHash(token) },
          data: kind === 'expired'
            ? {
              createdAt: new Date(Date.now() - 31 * 60 * 1_000),
              expiresAt: new Date(Date.now() - 60 * 1_000),
            }
            : kind === 'used'
              ? { consumedAt: new Date() }
              : { invalidatedAt: new Date() },
        });
      }
      const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
      const response = await completeReset({ token, password: newPassword });
      expect(response.statusCode).toBe(400);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
      expect(after.passwordHash).toBe(before.passwordHash);
    },
  );

  test('rejects a new password from the committed top-3000 fixture without consuming the token', async () => {
    await createUser();
    const token = await issueResetToken();
    const response = await completeReset({ token, password: 'password1234' });
    expect(response.statusCode).toBe(400);
    await expect(prisma.passwordResetToken.findUnique({ where: { tokenHash: tokenHash(token) } }))
      .resolves.toMatchObject({ consumedAt: null });
  });

  test('atomically consumes one valid token, changes the hash, and revokes every device session', async () => {
    const userId = await createUser();
    const sessionIds = await Promise.all([
      createSession(userId, 'reset-device-a'),
      createSession(userId, 'reset-device-b'),
    ]);
    const token = await issueResetToken();
    const response = await completeReset({ token, password: newPassword });
    expect(response.statusCode).toBe(204);

    const stored = await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: tokenHash(token) } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    const sessions = await prisma.authSession.findMany({ where: { id: { in: sessionIds } } });
    expect(stored.consumedAt).toBeInstanceOf(Date);
    await expect(argon2.verify(user.passwordHash, oldPassword)).resolves.toBe(false);
    await expect(argon2.verify(user.passwordHash, newPassword)).resolves.toBe(true);
    expect(sessions).toHaveLength(2);
    expect(sessions.every(({ revokedAt }) => revokedAt instanceof Date)).toBe(true);
  });

  test('rolls back token consumption, password change, and global revoke when the transaction fails', async () => {
    const userId = await createUser();
    const sessionId = await createSession(userId, 'rollback-device');
    const token = await issueResetToken();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION fail_password_reset_revoke() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'injected password reset rollback';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_password_reset_revoke
      BEFORE UPDATE OF revoked_at ON "AuthSession"
      FOR EACH ROW WHEN (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL)
      EXECUTE FUNCTION fail_password_reset_revoke();
    `);
    try {
      const response = await completeReset({ token, password: newPassword });
      expect(response.statusCode).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS fail_password_reset_revoke ON "AuthSession";
        DROP FUNCTION IF EXISTS fail_password_reset_revoke();
      `);
    }

    const resetToken = await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: tokenHash(token) } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    const session = await prisma.authSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(resetToken.consumedAt).toBeNull();
    expect(user.passwordHash).toBe(before.passwordHash);
    expect(session.revokedAt).toBeNull();
  });

  test('denies the old password and accepts the new password only through normal login', async () => {
    await createUser();
    const token = await issueResetToken();
    const reset = await completeReset({ token, password: newPassword });
    expect(reset.statusCode).toBe(204);
    await expect(prisma.authSession.count()).resolves.toBe(0);

    const oldLogin = await login(oldPassword);
    const newLogin = await login(newPassword);
    expect(oldLogin.statusCode).toBe(401);
    expect(newLogin.statusCode).toBe(200);
  });

  test('does not auto-login or return session material after successful reset', async () => {
    await createUser();
    const token = await issueResetToken();
    const response = await completeReset({ token, password: newPassword });
    expect(response.statusCode).toBe(204);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).toBe('');
    await expect(prisma.authSession.count()).resolves.toBe(0);
  });
});
