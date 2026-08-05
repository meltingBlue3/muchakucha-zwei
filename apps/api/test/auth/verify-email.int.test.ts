import { createHash } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { MAIL_PORT, type MailPort, type VerificationMail } from '../../src/infrastructure/mail/mail.port.js';
import { createApplication } from '../../src/main.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const allowedOrigin = 'http://127.0.0.1:8081';
const pendingCookieName = 'mk_pending_proof_dev';
const refreshCookieName = 'mk_refresh_dev';

interface RegistrationFixture {
  email: string;
  pendingProof?: string;
  pendingCookie?: string;
  token: string;
}

let app: NestFastifyApplication;
let mailPort: MailPort;
let prisma: PrismaClient;
let requestAddress = 1;

function tokenHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function cookiePair(setCookie: string | string[] | undefined, name: string): string | undefined {
  const values = Array.isArray(setCookie) ? setCookie : setCookie === undefined ? [] : [setCookie];
  return values.map((value) => value.split(';', 1)[0]).find((value) => value?.startsWith(`${name}=`));
}

beforeAll(async () => {
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test',
    WEB_ORIGIN: allowedOrigin,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  mailPort = app.get<MailPort>(MAIL_PORT);
  const adapter = new PrismaPg({ connectionString: getTestDatabaseUrl() });
  prisma = new PrismaClient({ adapter });
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

async function register(platform: 'native' | 'web', email = `${platform}-${requestAddress}@example.test`): Promise<RegistrationFixture> {
  let delivered!: VerificationMail;
  const deliveredPromise = new Promise<VerificationMail>((resolve) => {
    vi.spyOn(mailPort, 'sendEmailVerification').mockImplementationOnce(async (message) => {
      delivered = message;
      resolve(message);
    });
  });
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: {
      'content-type': 'application/json',
      ...(platform === 'web' ? { origin: allowedOrigin } : {}),
    },
    payload: {
      email,
      displayName: 'Verification member',
      password: 'correct horse battery staple',
      platform,
    },
    remoteAddress: `127.20.${Math.floor(requestAddress / 250)}.${(requestAddress++ % 250) + 1}`,
  });
  expect(response.statusCode).toBe(202);
  await deliveredPromise;
  const token = new URL(delivered.verificationUrl).searchParams.get('token');
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

  return {
    email,
    token: token!,
    ...(platform === 'native'
      ? { pendingProof: response.json<{ pendingProof: string }>().pendingProof }
      : { pendingCookie: cookiePair(response.headers['set-cookie'], pendingCookieName)! }),
  };
}

async function complete(
  body: Record<string, unknown>,
  options: { cookie?: string; origin?: string } = {},
) {
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/auth/email-verifications/complete',
    headers: {
      'content-type': 'application/json',
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
    },
    payload: body,
    remoteAddress: `127.21.${Math.floor(requestAddress / 250)}.${(requestAddress++ % 250) + 1}`,
  });
  return response;
}

async function resend(body: Record<string, unknown>, cookie?: string) {
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/auth/email-verifications/resend',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    payload: body,
    remoteAddress: `127.22.${Math.floor(requestAddress / 250)}.${(requestAddress++ % 250) + 1}`,
  });
  return response;
}

