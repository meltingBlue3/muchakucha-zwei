import { createHash, randomBytes } from 'node:crypto';
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

async function insertVerifiedUser(email: string, displayName: string): Promise<MemberFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const passwordHash = await argon2.hash('test-password-for-e2e-only', {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
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

function opaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

async function seedHousehold(
  ownerId: string,
  name = '测试家庭',
): Promise<{ id: string; ownerMembershipId: string }> {
  let householdId = '';
  let membershipId = '';
  await withDatabase(async (client) => {
    const hResult = await client.query(
      `INSERT INTO "households" ("name") VALUES ($1) RETURNING "id"`,
      [name],
    );
    householdId = hResult.rows[0].id as string;
    const mResult = await client.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, 'ADMIN') RETURNING "id"`,
      [ownerId, householdId],
    );
    membershipId = mResult.rows[0].id as string;
    await client.query(
      `UPDATE "households" SET "owner_membership_id" = $1 WHERE "id" = $2`,
      [membershipId, householdId],
    );
  });
  return { id: householdId, ownerMembershipId: membershipId };
}

async function seedInvitation(
  inviterUserId: string,
  inviterMembershipId: string,
  householdId: string,
  recipientEmail: string,
  overrides?: { expiresAt?: Date; consumedAt?: Date; invalidatedAt?: Date },
): Promise<string> {
  const rawToken = opaqueToken();
  const tokenHash = hashToken(rawToken);
  const emailCanonical = recipientEmail.trim().normalize('NFC').toLowerCase();
  const expiresAt = overrides?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "invitations" ("inviter_user_id", "inviter_membership_id", "household_id", "email_canonical", "hash", "role", "expires_at", "consumed_at", "invalidated_at")
       VALUES ($1, $2, $3, $4, $5, 'MEMBER', $6, $7, $8)`,
      [
        inviterUserId,
        inviterMembershipId,
        householdId,
        emailCanonical,
        tokenHash,
        expiresAt.toISOString(),
        overrides?.consumedAt?.toISOString() ?? null,
        overrides?.invalidatedAt?.toISOString() ?? null,
      ],
    );
  });
  return rawToken;
}

let app: NestFastifyApplication;
let owner: MemberFixture;
let invitee: MemberFixture;
let stranger: MemberFixture;
let household: { id: string; ownerMembershipId: string };

beforeAll(async () => {
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
  owner = await insertVerifiedUser('owner@example.test', '家主');
  invitee = await insertVerifiedUser('invitee@example.test', '被邀请人');
  stranger = await insertVerifiedUser('stranger@example.test', '陌生人');
  household = await seedHousehold(owner.id, '温暖小家');
});

function inject(opts: {
  method: 'GET' | 'POST';
  url: string;
  accessToken?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}) {
  const queryString = opts.query ? '?' + new URLSearchParams(opts.query).toString() : '';
  return app.getHttpAdapter().getInstance().inject({
    method: opts.method,
    url: opts.url + queryString,
    headers: {
      ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(opts.body !== undefined ? { payload: opts.body } : {}),
  });
}

describe('previewInvitation', () => {
  test('returns valid preview for a pending invitation', async () => {
    const token = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, invitee.email.split('@')[0] + '@invitee.test',
    );

    // Fix: use the actual email seeded
    const fixedEmail = 'matching@example.test';
    const matchingInvitee = await insertVerifiedUser(fixedEmail, '匹配用户');
    const token2 = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, fixedEmail,
    );

    const response = await inject({
      method: 'GET',
      url: '/api/v1/households/invitations/preview',
      query: { token: token2 },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      kind: string;
      householdName?: string;
      inviterDisplayName?: string;
      expiresAt?: string;
    }>();
    expect(body.kind).toBe('valid');
    expect(body.householdName).toBe('温暖小家');
    expect(body.inviterDisplayName).toBe('家主');
    expect(body.expiresAt).toBeDefined();
    expect(new Date(body.expiresAt!).getTime()).toBeGreaterThan(Date.now());
  });

  test('returns expired for an expired invitation', async () => {
    const token = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, invitee.email.split('@')[0] + '@expired.test',
      { expiresAt: new Date(Date.now() - 1000) },
    );
    const response = await inject({
      method: 'GET',
      url: '/api/v1/households/invitations/preview',
      query: { token },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ kind: string }>().kind).toBe('expired');
  });

  test('returns used for a consumed invitation', async () => {
    const token = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, invitee.email.split('@')[0] + '@used.test',
      { consumedAt: new Date() },
    );
    const response = await inject({
      method: 'GET',
      url: '/api/v1/households/invitations/preview',
      query: { token },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ kind: string }>().kind).toBe('used');
  });

  test('returns invalid for unknown token', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/v1/households/invitations/preview',
      query: { token: 'nonexistent-token-12345' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ kind: string }>().kind).toBe('invalid');
  });

  test('returns invalid for invalidated invitation', async () => {
    const token = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, invitee.email.split('@')[0] + '@inval.test',
      { invalidatedAt: new Date() },
    );
    const response = await inject({
      method: 'GET',
      url: '/api/v1/households/invitations/preview',
      query: { token },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ kind: string }>().kind).toBe('invalid');
  });

  test('returns invalid for empty token', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/v1/households/invitations/preview',
      query: { token: '' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ kind: string }>().kind).toBe('invalid');
  });
});

