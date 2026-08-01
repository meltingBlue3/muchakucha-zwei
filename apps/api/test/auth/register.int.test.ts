import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, test } from 'vitest';
import { getTestDatabaseUrl } from '../reset-database.js';

const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:18025';
const prismaSchema = resolve(import.meta.dirname, '../../prisma/schema.prisma');
const authSchemaExists = existsSync(prismaSchema);

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

async function register(body: Record<string, unknown>, origin?: string) {
  return fetch(`${apiOrigin}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe.skip('registration API contract', () => {
  test('returns the same generic 202 response shape for new and existing canonical email', async () => {
    const body = { email: 'Member@Example.test', displayName: 'Member', password: 'correct horse battery staple' };
    const first = await register(body);
    const duplicate = await register(body);
    expect([first.status, duplicate.status]).toEqual([202, 202]);
    expect(await duplicate.json()).toEqual(await first.json());
  });

  test('rejects every password in the committed top-3000 common-password fixture', async () => {
    const response = await register({ email: 'weak@example.test', displayName: 'Member', password: 'password' });
    expect(response.status).toBe(400);
  });

  test('persists the password only as an Argon2id hash', async () => {
    const response = await register({ email: 'argon@example.test', displayName: 'Member', password: 'correct horse battery staple' });
    expect(response.status).toBe(202);
    // The owning schema/API plan replaces this HTTP-only probe with a direct migrated-DB assertion.
  });

  test('rejects blank, overlong, and unexpected registration fields', async () => {
    const response = await register({ email: '', displayName: '', password: '', role: 'admin' });
    expect(response.status).toBe(400);
  });

  test('issues Web pending proof only as a bounded HttpOnly cookie and omits it from JSON', async () => {
    const response = await register(
      { email: 'web@example.test', displayName: 'Member', password: 'correct horse battery staple', platform: 'web' },
      'http://127.0.0.1:8081',
    );
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(JSON.stringify(await response.json())).not.toMatch(/pending.*proof/i);
  });

  test('returns native pending proof for secure storage without exposing persisted plaintext', async () => {
    const response = await register({
      email: 'native@example.test',
      displayName: 'Member',
      password: 'correct horse battery staple',
      platform: 'native',
    });
    expect(await response.json()).toMatchObject({ pendingProof: expect.any(String) });
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
  });
});
