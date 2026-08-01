import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { MAIL_PORT, type MailPort } from '../../src/infrastructure/mail/mail.port.js';
import { createApplication } from '../../src/main.js';
import { passwordPolicyFailure } from '../../src/modules/auth/password-policy.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const allowedOrigin = 'http://127.0.0.1:8081';
const prismaSchema = resolve(import.meta.dirname, '../../prisma/schema.prisma');
const authSchemaExists = existsSync(prismaSchema);
const commonPasswords = readFileSync(
  resolve(import.meta.dirname, '../../src/modules/auth/data/common-passwords-top-3000.txt'),
  'utf8',
).trimEnd().split('\n');

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);

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

async function insertUser(
  client: Client,
  input: { email: string; displayName?: string; passwordHash?: string },
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO "User" ("email", "email_canonical", "display_name", "password_hash")
     VALUES ($1, $2, $3, $4)
     RETURNING "id"`,
    [
      input.email,
      canonicalizeEmail(input.email),
      input.displayName ?? 'Member',
      input.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$fixture$safehash',
    ],
  );
  return result.rows[0]!.id;
}

let app: NestFastifyApplication;
let mailPort: MailPort;
let requestAddress = 1;

beforeAll(async () => {
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test',
    WEB_ORIGIN: allowedOrigin,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  mailPort = app.get<MailPort>(MAIL_PORT);
  vi.spyOn(mailPort, 'sendEmailVerification').mockResolvedValue(undefined);
});

afterAll(async () => {
  if (app !== undefined) {
    await app.close();
  }
});

beforeEach(async () => {
  await resetDatabase();
});

async function register(body: Record<string, unknown>, origin?: string) {
  return app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
    },
    payload: body,
    remoteAddress: `127.10.${Math.floor(requestAddress / 250)}.${(requestAddress++ % 250) + 1}`,
  });
}

describe('registration API contract', () => {
  test('returns the same generic 202 response shape for new and existing canonical email', async () => {
    const body = { email: '  Me\u0301Mber@Example.test ', displayName: 'Shared name', password: 'correct horse battery staple', platform: 'native' };
    const first = await register(body);
    const duplicate = await register({ ...body, email: 'm\u00e9mber@example.test' });
    expect([first.statusCode, duplicate.statusCode]).toEqual([202, 202]);
    expect(duplicate.json()).toMatchObject({ code: 'REGISTRATION_ACCEPTED', pendingProof: expect.any(String) });
    expect(first.json()).toMatchObject({ code: 'REGISTRATION_ACCEPTED', pendingProof: expect.any(String) });

    await withDatabase(async (client) => {
      const users = await client.query<{ email: string; email_canonical: string; display_name: string }>(
        `SELECT "email", "email_canonical", "display_name" FROM "User" WHERE "email_canonical" = $1`,
        [canonicalizeEmail(body.email)],
      );
      expect(users.rows).toEqual([{ email: body.email, email_canonical: canonicalizeEmail(body.email), display_name: 'Shared name' }]);
    });
  });

  test('rejects every password in the committed top-3000 common-password fixture', async () => {
    expect(commonPasswords).toHaveLength(3000);
    for (const password of commonPasswords) {
      expect(passwordPolicyFailure(password)).toBe('COMMON_PASSWORD');
    }
    const response = await register({
      email: 'weak@example.test',
      displayName: 'Member',
      password: commonPasswords[0],
      platform: 'native',
    });
    expect(response.statusCode).toBe(400);
  });

  test('persists the password only as an Argon2id hash', async () => {
    const password = 'correct horse battery staple';
    const response = await register({ email: 'argon@example.test', displayName: 'Member', password, platform: 'native' });
    expect(response.statusCode).toBe(202);
    await withDatabase(async (client) => {
      const stored = await client.query<{ password_hash: string }>(
        `SELECT "password_hash" FROM "User" WHERE "email_canonical" = 'argon@example.test'`,
      );
      expect(stored.rows[0]!.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,(?:t=2,p=1|p=1,t=2)\$/);
      expect(stored.rows[0]!.password_hash).not.toContain(password);
    });
  });

  test('rejects blank, overlong, and unexpected registration fields', async () => {
    const invalidBodies = [
      { email: '', displayName: '', password: '', platform: 'native' },
      { email: 'long@example.test', displayName: 'Member', password: 'x'.repeat(129), platform: 'native' },
      { email: 'role@example.test', displayName: 'Member', password: 'correct horse battery staple', platform: 'native', role: 'admin' },
    ];
    for (const body of invalidBodies) {
      expect((await register(body)).statusCode).toBe(400);
    }
  });

  test('issues Web pending proof only as a bounded HttpOnly cookie and omits it from JSON', async () => {
    const response = await register(
      { email: 'web@example.test', displayName: 'Member', password: 'correct horse battery staple', platform: 'web' },
      allowedOrigin,
    );
    expect(response.statusCode).toBe(202);
    expect(response.headers['set-cookie']).toMatch(/mk_pending_proof_dev=.*HttpOnly.*SameSite=Lax/i);
    expect(response.headers['set-cookie']).toContain('Path=/api/v1/auth/email-verifications');
    expect(response.headers['set-cookie']).toMatch(/Max-Age=86400/i);
    expect(JSON.stringify(response.json())).not.toMatch(/pending.*proof/i);

    const invalidOrigin = await register(
      { email: 'evil@example.test', displayName: 'Member', password: 'correct horse battery staple', platform: 'web' },
      'http://evil.example',
    );
    expect(invalidOrigin.statusCode).toBe(400);
  });

  test('returns native pending proof for secure storage without exposing persisted plaintext', async () => {
    const response = await register({
      email: 'native@example.test',
      displayName: 'Member',
      password: 'correct horse battery staple',
      platform: 'native',
    });
    expect(response.statusCode).toBe(202);
    const payload = response.json<{ pendingProof: string }>();
    expect(payload).toMatchObject({ pendingProof: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    await withDatabase(async (client) => {
      const stored = await client.query<{ token_hash: string; pending_proof_hash: string }>(
        `SELECT "token_hash", "pending_proof_hash" FROM "EmailVerificationToken" token
         JOIN "User" account ON account."id" = token."user_id"
         WHERE account."email_canonical" = 'native@example.test'`,
      );
      expect(stored.rows[0]!.token_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.rows[0]!.pending_proof_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.rows[0]!.pending_proof_hash).not.toBe(payload.pendingProof);
    });
  });

  test('keeps concurrent canonical registrations atomic while allowing duplicate display names', async () => {
    const base = { displayName: 'Duplicate nickname', password: 'correct horse battery staple', platform: 'native' };
    const [first, equivalent, other] = await Promise.all([
      register({ ...base, email: '  Race@Example.test ' }),
      register({ ...base, email: 'race@example.test' }),
      register({ ...base, email: 'other-race@example.test' }),
    ]);
    expect([first.statusCode, equivalent.statusCode, other.statusCode]).toEqual([202, 202, 202]);
    await withDatabase(async (client) => {
      const canonicalCount = await client.query<{ count: string }>(
        `SELECT count(*) FROM "User" WHERE "email_canonical" = 'race@example.test'`,
      );
      const nicknameCount = await client.query<{ count: string }>(
        `SELECT count(*) FROM "User" WHERE "display_name" = 'Duplicate nickname'`,
      );
      expect(Number(canonicalCount.rows[0]!.count)).toBe(1);
      expect(Number(nicknameCount.rows[0]!.count)).toBe(2);
    });
  });

  test('delivers the verification link through MailPort only after committed state exists', async () => {
    const send = vi.mocked(mailPort.sendEmailVerification);
    let observeMail!: (message: { to: string; verificationUrl: string }) => void;
    const mailObserved = new Promise<{ to: string; verificationUrl: string }>((resolveMail) => {
      observeMail = resolveMail;
    });
    send.mockImplementationOnce(async ({ to, verificationUrl }) => observeMail({ to, verificationUrl }));

    expect((await register({
      email: 'mail@example.test',
      displayName: 'Mail member',
      password: 'correct horse battery staple',
      platform: 'native',
    })).statusCode).toBe(202);
    const message = await mailObserved;
    expect(message.to).toBe('mail@example.test');
    expect(message.verificationUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:8081\/auth\/verify-email\?token=[A-Za-z0-9_-]{43}$/,
    );
    await withDatabase(async (client) => {
      const count = await client.query<{ count: string }>(
        `SELECT count(*) FROM "EmailVerificationToken" token
         JOIN "User" account ON account."id" = token."user_id"
         WHERE account."email_canonical" = 'mail@example.test'`,
      );
      expect(Number(count.rows[0]!.count)).toBe(1);
    });
  });
});

describe('registration persistence contract', () => {
  test('auth schema exists before persistence behavior can run', () => {
    if (!authSchemaExists) {
      throw new Error('IMPLEMENTATION_MISSING_AUTH_SCHEMA');
    }
  });

  describe.runIf(authSchemaExists)('migrated PostgreSQL invariants', () => {
    test('persistence collides trim, Unicode-normalized, and lowercase canonical email equivalents under race', async () => {
      await withDatabase(async (client) => {
        const firstEmail = '  Me\u0301Mber@Example.test ';
        const equivalentEmail = 'm\u00e9mber@example.test';
        expect(canonicalizeEmail(firstEmail)).toBe(canonicalizeEmail(equivalentEmail));

        const results = await Promise.allSettled([
          insertUser(client, { email: firstEmail, displayName: 'One' }),
          insertUser(client, { email: equivalentEmail, displayName: 'Two' }),
        ]);

        expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
        const count = await client.query<{ count: string }>(
          `SELECT count(*) FROM "User" WHERE "email_canonical" = $1`,
          [canonicalizeEmail(firstEmail)],
        );
        expect(Number(count.rows[0]!.count)).toBe(1);
      });
    });

    test('persistence preserves the original delivery email separately from canonical identity', async () => {
      await withDatabase(async (client) => {
        const email = '  Delivery.Case@Example.test ';
        const userId = await insertUser(client, { email });
        const stored = await client.query<{ email: string; email_canonical: string }>(
          `SELECT "email", "email_canonical" FROM "User" WHERE "id" = $1`,
          [userId],
        );

        expect(stored.rows[0]).toEqual({ email, email_canonical: canonicalizeEmail(email) });
      });
    });

    test('persistence allows duplicate display names for different users', async () => {
      await withDatabase(async (client) => {
        await Promise.all([
          insertUser(client, { email: 'one@example.test', displayName: 'Shared name' }),
          insertUser(client, { email: 'two@example.test', displayName: 'Shared name' }),
        ]);
        const count = await client.query<{ count: string }>(
          `SELECT count(*) FROM "User" WHERE "display_name" = 'Shared name'`,
        );
        expect(Number(count.rows[0]!.count)).toBe(2);
      });
    });

    test('persistence stores verification tokens and pending proofs only as hashes', async () => {
      await withDatabase(async (client) => {
        const userId = await insertUser(client, { email: 'hashes@example.test' });
        const session = await client.query<{ id: string }>(
          `INSERT INTO "AuthSession" ("user_id", "absolute_ends_at")
           VALUES ($1, now() + interval '90 days') RETURNING "id"`,
          [userId],
        );
        await client.query(
          `INSERT INTO "RefreshToken" ("session_id", "token_hash", "expires_at")
           VALUES ($1, $2, now() + interval '30 days')`,
          [session.rows[0]!.id, HASH_A],
        );
        await client.query(
          `INSERT INTO "EmailVerificationToken" ("user_id", "token_hash", "pending_proof_hash", "expires_at")
           VALUES ($1, $2, $3, now() + interval '24 hours')`,
          [userId, HASH_B, HASH_C],
        );
        await client.query(
          `INSERT INTO "PasswordResetToken" ("user_id", "token_hash", "expires_at")
           VALUES ($1, $2, now() + interval '30 minutes')`,
          [userId, HASH_D],
        );

        const columns = await client.query<{ table_name: string; column_name: string }>(`
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('RefreshToken', 'EmailVerificationToken', 'PasswordResetToken')
        `);
        expect(columns.rows.map(({ column_name }) => column_name).sort()).not.toContain('token');
        expect(columns.rows.map(({ column_name }) => column_name).sort()).not.toContain('pending_proof');
        expect(columns.rows.filter(({ column_name }) => column_name.endsWith('_hash'))).toHaveLength(4);
      });
    });

    test('persistence enforces UTC timestamps, foreign keys, expiry, hashes, and conditional token state', async () => {
      await withDatabase(async (client) => {
        const timestampColumns = await client.query<{ table_name: string; column_name: string; data_type: string; datetime_precision: number }>(`
          SELECT table_name, column_name, data_type, datetime_precision
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('User', 'AuthSession', 'RefreshToken', 'EmailVerificationToken', 'PasswordResetToken')
            AND (column_name LIKE '%_at' OR column_name LIKE '%_ends_at')
        `);
        expect(timestampColumns.rows.length).toBeGreaterThan(0);
        expect(timestampColumns.rows.every(({ data_type }) => data_type === 'timestamp with time zone')).toBe(true);
        expect(timestampColumns.rows.every(({ datetime_precision }) => datetime_precision === 3)).toBe(true);

        await expect(
          client.query(
            `INSERT INTO "AuthSession" ("user_id", "absolute_ends_at")
             VALUES ('00000000-0000-0000-0000-000000000000', now() + interval '1 day')`,
          ),
        ).rejects.toMatchObject({ code: '23503' });

        const userId = await insertUser(client, { email: 'constraints@example.test' });
        await expect(
          client.query(
            `INSERT INTO "User" ("email", "email_canonical", "display_name", "password_hash")
             VALUES ('Canonical@Example.test', 'wrong@example.test', 'Member', '$argon2id$fixture')`,
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          client.query(
            `INSERT INTO "AuthSession" ("user_id", "absolute_ends_at") VALUES ($1, now() - interval '1 second')`,
            [userId],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          client.query(
            `INSERT INTO "EmailVerificationToken" (
               "user_id", "token_hash", "pending_proof_hash", "expires_at", "consumed_at"
             ) VALUES ($1, $2, $3, now() + interval '1 hour', now())`,
            [userId, HASH_A, HASH_B],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          client.query(
            `INSERT INTO "PasswordResetToken" ("user_id", "token_hash", "expires_at")
             VALUES ($1, 'plaintext-secret', now() + interval '1 hour')`,
            [userId],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      });
    });

    test('persistence rolls back partial auth graphs through the PrismaPg transaction boundary', async () => {
      const adapter = new PrismaPg({ connectionString: getTestDatabaseUrl() });
      const prisma = new PrismaClient({ adapter });
      await prisma.$connect();

      try {
        const email = 'transaction@example.test';
        await expect(
          prisma.$transaction(async (transaction) => {
            const user = await transaction.user.create({
              data: {
                email,
                emailCanonical: canonicalizeEmail(email),
                displayName: 'Transactional member',
                passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$fixture$safehash',
              },
            });
            await transaction.authSession.create({
              data: {
                userId: user.id,
                absoluteEndsAt: new Date(0),
              },
            });
          }),
        ).rejects.toBeDefined();

        await expect(prisma.user.findUnique({ where: { emailCanonical: canonicalizeEmail(email) } })).resolves.toBeNull();
      } finally {
        await prisma.$disconnect();
      }
    });
  });
});
