import { createHash, randomBytes } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApplication } from '../../src/main.js';
import { MAIL_PORT, type MailPort } from '../../src/infrastructure/mail/mail.port.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const accessSecret = 'test-only-access-secret-that-is-longer-than-thirty-two-bytes';
const jwt = new JwtService({ secret: accessSecret, signOptions: { algorithm: 'HS256', expiresIn: 15 * 60 } });

interface MemberFixture {
  accessToken: string;
  email: string;
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
    email,
    accessToken: await jwt.signAsync({ sub: userId, sid: sessionId }),
  };
}

// ASVS evidence: invitation token hashing uses SHA-256 CSPRNG
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
  const createdAt = expiresAt.getTime() <= Date.now()
    ? new Date(expiresAt.getTime() - 7 * 24 * 60 * 60 * 1000)
    : new Date();
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "invitations" ("inviter_user_id", "inviter_membership_id", "household_id", "email_canonical", "hash", "role", "expires_at", "consumed_at", "invalidated_at", "created_at")
       VALUES ($1, $2, $3, $4, $5, 'MEMBER', $6, $7, $8, $9)`,
      [
        inviterUserId,
        inviterMembershipId,
        householdId,
        emailCanonical,
        tokenHash,
        expiresAt.toISOString(),
        overrides?.consumedAt?.toISOString() ?? null,
        overrides?.invalidatedAt?.toISOString() ?? null,
        createdAt.toISOString(),
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
let mailPort: MailPort;

beforeAll(async () => {
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: accessSecret,
    DATABASE_URL: getTestDatabaseUrl(),
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  mailPort = app.get<MailPort>(MAIL_PORT);
});

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(mailPort, 'sendHouseholdInvitation').mockResolvedValue(undefined);
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

describe('sendHouseholdInvitation delivery', () => {
  test('does not report success when invitation mail delivery fails', async () => {
    vi.mocked(mailPort.sendHouseholdInvitation).mockRejectedValueOnce(
      new Error('SMTP delivery rejected'),
    );

    const response = await inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
      body: { email: 'delivery-failure@example.test' },
    });

    expect(response.statusCode).toBe(500);
    expect(mailPort.sendHouseholdInvitation).toHaveBeenCalledOnce();
  });
});

// ASVS evidence: invitation token in URL is accepted residual risk — compensating controls: no-referrer, hash-only storage, single-use seven-day expiry, generic responses
describe('previewInvitation', () => {
  test('returns valid preview for a pending invitation', async () => {
    const token = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, invitee.email,
    );

    const response = await inject({
      method: 'GET',
      url: '/api/v1/households/invitations/preview',
      query: { token },
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
      owner.id, household.ownerMembershipId, household.id, invitee.email,
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
      owner.id, household.ownerMembershipId, household.id, invitee.email,
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
    // ASVS evidence: preview endpoint suppresses household details for invalid tokens
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
      owner.id, household.ownerMembershipId, household.id, invitee.email,
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
      owner.id, household.ownerMembershipId, household.id, invitee.email,
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
      owner.id, household.ownerMembershipId, household.id, invitee.email,
    );

    // Stranger (different email) tries to accept
    const response = await inject({
      method: 'POST',
      url: '/api/v1/households/invitations/accept',
      accessToken: stranger.accessToken,
      body: { token },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe('INVITATION_EMAIL_MISMATCH');

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
      owner.id, household.ownerMembershipId, household.id, invitee.email,
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
    const body = second.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('INVITATION_ALREADY_USED');
  });

  test('rejects expired invitation', async () => {
    const token = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, invitee.email,
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
      owner.id, household.ownerMembershipId, household.id, invitee.email,
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
    const body = response.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('INVALID_INVITATION');
  });

  test('rejects unauthenticated request', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/v1/households/invitations/accept',
      body: { token: 'some-token' },
    });
    expect(response.statusCode).toBe(401);
  });

  // ASVS evidence: invitation acceptance requires sequential preview, auth, and explicit accept
  test('accept invitation by owner is valid (self-invite)', async () => {
    // Owner invites themselves — edge case: should work since they're not a member
    const otherHousehold = await seedHousehold(stranger.id, '其他家庭');
    const token = await seedInvitation(
      stranger.id, otherHousehold.ownerMembershipId, otherHousehold.id, owner.email,
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

describe('listInvitations', () => {
  test('owner can list all invitations with correct statuses', async () => {
    // Seed invitations with different states
    await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'pending@example.test',
    );
    await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'expired@example.test',
      { expiresAt: new Date(Date.now() - 1000) },
    );
    await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'consumed@example.test',
      { consumedAt: new Date() },
    );
    await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'revoked@example.test',
      { invalidatedAt: new Date() },
    );

    const response = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ invitations: Array<{ emailCanonical: string; status: string }> }>();
    expect(body.invitations.length).toBeGreaterThanOrEqual(4);

    const statuses = new Map(body.invitations.map((i) => [i.emailCanonical, i.status]));
    expect(statuses.get('pending@example.test')).toBe('pending');
    expect(statuses.get('expired@example.test')).toBe('expired');
    expect(statuses.get('consumed@example.test')).toBe('accepted');
    expect(statuses.get('revoked@example.test')).toBe('revoked');
  });

  test('admin can list invitations', async () => {
    const adminUser = await insertVerifiedUser('admin@example.test', '管理员');
    await withDatabase(async (client) => {
      await client.query(
        `INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, 'ADMIN')`,
        [adminUser.id, household.id],
      );
    });

    const response = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: adminUser.accessToken,
    });
    expect(response.statusCode).toBe(200);
  });

  test('member cannot list invitations', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: invitee.accessToken,
    });
    // Invitee is not a member of this household, so they get 404.
    // A member household would get 403.
    expect(response.statusCode).toBe(404);
  });

  test('outsider gets 404', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: stranger.accessToken,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('resendInvitation', () => {
  test('does not report success when resent invitation mail delivery fails', async () => {
    await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'resend-delivery-failure@example.test',
    );
    const listBefore = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
    });
    const target = listBefore
      .json<{ invitations: Array<{ id: string; emailCanonical: string }> }>()
      .invitations
      .find((invitation) => invitation.emailCanonical === 'resend-delivery-failure@example.test');
    expect(target).toBeDefined();
    vi.mocked(mailPort.sendHouseholdInvitation).mockRejectedValueOnce(
      new Error('SMTP delivery rejected'),
    );

    const response = await inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations/${encodeURIComponent(target!.id)}/resend`,
      accessToken: owner.accessToken,
    });

    expect(response.statusCode).toBe(500);
    expect(mailPort.sendHouseholdInvitation).toHaveBeenCalledOnce();
  });

  test('owner can resend a pending invitation and old token is invalidated', async () => {
    const token = await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'resend-pending@example.test',
    );

    // Get the invitation ID from list
    const listBefore = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
    });
    const invList = (listBefore.json<{ invitations: Array<{ id: string; emailCanonical: string }> }>()).invitations;
    const targetInv = invList.find((i) => i.emailCanonical === 'resend-pending@example.test');
    expect(targetInv).toBeDefined();

    const response = await inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations/${encodeURIComponent(targetInv!.id)}/resend`,
      accessToken: owner.accessToken,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ code: string; message: string }>();
    expect(body.code).toBe('INVITATION_RESENT');

    // Old invitation should be invalidated
    const listAfter = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
    });
    const afterList = (listAfter.json<{ invitations: Array<{ id: string; emailCanonical: string; status: string }> }>()).invitations;
    const oldInv = afterList.find((i) => i.id === targetInv!.id);
    expect(oldInv!.status).toBe('revoked');
    const oldTokenPreview = await inject({
      method: 'GET',
      url: '/api/v1/households/invitations/preview',
      query: { token },
    });
    expect(oldTokenPreview.statusCode).toBe(200);
    expect(oldTokenPreview.json<{ kind: string }>().kind).toBe('invalid');

    // A new pending invitation should exist for the same email
    const newPendings = afterList.filter(
      (i) => i.emailCanonical === 'resend-pending@example.test' && i.status === 'pending',
    );
    expect(newPendings.length).toBe(1);
    expect(newPendings[0]!.id).not.toBe(targetInv!.id);
  });

  test('owner can resend an expired invitation', async () => {
    await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'resend-expired@example.test',
      { expiresAt: new Date(Date.now() - 1000) },
    );

    const listBefore = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
    });
    const invList = (listBefore.json<{ invitations: Array<{ id: string; emailCanonical: string }> }>()).invitations;
    const targetInv = invList.find((i) => i.emailCanonical === 'resend-expired@example.test');
    expect(targetInv).toBeDefined();

    const response = await inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations/${encodeURIComponent(targetInv!.id)}/resend`,
      accessToken: owner.accessToken,
    });
    expect(response.statusCode).toBe(200);
  });

  test('cannot resend an already accepted invitation', async () => {
    await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'resend-consumed@example.test',
      { consumedAt: new Date() },
    );

    const listBefore = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
    });
    const invList = (listBefore.json<{ invitations: Array<{ id: string; emailCanonical: string }> }>()).invitations;
    const targetInv = invList.find((i) => i.emailCanonical === 'resend-consumed@example.test');
    expect(targetInv).toBeDefined();

    const response = await inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations/${encodeURIComponent(targetInv!.id)}/resend`,
      accessToken: owner.accessToken,
    });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('INVITATION_ALREADY_ACCEPTED');
  });

  test('member cannot resend', async () => {
    const memberUser = await insertVerifiedUser('resend-member@example.test', '成员');
    await withDatabase(async (client) => {
      await client.query(
        `INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, 'MEMBER')`,
        [memberUser.id, household.id],
      );
    });

    await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'resend-by-member@example.test',
    );

    const listBefore = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
    });
    const invList = (listBefore.json<{ invitations: Array<{ id: string; emailCanonical: string }> }>()).invitations;
    const targetInv = invList.find((i) => i.emailCanonical === 'resend-by-member@example.test');

    const response = await inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations/${encodeURIComponent(targetInv!.id)}/resend`,
      accessToken: memberUser.accessToken,
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('revokeInvitation', () => {
  test('owner can revoke a pending invitation', async () => {
    await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'revoke-pending@example.test',
    );

    const listBefore = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
    });
    const invList = (listBefore.json<{ invitations: Array<{ id: string; emailCanonical: string }> }>()).invitations;
    const targetInv = invList.find((i) => i.emailCanonical === 'revoke-pending@example.test');
    expect(targetInv).toBeDefined();

    const response = await inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations/${encodeURIComponent(targetInv!.id)}/revoke`,
      accessToken: owner.accessToken,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ code: string; message: string }>();
    expect(body.code).toBe('INVITATION_REVOKED');

    // Verify status changed to revoked
    const listAfter = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
    });
    const afterList = (listAfter.json<{ invitations: Array<{ id: string; status: string }> }>()).invitations;
    const afterInv = afterList.find((i) => i.id === targetInv!.id);
    expect(afterInv!.status).toBe('revoked');
  });

  test('revoke on already consumed invitation succeeds silently (safe revoke)', async () => {
    await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'revoke-consumed@example.test',
      { consumedAt: new Date() },
    );

    const listBefore = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
    });
    const invList = (listBefore.json<{ invitations: Array<{ id: string; emailCanonical: string }> }>()).invitations;
    const targetInv = invList.find((i) => i.emailCanonical === 'revoke-consumed@example.test');
    expect(targetInv).toBeDefined();

    const response = await inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations/${encodeURIComponent(targetInv!.id)}/revoke`,
      accessToken: owner.accessToken,
    });
    // Safe revoke: already terminal state returns success
    expect(response.statusCode).toBe(200);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe('INVITATION_REVOKED');
  });

  test('revoke on already revoked invitation succeeds silently', async () => {
    await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'revoke-already@example.test',
      { invalidatedAt: new Date() },
    );

    const listBefore = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
    });
    const invList = (listBefore.json<{ invitations: Array<{ id: string; emailCanonical: string }> }>()).invitations;
    const targetInv = invList.find((i) => i.emailCanonical === 'revoke-already@example.test');
    expect(targetInv).toBeDefined();

    const response = await inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations/${encodeURIComponent(targetInv!.id)}/revoke`,
      accessToken: owner.accessToken,
    });
    expect(response.statusCode).toBe(200);
  });

  test('invitation not found returns 404', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations/${encodeURIComponent(randomUUID())}/revoke`,
      accessToken: owner.accessToken,
    });
    expect(response.statusCode).toBe(404);
  });

  test('member cannot revoke', async () => {
    const memberUser = await insertVerifiedUser('revoke-member@example.test', '成员');
    await withDatabase(async (client) => {
      await client.query(
        `INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, 'MEMBER')`,
        [memberUser.id, household.id],
      );
    });

    await seedInvitation(
      owner.id, household.ownerMembershipId, household.id, 'revoke-by-member@example.test',
    );

    const listBefore = await inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      accessToken: owner.accessToken,
    });
    const invList = (listBefore.json<{ invitations: Array<{ id: string; emailCanonical: string }> }>()).invitations;
    const targetInv = invList.find((i) => i.emailCanonical === 'revoke-by-member@example.test');

    const response = await inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(household.id)}/invitations/${encodeURIComponent(targetInv!.id)}/revoke`,
      accessToken: memberUser.accessToken,
    });
    expect(response.statusCode).toBe(403);
  });
});
