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

let app: NestFastifyApplication;
let passwordHash: string;

interface ActorFixture {
  accessToken: string;
  userId: string;
  email: string;
  displayName: string;
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

async function insertActor(
  email: string,
  displayName: string,
  emailCanonical?: string,
): Promise<ActorFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const canonical = emailCanonical ?? email.trim().normalize('NFC').toLowerCase();
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "User" ("id", "email", "email_canonical", "display_name", "password_hash", "email_verified_at")
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [userId, email, canonical, displayName, passwordHash],
    );
    await client.query(
      `INSERT INTO "AuthSession" ("id", "user_id", "absolute_ends_at")
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      [sessionId, userId],
    );
  });
  return {
    userId,
    email,
    displayName,
    accessToken: await jwt.signAsync({ sub: userId, sid: sessionId }),
  };
}

async function createHouseholdViaApi(
  accessToken: string,
  name: string,
): Promise<string> {
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/households',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    payload: { name },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json();
  const household = body as { id: string };
  return household.id;
}

async function addMemberViaDb(
  householdId: string,
  actor: ActorFixture,
  role: string = 'MEMBER',
): Promise<void> {
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role")
       VALUES ($1, $2, $3)`,
      [actor.userId, householdId, role],
    );
  });
}

async function getHousehold(
  accessToken: string,
  householdId: string,
) {
  return app.getHttpAdapter().getInstance().inject({
    method: 'GET',
    url: `/api/v1/households/${encodeURIComponent(householdId)}`,
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

beforeAll(async () => {
  passwordHash = await argon2.hash('households-fixture-password', {
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
});

describe('household roster API contract', () => {
  let owner: ActorFixture;
  let admin: ActorFixture;
  let member: ActorFixture;
  let outsider: ActorFixture;
  let householdId: string;

  beforeEach(async () => {
    [owner, admin, member, outsider] = await Promise.all([
      insertActor('owner@example.test', '家主'),
      insertActor('admin@example.test', '管理员'),
      insertActor('member@example.test', '普通成员'),
      insertActor('outsider@example.test', '无关人员'),
    ]);
    householdId = await createHouseholdViaApi(owner.accessToken, '温暖小家');

    // Add admin and member to the household.
    await addMemberViaDb(householdId, admin, 'ADMIN');
    await addMemberViaDb(householdId, member, 'MEMBER');
  });

  test('returns the household roster for a member', async () => {
    const response = await getHousehold(owner.accessToken, householdId);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toBeDefined();
    expect(body.id).toBe(householdId);
    expect(body.name).toBe('温暖小家');
    expect(body.ownerMembershipId).toBeDefined();
    expect(body.members).toHaveLength(3);
  });

  test('rejects an outsider (not a member of the household)', async () => {
    const response = await getHousehold(outsider.accessToken, householdId);
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.code).toBe('HOUSEHOLD_NOT_FOUND');
  });

  test('returns 404 for a non-existent household ID', async () => {
    const response = await getHousehold(owner.accessToken, randomUUID());
    expect(response.statusCode).toBe(404);
  });

  test('sorts members in the canonical total order', async () => {
    const response = await getHousehold(owner.accessToken, householdId);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const members: Array<{ role: string; isCurrentUser: boolean; displayName: string }> = body.members;

    // Total order: OWNER -> ADMIN -> MEMBER; current user first within role.
    expect(members[0].role).toBe('OWNER');
    expect(members[0].isCurrentUser).toBe(true);
    expect(members[0].displayName).toBe('家主');

    // Admin comes before member.
    const adminIndex = members.findIndex((m) => m.role === 'ADMIN');
    const memberIndex = members.findIndex((m) => m.role === 'MEMBER');
    expect(adminIndex).toBeLessThan(memberIndex);
  });

  test('places the current user first within their own role', async () => {
    // Admin views the household — admin should appear first within ADMIN role.
    const response = await getHousehold(admin.accessToken, householdId);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const members: Array<{ role: string; isCurrentUser: boolean; displayName: string }> = body.members;

    // First should be owner (role takes priority).
    expect(members[0].role).toBe('OWNER');
    expect(members[0].isCurrentUser).toBe(false);

    // Second should be admin (current user within ADMIN role).
    expect(members[1].role).toBe('ADMIN');
    expect(members[1].isCurrentUser).toBe(true);
    expect(members[1].displayName).toBe('管理员');

    // Third should be member.
    expect(members[2].role).toBe('MEMBER');
  });

  test('does not return members in cross-household queries', async () => {
    // Create a second household owned by owner.
    const householdB = await createHouseholdViaApi(owner.accessToken, '第二家庭');

    // Get roster for household A — it should only contain members of household A.
    const response = await getHousehold(owner.accessToken, householdId);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(householdId);

    // The admin and member actors are only members of householdId, not householdB.
    const householdBResponse = await getHousehold(owner.accessToken, householdB);
    expect(householdBResponse.statusCode).toBe(200);
    const householdBBody = householdBResponse.json();
    expect(householdBBody.members).toHaveLength(1); // Only the owner who created it.
  });

  test('rejects a household with no ownerMembershipId as inconsistent', async () => {
    // Directly nullify the ownerMembershipId to simulate inconsistency.
    await withDatabase(async (client) => {
      await client.query(
        `UPDATE "households" SET "owner_membership_id" = NULL WHERE "id" = $1`,
        [householdId],
      );
    });

    const response = await getHousehold(owner.accessToken, householdId);
    // The service should return null for inconsistent state, which the controller
    // maps to 404.
    expect(response.statusCode).toBe(404);
  });

  test('tie-breaks displayName with canonical email ascending', async () => {
    // Add two members with the same display name but different emails.
    const tieA = await insertActor('aaa@example.test', '相同昵称', 'aaa@example.test');
    const tieB = await insertActor('bbb@example.test', '相同昵称', 'bbb@example.test');
    await addMemberViaDb(householdId, tieA, 'MEMBER');
    await addMemberViaDb(householdId, tieB, 'MEMBER');

    const response = await getHousehold(owner.accessToken, householdId);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const members: Array<{ displayName: string; email: string }> = body.members;

    // Find the two tied members.
    const tiedMembers = members.filter((m) => m.displayName === '相同昵称');
    expect(tiedMembers).toHaveLength(2);
    // Lower canonical email ('aaa@example.test') should come first.
    expect(tiedMembers[0].email).toBe('aaa@example.test');
    expect(tiedMembers[1].email).toBe('bbb@example.test');
  });

  test('requires a valid active access-token session', async () => {
    // No auth header.
    const missing = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(householdId)}`,
    });
    // Non-existent subject.
    const nonexistent = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(householdId)}`,
      headers: { authorization: `Bearer ${await jwt.signAsync({ sub: randomUUID(), sid: randomUUID() })}` },
    });
    expect([missing.statusCode, nonexistent.statusCode]).toEqual([401, 401]);
  });
});

describe('household rename API contract', () => {
  let owner: ActorFixture;
  let admin: ActorFixture;
  let member: ActorFixture;
  let outsider: ActorFixture;
  let householdId: string;

  beforeEach(async () => {
    [owner, admin, member, outsider] = await Promise.all([
      insertActor('owner-rename@example.test', '家主'),
      insertActor('admin-rename@example.test', '管理员'),
      insertActor('member-rename@example.test', '普通成员'),
      insertActor('outsider-rename@example.test', '无关人员'),
    ]);
    householdId = await createHouseholdViaApi(owner.accessToken, '温暖小家');

    await addMemberViaDb(householdId, admin, 'ADMIN');
    await addMemberViaDb(householdId, member, 'MEMBER');
  });

  async function renameHousehold(
    accessToken: string,
    id: string,
    name: string,
  ) {
    return app.getHttpAdapter().getInstance().inject({
      method: 'PATCH',
      url: `/api/v1/households/${encodeURIComponent(id)}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      payload: { name },
    });
  }

  test('allows the owner to rename the household', async () => {
    const response = await renameHousehold(owner.accessToken, householdId, '新家园');
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.name).toBe('新家园');
    expect(body.id).toBe(householdId);
    expect(body.members).toHaveLength(3);

    // Verify the roster endpoint reflects the rename.
    const roster = await getHousehold(owner.accessToken, householdId);
    expect(roster.statusCode).toBe(200);
    expect(roster.json().name).toBe('新家园');
  });

  test('applies trim and NFC normalization to the name', async () => {
    // Combining marks on the same base character — NFC should fold.
    const response = await renameHousehold(owner.accessToken, householdId, '  家́庭  ');
    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe('家庭');
  });

  test('rejects a non-owner member with 403', async () => {
    const response = await renameHousehold(member.accessToken, householdId, '不该改');
    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.code).toBe('INSUFFICIENT_ROLE');
  });

  test('rejects an admin member with 403', async () => {
    const response = await renameHousehold(admin.accessToken, householdId, '也不该改');
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('INSUFFICIENT_ROLE');
  });

  test('rejects an outsider with 404', async () => {
    const response = await renameHousehold(outsider.accessToken, householdId, '试探');
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('HOUSEHOLD_NOT_FOUND');
  });

  test('rejects a non-existent household ID with 404', async () => {
    const response = await renameHousehold(owner.accessToken, randomUUID(), '无名');
    expect(response.statusCode).toBe(404);
  });

  test('rejects an empty name with 400', async () => {
    const response = await renameHousehold(owner.accessToken, householdId, '   ');
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  test('rejects a name longer than 40 code points with 400', async () => {
    const tooLong = 'あ'.repeat(41);
    const response = await renameHousehold(owner.accessToken, householdId, tooLong);
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_FAILED');
  });

  test('rejects rename on a household with null ownerMembershipId', async () => {
    await withDatabase(async (client) => {
      await client.query(
        `UPDATE "households" SET "owner_membership_id" = NULL WHERE "id" = $1`,
        [householdId],
      );
    });

    // The actor is still a member but ownerMembershipId is null — service returns null.
    // Controller checks getHousehold which also returns null for inconsistent state.
    const response = await renameHousehold(owner.accessToken, householdId, '无效');
    expect(response.statusCode).toBe(404);
  });

  test('requires a valid active access-token session', async () => {
    const missing = await app.getHttpAdapter().getInstance().inject({
      method: 'PATCH',
      url: `/api/v1/households/${encodeURIComponent(householdId)}`,
      headers: { 'content-type': 'application/json' },
      payload: { name: '无权限' },
    });
    const nonexistent = await app.getHttpAdapter().getInstance().inject({
      method: 'PATCH',
      url: `/api/v1/households/${encodeURIComponent(householdId)}`,
      headers: {
        authorization: `Bearer ${await jwt.signAsync({ sub: randomUUID(), sid: randomUUID() })}`,
        'content-type': 'application/json',
      },
      payload: { name: '假session' },
    });
    expect([missing.statusCode, nonexistent.statusCode]).toEqual([401, 401]);
  });
});
