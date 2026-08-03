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
    accessToken: jwt.sign({ sub: userId, sid: sessionId }),
    id: userId,
  };
}

async function createHouseholdWithRole(
  app: NestFastifyApplication,
  userId: string,
  accessToken: string,
  name: string,
): Promise<{ id: string; ownerMembershipId: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/households',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { name },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json();
  return { id: body.id as string, ownerMembershipId: body.ownerMembershipId as string };
}

async function addMemberViaDb(
  householdId: string,
  userId: string,
  role: string,
): Promise<void> {
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role")
       VALUES ($1, $2, $3)`,
      [userId, householdId, role],
    );
  });
}

describe('changes roles', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApplication({
      ACCESS_TOKEN_SECRET: accessSecret,
      REFRESH_ROTATION_SECRET: 'test-refresh-rotation-secret-32-bytes',
      DATABASE_URL: getTestDatabaseUrl(),
      NODE_ENV: 'test',
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  function changeMemberRole(
    accessToken: string,
    householdId: string,
    membershipId: string,
    role: 'ADMIN' | 'MEMBER',
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/api/v1/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(membershipId)}/role`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { role },
    });
  }

  function getHousehold(accessToken: string, householdId: string) {
    return app.inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(householdId)}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  describe('D-09: role change matrix', () => {
    test('owner promotes member to admin', async () => {
      const owner = await insertVerifiedUser('owner@example.test', '家主');
      const member = await insertVerifiedUser('member@example.test', '成员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, member.id, 'MEMBER');

      // Get the member's membership ID via the household roster.
      const roster = await getHousehold(owner.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === member.id);
      expect(target).toBeDefined();
      expect(target.role).toBe('MEMBER');

      const response = await changeMemberRole(owner.accessToken, household.id, target.membershipId, 'ADMIN');
      expect(response.statusCode).toBe(200);

      const body = response.json();
      const updatedTarget = body.members.find((m: { membershipId: string }) => m.membershipId === target.membershipId);
      expect(updatedTarget.role).toBe('ADMIN');
    });

    test('owner demotes admin to member', async () => {
      const owner = await insertVerifiedUser('owner@example.test', '家主');
      const admin = await insertVerifiedUser('admin@example.test', '管理员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');

      const roster = await getHousehold(owner.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === admin.id);
      expect(target).toBeDefined();
      expect(target.role).toBe('ADMIN');

      const response = await changeMemberRole(owner.accessToken, household.id, target.membershipId, 'MEMBER');
      expect(response.statusCode).toBe(200);

      const body = response.json();
      const updatedTarget = body.members.find((m: { membershipId: string }) => m.membershipId === target.membershipId);
      expect(updatedTarget.role).toBe('MEMBER');
    });

    test('admin promotes member to admin', async () => {
      const owner = await insertVerifiedUser('owner@example.test', '家主');
      const admin = await insertVerifiedUser('admin@example.test', '管理员');
      const member = await insertVerifiedUser('member@example.test', '成员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');
      await addMemberViaDb(household.id, member.id, 'MEMBER');

      const roster = await getHousehold(admin.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === member.id);
      expect(target.role).toBe('MEMBER');

      const response = await changeMemberRole(admin.accessToken, household.id, target.membershipId, 'ADMIN');
      expect(response.statusCode).toBe(200);

      const body = response.json();
      const updatedTarget = body.members.find((m: { membershipId: string }) => m.membershipId === target.membershipId);
      expect(updatedTarget.role).toBe('ADMIN');
    });

    test('admin demotes another admin to member', async () => {
      const owner = await insertVerifiedUser('owner@example.test', '家主');
      const admin1 = await insertVerifiedUser('admin1@example.test', '管理员甲');
      const admin2 = await insertVerifiedUser('admin2@example.test', '管理员乙');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin1.id, 'ADMIN');
      await addMemberViaDb(household.id, admin2.id, 'ADMIN');

      // admin1 demotes admin2
      const roster = await getHousehold(admin1.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === admin2.id);
      expect(target.role).toBe('ADMIN');

      const response = await changeMemberRole(admin1.accessToken, household.id, target.membershipId, 'MEMBER');
      expect(response.statusCode).toBe(200);

      const body = response.json();
      const updatedTarget = body.members.find((m: { membershipId: string }) => m.membershipId === target.membershipId);
      expect(updatedTarget.role).toBe('MEMBER');
    });

    test('admin cannot target owner', async () => {
      const owner = await insertVerifiedUser('owner@example.test', '家主');
      const admin = await insertVerifiedUser('admin@example.test', '管理员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');

      // Find owner's membership.
      const roster = await getHousehold(admin.accessToken, household.id);
      const ownerMembership = roster.json().members.find((m: { userId: string }) => m.userId === owner.id);
      expect(ownerMembership.role).toBe('OWNER');

      const response = await changeMemberRole(admin.accessToken, household.id, ownerMembership.membershipId, 'MEMBER');
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('OWNER_UNTOUCHABLE');
    });

    test('member cannot promote or demote', async () => {
      const owner = await insertVerifiedUser('owner@example.test', '家主');
      const member = await insertVerifiedUser('member@example.test', '成员');
      const other = await insertVerifiedUser('other@example.test', '其他');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, member.id, 'MEMBER');
      await addMemberViaDb(household.id, other.id, 'MEMBER');

      const roster = await getHousehold(member.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === other.id);

      const response = await changeMemberRole(member.accessToken, household.id, target.membershipId, 'ADMIN');
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('INSUFFICIENT_ROLE');
    });

    test('rejects changing to same role', async () => {
      const owner = await insertVerifiedUser('owner@example.test', '家主');
      const admin = await insertVerifiedUser('admin@example.test', '管理员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');

      const roster = await getHousehold(owner.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === admin.id);

      const response = await changeMemberRole(owner.accessToken, household.id, target.membershipId, 'ADMIN');
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('ROLE_UNCHANGED');
    });
  });

  describe('D-10: stalled and cross-household rejection', () => {
    test('cross-household target membership returns 404', async () => {
      const ownerA = await insertVerifiedUser('ownera@example.test', '家主A');
      const ownerB = await insertVerifiedUser('ownerb@example.test', '家主B');
      const memberB = await insertVerifiedUser('memberb@example.test', '成员B');

      const h1 = await createHouseholdWithRole(app, ownerA.id, ownerA.accessToken, '家庭A');
      const h2 = await createHouseholdWithRole(app, ownerB.id, ownerB.accessToken, '家庭B');
      await addMemberViaDb(h2.id, memberB.id, 'MEMBER');

      // Get memberB's membership from h2.
      const rosterB = await getHousehold(ownerB.accessToken, h2.id);
      const targetB = rosterB.json().members.find((m: { userId: string }) => m.userId === memberB.id);

      // ownerA tries to change memberB's role using h1 context.
      const response = await changeMemberRole(ownerA.accessToken, h1.id, targetB.membershipId, 'ADMIN');
      expect(response.statusCode).toBe(404);
    });

    test('outsider returns 404 on unknown household', async () => {
      const owner = await insertVerifiedUser('owner@example.test', '家主');
      const outsider = await insertVerifiedUser('outsider@example.test', '外人');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');

      const response = await changeMemberRole(outsider.accessToken, household.id, randomUUID(), 'ADMIN');
      expect(response.statusCode).toBe(404);
    });

    test('stale membership rollback with role mismatch', async () => {
      const owner = await insertVerifiedUser('owner2@example.test', '家主');
      const admin = await insertVerifiedUser('admin2@example.test', '管理员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '家庭2');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');

      const roster = await getHousehold(owner.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === admin.id);
      expect(target.role).toBe('ADMIN');

      // Directly demote in DB to simulate staleness between load and write.
      await withDatabase(async (client) => {
        await client.query(
          `UPDATE "memberships" SET "role" = 'MEMBER' WHERE "id" = $1`,
          [target.membershipId],
        );
      });

      // Actor tries to demote the admin (targetRole='ADMIN' in memory), but DB has MEMBER.
      // The service will do: updateMany where id=X, householdId=Y, role='ADMIN' (stale)
      // Since DB has 'MEMBER', count=0 → 409.
      const response = await changeMemberRole(owner.accessToken, household.id, target.membershipId, 'MEMBER');

      // The conditional update should detect the mismatch and return 409.
      // However, the policy check uses targetRole='ADMIN' (stale), which passes.
      // Then the transaction fails the conditional update → 409.
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('STALE_MEMBERSHIP');
    });
  });
});