describe('email verification API contract', () => {
  test('uses the registration-created Web pending proof for same-device verification and automatic session', async () => {
    const fixture = await register('web');
    const response = await complete({ token: fixture.token }, { cookie: fixture.pendingCookie!, origin: allowedOrigin });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ outcome: 'verified_auto_login', accessToken: expect.any(String) });
    expect(response.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringMatching(new RegExp(`${refreshCookieName}=.+HttpOnly.*SameSite=None`, 'i')),
      expect.stringMatching(new RegExp(`${pendingCookieName}=.*Max-Age=0`, 'i')),
    ]));
    expect(JSON.stringify(response.json())).not.toMatch(/(?:pendingProof|refreshToken)/);
  });

  test('uses the registration-created native pending proof and returns refresh material', async () => {
    const fixture = await register('native');
    const response = await complete({
      token: fixture.token,
      pendingProof: fixture.pendingProof,
      platform: 'native',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      outcome: 'verified_auto_login',
      accessToken: expect.any(String),
      refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(response.headers['set-cookie'] ?? '').not.toMatch(/refresh/i);
  });

  test('verifies cross-device without creating a session and guides login', async () => {
    const fixture = await register('native');
    const response = await complete({ token: fixture.token });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outcome: 'verified_login_required' });
    expect(response.headers['set-cookie'] ?? '').not.toMatch(/refresh/i);
    await expect(prisma.authSession.count()).resolves.toBe(0);
  });

  test.each([
    ['expired', async (fixture: RegistrationFixture) => prisma.emailVerificationToken.update({
      where: { tokenHash: tokenHash(fixture.token) },
      data: {
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1_000),
        expiresAt: new Date(Date.now() - 60 * 60 * 1_000),
      },
    })],
    ['used', async (fixture: RegistrationFixture) => prisma.emailVerificationToken.update({
      where: { tokenHash: tokenHash(fixture.token) },
      data: { consumedAt: new Date(), pendingProofHash: null },
    })],
    ['superseded', async (fixture: RegistrationFixture) => prisma.emailVerificationToken.update({
      where: { tokenHash: tokenHash(fixture.token) },
      data: { invalidatedAt: new Date(), pendingProofHash: null },
    })],
  ] as const)('classifies a %s verification link as a distinct terminal outcome', async (outcome, arrange) => {
    const fixture = await register('native');
    await arrange(fixture);
    const response = await complete({ token: fixture.token });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outcome });
  });

  test('classifies an unknown verification link as invalid', async () => {
    const response = await complete({ token: 'x'.repeat(43) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outcome: 'invalid' });
  });

  test('does not consume a verification token through a mail-landing GET', async () => {
    const fixture = await register('native');
    const landing = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: `/api/v1/auth/email-verifications/complete?token=${fixture.token}`,
    });
    expect(landing.statusCode).toBe(405);
    const stored = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: tokenHash(fixture.token) } });
    expect(stored?.consumedAt).toBeNull();
  });

  test('consumes a verification token and matching pending proof at most once', async () => {
    const fixture = await register('native');
    const request = { token: fixture.token, pendingProof: fixture.pendingProof, platform: 'native' };
    const results = await Promise.all([complete(request), complete(request)]);
    expect(results.map(({ json }) => json<{ outcome: string }>().outcome).sort()).toEqual([
      'used',
      'verified_auto_login',
    ]);
    await expect(prisma.authSession.count()).resolves.toBe(1);
    await expect(prisma.refreshToken.count()).resolves.toBe(1);
  });

  test('resend returns an authoritative 60-second value, supersedes the prior token, and mails after commit', async () => {
    const fixture = await register('native', 'resend@example.test');
    await prisma.emailVerificationToken.update({
      where: { tokenHash: tokenHash(fixture.token) },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    const send = vi.spyOn(mailPort, 'sendEmailVerification').mockResolvedValue(undefined);
    send.mockClear();
    const response = await resend({ email: fixture.email });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ code: 'RESEND_ACCEPTED', retryAfterSeconds: 60 });
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    const oldToken = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: tokenHash(fixture.token) } });
    expect(oldToken?.invalidatedAt).toBeInstanceOf(Date);
    expect(oldToken?.pendingProofHash).toBeNull();
    await expect(prisma.emailVerificationToken.count()).resolves.toBe(2);
  });

  test('enforces resend eligibility on the server and reports remaining eligibility', async () => {
    const fixture = await register('native', 'cooldown@example.test');
    const response = await resend({ email: fixture.email });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: { code: 'RESEND_NOT_ELIGIBLE', retryAfterSeconds: expect.any(Number) },
    });
    expect(response.json().error.retryAfterSeconds).toBeGreaterThanOrEqual(59);
  });

  test('resend stays generic for an unknown identity', async () => {
    const response = await resend({ email: 'unknown@example.test' });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ code: 'RESEND_ACCEPTED', retryAfterSeconds: 60 });
  });

  test('clears Web pending proof with matching attributes even when verification finishes cross-device', async () => {
    const fixture = await register('web');
    const response = await complete({ token: fixture.token }, { origin: allowedOrigin });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outcome: 'verified_login_required' });
    expect(response.headers['set-cookie']).toMatch(new RegExp(
      `${pendingCookieName}=.*Max-Age=0.*Path=/api/v1/auth/email-verifications.*HttpOnly.*SameSite=None`,
      'i',
    ));
  });
});