describe('acceptInvitation', () => {
  test('accepts with matching email and creates membership', async () => {
    const token = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, invitee.email.split('@')[0] + '@invitee.test',
    );

    const response = await inject({
      method: 'POST',
      url: '/api/v1/households/invitations/accept',
      accessToken: invitee.accessToken,
      body: { token },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ id: string; name: string; members: Array<{ userId: string; role: string }> }>();
    expect(body.name).toBe('温暖小家');
    // Invitee should be in members as MEMBER
    const inviteeMember = body.members.find((m) => m.userId === invitee.id);
    expect(inviteeMember).toBeDefined();
    expect(inviteeMember!.role).toBe('MEMBER');

    // Invitation is consumed
    await withDatabase(async (client) => {
      const result = await client.query(
        `SELECT "consumed_at" FROM "invitations" WHERE "hash" = $1`,
        [hashToken(token)],
      );
      expect(result.rows[0].consumed_at).not.toBeNull();
    });
  });

  test('rejects with 403 when email does not match', async () => {
    const token = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, invitee.email.split('@')[0] + '@invitee.test',
    );

    // Stranger (different email) tries to accept
    const response = await inject({
      method: 'POST',
      url: '/api/v1/households/invitations/accept',
      accessToken: stranger.accessToken,
      body: { token },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json<{ code: string; message: string }>();
    expect(body.code).toBe('INVITATION_EMAIL_MISMATCH');

    // Invitation is NOT consumed
    await withDatabase(async (client) => {
      const result = await client.query(
        `SELECT "consumed_at" FROM "invitations" WHERE "hash" = $1`,
        [hashToken(token)],
      );
      expect(result.rows[0].consumed_at).toBeNull();
    });
  });

  test('rejects already consumed invitation', async () => {
    const token = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, invitee.email.split('@')[0] + '@invitee.test',
    );

    // First accept
    const first = await inject({
      method: 'POST',
      url: '/api/v1/households/invitations/accept',
      accessToken: invitee.accessToken,
      body: { token },
    });
    expect(first.statusCode).toBe(200);

    // Second accept should fail
    const second = await inject({
      method: 'POST',
      url: '/api/v1/households/invitations/accept',
      accessToken: invitee.accessToken,
      body: { token },
    });
    expect(second.statusCode).toBe(400);
    const body = second.json<{ code: string }>();
    expect(body.code).toBe('INVITATION_ALREADY_USED');
  });

  test('rejects expired invitation', async () => {
    const token = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, invitee.email.split('@')[0] + '@invitee.test',
      { expiresAt: new Date(Date.now() - 1000) },
    );

    const response = await inject({
      method: 'POST',
      url: '/api/v1/households/invitations/accept',
      accessToken: invitee.accessToken,
      body: { token },
    });
    expect(response.statusCode).toBe(400);
  });

  test('creates exactly one membership on concurrent accept', async () => {
    const token = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, invitee.email.split('@')[0] + '@invitee.test',
    );

    // Fire two concurrent accepts
    const [first, second] = await Promise.all([
      inject({
        method: 'POST',
        url: '/api/v1/households/invitations/accept',
        accessToken: invitee.accessToken,
        body: { token },
      }),
      inject({
        method: 'POST',
        url: '/api/v1/households/invitations/accept',
        accessToken: invitee.accessToken,
        body: { token },
      }),
    ]);

    // One should succeed, one should fail
    const success = first.statusCode === 200 ? first : second;
    const failure = first.statusCode === 200 ? second : first;
    expect(success.statusCode).toBe(200);
    expect([400, 409]).toContain(failure.statusCode);

    // Exactly one membership row
    await withDatabase(async (client) => {
      const result = await client.query(
        `SELECT COUNT(*) as cnt FROM "memberships" WHERE "household_id" = $1 AND "user_id" = $2`,
        [household.id, invitee.id],
      );
      expect(Number(result.rows[0].cnt)).toBe(1);
    });
  });

  test('rejects invalid token', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/v1/households/invitations/accept',
      accessToken: invitee.accessToken,
      body: { token: 'not-a-valid-token-at-all' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe('INVALID_INVITATION');
  });

  test('rejects unauthenticated request', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/v1/households/invitations/accept',
      body: { token: 'some-token' },
    });
    expect(response.statusCode).toBe(401);
  });

  test('accept invitation by owner is valid (self-invite)', async () => {
    // Owner invites themselves — edge case: should work since they're not a member
    const otherHousehold = await seedHousehold(stranger.id, '其他家庭');
    const token = await seedInvitation(
      stranger.id, otherHousehold.ownerMembershipId, otherHousehold.id, owner.email.split('@')[0] + '@example.test',
    );

    const response = await inject({
      method: 'POST',
      url: '/api/v1/households/invitations/accept',
      accessToken: owner.accessToken,
      body: { token },
    });
    expect(response.statusCode).toBe(200);
  });
});
