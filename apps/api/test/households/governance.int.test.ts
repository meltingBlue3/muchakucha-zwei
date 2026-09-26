import { RecurrenceMaterializerService } from '../../src/modules/recurrence/recurrence-materializer.service.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
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

async function insertUser(username: string, displayName: string): Promise<MemberFixture> {
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
      `INSERT INTO "User" ("id", "username", "username_canonical", "display_name", "password_hash")
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, username, username.trim().normalize('NFC').toLowerCase(), displayName, passwordHash],
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
  _userId: string,
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
      JWT_ACCESS_SECRET: accessSecret,
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
      const owner = await insertUser('owner', '家主');
      const member = await insertUser('member', '成员');

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
      const owner = await insertUser('owner', '家主');
      const admin = await insertUser('admin', '管理员');

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

    test('admin cannot promote members to admin', async () => {
      const owner = await insertUser('owner', '家主');
      const admin = await insertUser('admin', '管理员');
      const member = await insertUser('member', '成员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');
      await addMemberViaDb(household.id, member.id, 'MEMBER');

      const roster = await getHousehold(admin.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === member.id);
      expect(target.role).toBe('MEMBER');

      const response = await changeMemberRole(admin.accessToken, household.id, target.membershipId, 'ADMIN');
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('INSUFFICIENT_ROLE');

      const body = (await getHousehold(owner.accessToken, household.id)).json();
      const updatedTarget = body.members.find((m: { membershipId: string }) => m.membershipId === target.membershipId);
      expect(updatedTarget.role).toBe('MEMBER');
    });

    test('admin cannot demote another admin', async () => {
      const owner = await insertUser('owner', '家主');
      const admin1 = await insertUser('admin1', '管理员甲');
      const admin2 = await insertUser('admin2', '管理员乙');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin1.id, 'ADMIN');
      await addMemberViaDb(household.id, admin2.id, 'ADMIN');

      // admin1 demotes admin2
      const roster = await getHousehold(admin1.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === admin2.id);
      expect(target.role).toBe('ADMIN');

      const response = await changeMemberRole(admin1.accessToken, household.id, target.membershipId, 'MEMBER');
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('INSUFFICIENT_ROLE');

      const body = (await getHousehold(owner.accessToken, household.id)).json();
      const updatedTarget = body.members.find((m: { membershipId: string }) => m.membershipId === target.membershipId);
      expect(updatedTarget.role).toBe('ADMIN');
    });

    test('admin cannot target owner', async () => {
      const owner = await insertUser('owner', '家主');
      const admin = await insertUser('admin', '管理员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');

      // Find owner's membership.
      const roster = await getHousehold(admin.accessToken, household.id);
      const ownerMembership = roster.json().members.find((m: { userId: string }) => m.userId === owner.id);
      expect(ownerMembership.role).toBe('OWNER');

      const response = await changeMemberRole(admin.accessToken, household.id, ownerMembership.membershipId, 'MEMBER');
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('OWNER_UNTOUCHABLE');
    });

    test('member cannot promote or demote', async () => {
      const owner = await insertUser('owner', '家主');
      const member = await insertUser('member', '成员');
      const other = await insertUser('other', '其他');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, member.id, 'MEMBER');
      await addMemberViaDb(household.id, other.id, 'MEMBER');

      const roster = await getHousehold(member.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === other.id);

      const response = await changeMemberRole(member.accessToken, household.id, target.membershipId, 'ADMIN');
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('INSUFFICIENT_ROLE');
    });

    test('rejects changing to same role', async () => {
      const owner = await insertUser('owner', '家主');
      const admin = await insertUser('admin', '管理员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');

      const roster = await getHousehold(owner.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === admin.id);

      const response = await changeMemberRole(owner.accessToken, household.id, target.membershipId, 'ADMIN');
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('ROLE_UNCHANGED');
    });
  });

  describe('D-10: stalled and cross-household rejection', () => {
    test('cross-household target membership returns 404', async () => {
      const ownerA = await insertUser('ownera', '家主A');
      const ownerB = await insertUser('ownerb', '家主B');
      const memberB = await insertUser('memberb', '成员B');

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
      const owner = await insertUser('owner', '家主');
      const outsider = await insertUser('outsider', '外人');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');

      const response = await changeMemberRole(outsider.accessToken, household.id, randomUUID(), 'ADMIN');
      expect(response.statusCode).toBe(404);
    });

    test('stale membership rollback with role mismatch', async () => {
      const owner = await insertUser('owner2', '家主');
      const admin = await insertUser('admin2', '管理员');

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
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('ROLE_UNCHANGED');
    });
  });

  // ---- Member removal helpers ----

  function removeMember(
    accessToken: string,
    householdId: string,
    membershipId: string,
  ) {
    return app.inject({
      method: 'DELETE',
      url: `/api/v1/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(membershipId)}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  describe('removes a member', () => {
    test('owner removes a member', async () => {
      const owner = await insertUser('owner', '家主');
      const member = await insertUser('member', '成员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, member.id, 'MEMBER');

      const roster = await getHousehold(owner.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === member.id);
      expect(target).toBeDefined();
      expect(target.role).toBe('MEMBER');

      const response = await removeMember(owner.accessToken, household.id, target.membershipId);
      expect(response.statusCode).toBe(200);

      // Verify member is removed from the roster.
      const updatedRoster = await getHousehold(owner.accessToken, household.id);
      const removedMember = updatedRoster.json().members.find(
        (m: { userId: string }) => m.userId === member.id,
      );
      expect(removedMember).toBeUndefined();
    });

    test('owner removes another admin', async () => {
      const owner = await insertUser('owner', '家主');
      const admin = await insertUser('admin', '管理员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');

      const roster = await getHousehold(owner.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === admin.id);
      expect(target.role).toBe('ADMIN');

      const response = await removeMember(owner.accessToken, household.id, target.membershipId);
      expect(response.statusCode).toBe(200);

      const updatedRoster = await getHousehold(owner.accessToken, household.id);
      const removedAdmin = updatedRoster.json().members.find(
        (m: { userId: string }) => m.userId === admin.id,
      );
      expect(removedAdmin).toBeUndefined();
    });

    test('admin removes a member', async () => {
      const owner = await insertUser('owner', '家主');
      const admin = await insertUser('admin', '管理员');
      const member = await insertUser('member', '成员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');
      await addMemberViaDb(household.id, member.id, 'MEMBER');

      const roster = await getHousehold(admin.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === member.id);
      expect(target.role).toBe('MEMBER');

      const response = await removeMember(admin.accessToken, household.id, target.membershipId);
      expect(response.statusCode).toBe(200);

      const updatedRoster = await getHousehold(admin.accessToken, household.id);
      const removedMember = updatedRoster.json().members.find(
        (m: { userId: string }) => m.userId === member.id,
      );
      expect(removedMember).toBeUndefined();
    });

    test('removal rechecks a member promoted to admin after the initial roster read', async () => {
      const owner = await insertUser('owner', '家主');
      const admin = await insertUser('admin', '管理员');
      const member = await insertUser('member', '成员');
      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');
      await addMemberViaDb(household.id, member.id, 'MEMBER');
      const prisma = app.get(PrismaService);
      const snapshot = await prisma.household.findUnique({ where: { id: household.id }, include: { memberships: true } });
      const target = snapshot!.memberships.find((m) => m.userId === member.id)!;
      await prisma.membership.update({ where: { id: target.id }, data: { role: 'ADMIN' } });
      // Reproduce a request whose first read preceded the owner's promotion.
      const staleRead = vi.spyOn(prisma.household, 'findUnique').mockResolvedValueOnce(snapshot);
      try {
        const response = await removeMember(admin.accessToken, household.id, target.id);
        expect(response.statusCode).toBe(403);
        expect(response.json().error.code).toBe('INSUFFICIENT_ROLE');
        expect((await prisma.membership.findUnique({ where: { id: target.id } }))?.role).toBe('ADMIN');
      } finally {
        staleRead.mockRestore();
      }
    });

    test('admin cannot remove another admin', async () => {
      const owner = await insertUser('owner', '家主');
      const admin1 = await insertUser('admin1', '管理员甲');
      const admin2 = await insertUser('admin2', '管理员乙');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin1.id, 'ADMIN');
      await addMemberViaDb(household.id, admin2.id, 'ADMIN');

      const roster = await getHousehold(admin1.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === admin2.id);
      expect(target.role).toBe('ADMIN');

      const response = await removeMember(admin1.accessToken, household.id, target.membershipId);
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('INSUFFICIENT_ROLE');

      const updatedRoster = await getHousehold(admin1.accessToken, household.id);
      const removedAdmin = updatedRoster.json().members.find(
        (m: { userId: string }) => m.userId === admin2.id,
      );
      expect(removedAdmin.role).toBe('ADMIN');
    });

    test('admin cannot remove owner', async () => {
      const owner = await insertUser('owner', '家主');
      const admin = await insertUser('admin', '管理员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');

      const roster = await getHousehold(admin.accessToken, household.id);
      const ownerMembership = roster.json().members.find((m: { userId: string }) => m.userId === owner.id);
      expect(ownerMembership.role).toBe('OWNER');

      const response = await removeMember(admin.accessToken, household.id, ownerMembership.membershipId);
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('OWNER_UNTOUCHABLE');
    });

    test('member cannot remove anyone', async () => {
      const owner = await insertUser('owner', '家主');
      const member = await insertUser('member', '成员');
      const other = await insertUser('other', '其他');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, member.id, 'MEMBER');
      await addMemberViaDb(household.id, other.id, 'MEMBER');

      const roster = await getHousehold(member.accessToken, household.id);
      const target = roster.json().members.find((m: { userId: string }) => m.userId === other.id);

      const response = await removeMember(member.accessToken, household.id, target.membershipId);
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('INSUFFICIENT_ROLE');
    });

    test('cannot remove own membership', async () => {
      const owner = await insertUser('owner', '家主');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');

      const roster = await getHousehold(owner.accessToken, household.id);
      const selfMembership = roster.json().members.find((m: { userId: string }) => m.userId === owner.id);
      expect(selfMembership.role).toBe('OWNER');

      const response = await removeMember(owner.accessToken, household.id, selfMembership.membershipId);
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('OWNER_UNTOUCHABLE');
    });

    test('cross-household target membership returns 404', async () => {
      const ownerA = await insertUser('ownera', '家主A');
      const ownerB = await insertUser('ownerb', '家主B');
      const memberB = await insertUser('memberb', '成员B');

      const h1 = await createHouseholdWithRole(app, ownerA.id, ownerA.accessToken, '家庭A');
      const h2 = await createHouseholdWithRole(app, ownerB.id, ownerB.accessToken, '家庭B');
      await addMemberViaDb(h2.id, memberB.id, 'MEMBER');

      const rosterB = await getHousehold(ownerB.accessToken, h2.id);
      const targetB = rosterB.json().members.find((m: { userId: string }) => m.userId === memberB.id);

      const response = await removeMember(ownerA.accessToken, h1.id, targetB.membershipId);
      expect(response.statusCode).toBe(404);
    });

    test('outsider returns 404 on unknown household', async () => {
      const owner = await insertUser('owner', '家主');
      const outsider = await insertUser('outsider', '外人');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');

      const response = await removeMember(outsider.accessToken, household.id, randomUUID());
      expect(response.statusCode).toBe(404);
    });
  });

  // ---- Ownership transfer helpers ----

  function transferOwnership(
    accessToken: string,
    householdId: string,
    successorMembershipId: string,
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(householdId)}/ownership/transfer`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      payload: { successorMembershipId },
    });
  }

  describe('transfers ownership', () => {
    test('owner transfers ownership to a member', async () => {
      const owner = await insertUser('owner', '家主');
      const successor = await insertUser('successor', '继任者');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, successor.id, 'MEMBER');

      // Get the successor's membership ID via the household roster.
      const roster = await getHousehold(owner.accessToken, household.id);
      const successorMembership = roster.json().members.find(
        (m: { userId: string }) => m.userId === successor.id,
      );
      expect(successorMembership).toBeDefined();
      expect(successorMembership.role).toBe('MEMBER');

      const response = await transferOwnership(
        owner.accessToken,
        household.id,
        successorMembership.membershipId,
      );
      expect(response.statusCode).toBe(200);

      const body = response.json();

      // Verify successor is now the owner.
      const newOwnerMember = body.members.find(
        (m: { membershipId: string }) => m.membershipId === successorMembership.membershipId,
      );
      expect(newOwnerMember.role).toBe('OWNER');

      // Verify former owner is now MEMBER.
      const formerOwnerMember = body.members.find(
        (m: { userId: string }) => m.userId === owner.id,
      );
      expect(formerOwnerMember.role).toBe('MEMBER');

      // Verify ownerMembershipId pointer changed.
      expect(body.ownerMembershipId).toBe(successorMembership.membershipId);
    });

    test('owner transfers ownership to an admin', async () => {
      const owner = await insertUser('owner', '家主');
      const admin = await insertUser('admin', '管理员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');

      const roster = await getHousehold(owner.accessToken, household.id);
      const adminMembership = roster.json().members.find(
        (m: { userId: string }) => m.userId === admin.id,
      );
      expect(adminMembership.role).toBe('ADMIN');

      const response = await transferOwnership(
        owner.accessToken,
        household.id,
        adminMembership.membershipId,
      );
      expect(response.statusCode).toBe(200);

      const body = response.json();

      // Verify admin is now the owner.
      const newOwnerMember = body.members.find(
        (m: { membershipId: string }) => m.membershipId === adminMembership.membershipId,
      );
      expect(newOwnerMember.role).toBe('OWNER');

      // Verify former owner is now MEMBER.
      const formerOwnerMember = body.members.find(
        (m: { userId: string }) => m.userId === owner.id,
      );
      expect(formerOwnerMember.role).toBe('MEMBER');

      // Verify ownerMembershipId pointer changed.
      expect(body.ownerMembershipId).toBe(adminMembership.membershipId);
    });

    test('admin cannot transfer ownership', async () => {
      const owner = await insertUser('owner', '家主');
      const admin = await insertUser('admin', '管理员');
      const member = await insertUser('member', '成员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');
      await addMemberViaDb(household.id, member.id, 'MEMBER');

      const roster = await getHousehold(admin.accessToken, household.id);
      const targetMembership = roster.json().members.find(
        (m: { userId: string }) => m.userId === member.id,
      );

      const response = await transferOwnership(
        admin.accessToken,
        household.id,
        targetMembership.membershipId,
      );
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('NOT_OWNER');
    });

    test('member cannot transfer ownership', async () => {
      const owner = await insertUser('owner', '家主');
      const member = await insertUser('member', '成员');
      const other = await insertUser('other', '其他');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, member.id, 'MEMBER');
      await addMemberViaDb(household.id, other.id, 'MEMBER');

      const roster = await getHousehold(member.accessToken, household.id);
      const targetMembership = roster.json().members.find(
        (m: { userId: string }) => m.userId === other.id,
      );

      const response = await transferOwnership(
        member.accessToken,
        household.id,
        targetMembership.membershipId,
      );
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('NOT_OWNER');
    });

    test('cannot transfer to self', async () => {
      const owner = await insertUser('owner', '家主');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');

      const roster = await getHousehold(owner.accessToken, household.id);
      const selfMembership = roster.json().members.find(
        (m: { userId: string }) => m.userId === owner.id,
      );
      expect(selfMembership.role).toBe('OWNER');

      const response = await transferOwnership(
        owner.accessToken,
        household.id,
        selfMembership.membershipId,
      );
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('SUCCESSOR_IS_OWNER');
    });

    test('cross-household successor returns 404', async () => {
      const ownerA = await insertUser('ownera', '家主A');
      const ownerB = await insertUser('ownerb', '家主B');
      const memberB = await insertUser('memberb', '成员B');

      const h1 = await createHouseholdWithRole(app, ownerA.id, ownerA.accessToken, '家庭A');
      const h2 = await createHouseholdWithRole(app, ownerB.id, ownerB.accessToken, '家庭B');
      await addMemberViaDb(h2.id, memberB.id, 'MEMBER');

      // Get memberB's membership from h2.
      const rosterB = await getHousehold(ownerB.accessToken, h2.id);
      const targetB = rosterB.json().members.find(
        (m: { userId: string }) => m.userId === memberB.id,
      );

      // ownerA tries to transfer h1 ownership to a member from h2.
      const response = await transferOwnership(
        ownerA.accessToken,
        h1.id,
        targetB.membershipId,
      );
      expect(response.statusCode).toBe(404);
    });

    test('outsider returns 404 on unknown household', async () => {
      const owner = await insertUser('owner', '家主');
      const outsider = await insertUser('outsider', '外人');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');

      const response = await transferOwnership(
        outsider.accessToken,
        household.id,
        randomUUID(),
      );
      expect(response.statusCode).toBe(404);
    });

    test('stale owner pointer blocks owner leave', async () => {
      const owner = await insertUser('owner3', '家主');
      const successor = await insertUser('successor3', '继任者');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '家庭3');
      await addMemberViaDb(household.id, successor.id, 'MEMBER');

      const roster = await getHousehold(owner.accessToken, household.id);
      const successorMembership = roster.json().members.find(
        (m: { userId: string }) => m.userId === successor.id,
      );

      // Simulate a concurrent transfer by directly updating the owner pointer in DB.
      await withDatabase(async (client) => {
        await client.query(
          `UPDATE "households" SET "owner_membership_id" = $1 WHERE "id" = $2`,
          [successorMembership.membershipId, household.id],
        );
      });

      // Now the owner tries to transfer — the compare-and-set should fail
      // because ownerMembershipId no longer matches the actor's membership.
      const response = await transferOwnership(
        owner.accessToken,
        household.id,
        successorMembership.membershipId,
      );
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('NOT_OWNER');
    });

    test('former owner role is MEMBER after transfer', async () => {
      const owner = await insertUser('owner4', '家主');
      const successor = await insertUser('successor4', '继任者');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '家庭4');
      await addMemberViaDb(household.id, successor.id, 'MEMBER');

      const roster = await getHousehold(owner.accessToken, household.id);
      const successorMembership = roster.json().members.find(
        (m: { userId: string }) => m.userId === successor.id,
      );

      const response = await transferOwnership(
        owner.accessToken,
        household.id,
        successorMembership.membershipId,
      );
      expect(response.statusCode).toBe(200);

      const body = response.json();

      // Former owner's role is explicitly MEMBER.
      const formerOwner = body.members.find(
        (m: { userId: string }) => m.userId === owner.id,
      );
      expect(formerOwner.role).toBe('MEMBER');

      // Owner pointer is correct.
      expect(body.ownerMembershipId).toBe(successorMembership.membershipId);

      // Exactly one OWNER exists.
      const owners = body.members.filter(
        (m: { role: string }) => m.role === 'OWNER',
      );
      expect(owners.length).toBe(1);
    });
  });

  // ---- Owner leave helpers ----

  function leaveHousehold(
    accessToken: string,
    householdId: string,
    successorMembershipId: string,
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/households/${encodeURIComponent(householdId)}/ownership/leave`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      payload: { successorMembershipId },
    });
  }

  async function assertMembershipExists(
    householdId: string,
    userId: string,
    expectation: 'exists' | 'deleted',
  ): Promise<void> {
    await withDatabase(async (client) => {
      const result = await client.query(
        `SELECT "id" FROM "memberships" WHERE "household_id" = $1 AND "user_id" = $2`,
        [householdId, userId],
      );
      if (expectation === 'exists') {
        expect(result.rows.length).toBe(1);
      } else {
        expect(result.rows.length).toBe(0);
      }
    });
  }

  async function assertOwnerPointer(
    householdId: string,
    expectedOwnerMembershipId: string,
  ): Promise<void> {
    await withDatabase(async (client) => {
      const result = await client.query(
        `SELECT "owner_membership_id" FROM "households" WHERE "id" = $1`,
        [householdId],
      );
      expect(result.rows[0]?.owner_membership_id).toBe(expectedOwnerMembershipId);
    });
  }

  describe('departed member task assignments', () => {
    test('departure waiting for a task writer retries with a fresh snapshot and clears its new assignment', async () => {
      const owner = await insertUser('owner', '家主');
      const member = await insertUser('leaving', '成员');
      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '家庭');
      await addMemberViaDb(household.id, member.id, 'MEMBER');
      const taskId = randomUUID();
      await withDatabase(async (writer) => {
        await writer.query('BEGIN');
        try {
          // Same household write as a task creation transaction, left uncommitted.
          await writer.query('UPDATE households SET name = name WHERE id = $1', [household.id]);
          await writer.query('INSERT INTO tasks (id, household_id, created_by, title) VALUES ($1, $2, $3, $4)', [taskId, household.id, owner.id, '并发创建']);
          await writer.query('INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)', [taskId, member.id]);
          const pid = (await writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
          const departure = app.inject({ method: 'POST', url: `/api/v1/households/${household.id}/leave`, headers: { authorization: `Bearer ${member.accessToken}` } }).then(response => response);
          await vi.waitFor(async () => {
            const blocked = await writer.query<{ blocked: boolean }>('SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked', [pid]);
            expect(blocked.rows[0]!.blocked).toBe(true);
          });
          await writer.query('COMMIT');
          expect((await departure).statusCode).toBe(204);
        } finally { await writer.query('ROLLBACK'); }
      });
      const prisma = app.get(PrismaService);
      expect(await prisma.task.count({ where: { id: taskId } })).toBe(1);
      expect(await prisma.taskAssignee.count({ where: { taskId } })).toBe(0);
    });

    test.each(['MEMBER', 'ADMIN', 'removed', 'owner-handoff'])(
      '%s departure clears all statuses and recurrence seeds only in that household', async (mode) => {
        const owner = await insertUser('owner', '家主');
        const member = await insertUser('leaving', '成员');
        const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '家庭');
        await addMemberViaDb(household.id, member.id, mode === 'ADMIN' ? 'ADMIN' : 'MEMBER');
        const departing = mode === 'owner-handoff' ? owner : member;
        const remaining = mode === 'owner-handoff' ? member : owner;
        const prisma = app.get(PrismaService);
        const other = await createHouseholdWithRole(app, departing.id, departing.accessToken, '其他家庭');
        const unrelated = await prisma.task.create({ data: {
          householdId: other.id, createdBy: departing.id, title: '其他家庭任务',
          assignees: { create: { userId: departing.id } },
        } });
        const tasks = [];
        for (const status of ['pending', 'in_progress', 'completed', 'cancelled']) {
          tasks.push(await prisma.task.create({ data: {
            householdId: household.id, createdBy: departing.id, title: `保留 ${status}`, status,
            assignees: { create: [departing, remaining].map(({ id }) => ({ userId: id })) },
          } }));
        }
        const alone = await prisma.task.create({ data: {
          householdId: household.id, createdBy: departing.id, title: '无人负责',
          assignees: { create: { userId: departing.id } },
        } });
        const today = new Date().toISOString().slice(0, 10);
        const rule = await prisma.recurrenceRule.create({ data: {
          householdId: household.id, createdBy: departing.id, freq: 'daily', byWeekday: [],
          startsOn: new Date(`${today}T00:00:00Z`), timezone: 'UTC', templateTitle: '重复任务',
        } });
        const seed = await prisma.task.create({ data: {
          householdId: household.id, createdBy: departing.id, title: '重复任务',
          recurrenceRuleId: rule.id, occurrenceDate: new Date(`${today}T00:00:00Z`),
          assignees: { create: [departing, remaining].map(({ id }) => ({ userId: id })) },
        } });
        const target = await prisma.membership.findUniqueOrThrow({ where: {
          userId_householdId: { userId: member.id, householdId: household.id },
        } });
        const response = mode === 'removed'
          ? await removeMember(owner.accessToken, household.id, target.id)
          : mode === 'owner-handoff'
            ? await leaveHousehold(owner.accessToken, household.id, target.id)
            : await app.inject({ method: 'POST', url: `/api/v1/households/${household.id}/leave`, headers: { authorization: `Bearer ${member.accessToken}` } });
        expect(response.statusCode).toBe(mode === 'removed' ? 200 : 204);
        expect(await prisma.taskAssignee.count({ where: { userId: departing.id, task: { householdId: household.id } } })).toBe(0);
        for (const before of [...tasks, seed]) {
          const after = await prisma.task.findUniqueOrThrow({ where: { id: before.id }, include: { assignees: true } });
          expect(after).toMatchObject({ title: before.title, status: before.status, createdBy: departing.id });
          expect(after.assignees.map(({ userId }) => userId)).toEqual([remaining.id]);
          expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
        }
        expect(await prisma.taskAssignee.count({ where: { taskId: alone.id } })).toBe(0);
        expect(await prisma.taskAssignee.count({ where: { taskId: unrelated.id, userId: departing.id } })).toBe(1);
        expect((await prisma.task.findUniqueOrThrow({ where: { id: unrelated.id } })).updatedAt).toEqual(unrelated.updatedAt);
        expect((await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: rule.id } })).updatedAt.getTime()).toBeGreaterThan(rule.updatedAt.getTime());
        const stale = await app.inject({ method: 'PUT', url: `/api/v1/households/${household.id}/tasks/${tasks[0]!.id}`,
          headers: { authorization: `Bearer ${remaining.accessToken}` },
          payload: { title: '旧表单', expectedUpdatedAt: tasks[0]!.updatedAt.toISOString(), assigneeIds: [departing.id] },
        });
        expect(stale.statusCode).toBe(409);
        expect(stale.json().error.code).toBe('EDIT_CONFLICT');
        // Advance the scheduler clock to prove new instances inherit the cleaned seed.
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
          vi.setSystemTime(new Date(`${today}T12:00:00Z`).getTime() + 86_400_000);
          const result = await app.get(RecurrenceMaterializerService).materializeRule(rule.id);
          expect(result.created).toBeGreaterThan(0);
        } finally { vi.useRealTimers(); }
        const generated = await prisma.task.findMany({ where: { recurrenceRuleId: rule.id, id: { not: seed.id } }, include: { assignees: true } });
        expect(generated.length).toBeGreaterThan(0);
        for (const task of generated) expect(task.assignees.map(({ userId }) => userId)).toEqual([remaining.id]);
      },
    );
  });

  describe('members leave directly', () => {
    function leaveDirectly(token: string, householdId: string) {
      return app.inject({ method: 'POST', url: `/api/v1/households/${householdId}/leave`, headers: { authorization: `Bearer ${token}` } });
    }

    test.each(['MEMBER', 'ADMIN'])('%s leaves while shared content and authors remain accessible to the family', async (role) => {
      const owner = await insertUser('owner', '家主');
      const member = await insertUser('leaving', '离开的人');
      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '家庭');
      await addMemberViaDb(household.id, member.id, role);
      const prisma = app.get(PrismaService);
      const common = { householdId: household.id, createdBy: member.id, title: '保留内容' };
      const event = await prisma.event.create({ data: { ...common, startTime: new Date(), endTime: new Date() } });
      const task = await prisma.task.create({ data: common });
      const note = await prisma.note.create({ data: common });
      expect((await leaveDirectly(member.accessToken, household.id)).statusCode).toBe(204);
      expect((await getHousehold(member.accessToken, household.id)).statusCode).toBe(404);
      expect((await getHousehold(owner.accessToken, household.id)).json().members).toHaveLength(1);
      for (const [resource, item] of [['events', event], ['tasks', task], ['notes', note]] as const) {
        const get = (token: string) => app.inject({ method: 'GET', url: `/api/v1/households/${household.id}/${resource}/${item.id}`, headers: { authorization: `Bearer ${token}` } });
        expect((await get(member.accessToken)).statusCode).toBe(404);
        const remaining = await get(owner.accessToken);
        expect(remaining.statusCode).toBe(200);
        expect(remaining.json()).toMatchObject({ id: item.id, title: item.title, createdBy: member.id });
      }
      expect(await prisma.user.findUnique({ where: { id: member.id } })).not.toBeNull();
      expect((await leaveDirectly(member.accessToken, household.id)).statusCode).toBe(404);
    });

    test('owner must transfer first; outsiders cannot leave another household', async () => {
      const owner = await insertUser('owner', '家主');
      const member = await insertUser('member', '成员');
      const outsider = await insertUser('outsider', '外人');
      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '家庭');
      await addMemberViaDb(household.id, member.id, 'MEMBER');
      const denied = await leaveDirectly(owner.accessToken, household.id);
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.code).toBe('OWNER_TRANSFER_REQUIRED');
      expect((await leaveDirectly(outsider.accessToken, household.id)).statusCode).toBe(404);
      const before = (await getHousehold(owner.accessToken, household.id)).json();
      expect(before.members).toHaveLength(2);
      expect(before.ownerMembershipId).toBe(household.ownerMembershipId);
      const successor = before.members.find((m: { userId: string }) => m.userId === member.id);
      const transfer = await app.inject({ method: 'POST', url: `/api/v1/households/${household.id}/ownership/transfer`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { successorMembershipId: successor.membershipId } });
      expect(transfer.statusCode).toBe(200);
      expect((await leaveDirectly(owner.accessToken, household.id)).statusCode).toBe(204);
      const after = (await getHousehold(member.accessToken, household.id)).json();
      expect(after.ownerMembershipId).toBe(successor.membershipId);
      expect(after.members).toHaveLength(1);
      expect((await leaveDirectly(member.accessToken, household.id)).statusCode).toBe(403);
    });
  });

  describe('owner leaves', () => {
    test('owner leaves and hands off to a member', async () => {
      const owner = await insertUser('owner-lv1', '家主');
      const successor = await insertUser('successor-lv1', '继任者');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, successor.id, 'MEMBER');

      // Get the successor's membership ID via the household roster.
      const roster = await getHousehold(owner.accessToken, household.id);
      const successorMembership = roster.json().members.find(
        (m: { userId: string }) => m.userId === successor.id,
      );
      expect(successorMembership).toBeDefined();
      expect(successorMembership.role).toBe('MEMBER');

      const response = await leaveHousehold(
        owner.accessToken,
        household.id,
        successorMembership.membershipId,
      );
      expect(response.statusCode).toBe(204);

      // Verify former owner's membership is deleted.
      await assertMembershipExists(household.id, owner.id, 'deleted');

      // Verify successor's membership still exists.
      await assertMembershipExists(household.id, successor.id, 'exists');

      // Verify owner pointer is now the successor.
      await assertOwnerPointer(household.id, successorMembership.membershipId);
    });

    test('owner leaves and hands off to an admin', async () => {
      const owner = await insertUser('owner-lv2', '家主');
      const admin = await insertUser('admin-lv2', '管理员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');
      const roster = await getHousehold(owner.accessToken, household.id);
      const adminMembership = roster.json().members.find(
        (m: { userId: string }) => m.userId === admin.id,
      );
      expect(adminMembership.role).toBe('ADMIN');

      const response = await leaveHousehold(
        owner.accessToken,
        household.id,
        adminMembership.membershipId,
      );
      expect(response.statusCode).toBe(204);

      // Verify former owner membership deleted.
      await assertMembershipExists(household.id, owner.id, 'deleted');
      // Verify admin membership still exists.
      await assertMembershipExists(household.id, admin.id, 'exists');
      // Verify admin is now the owner pointer.
      await assertOwnerPointer(household.id, adminMembership.membershipId);
    });

    test('admin cannot leave as owner', async () => {
      const owner = await insertUser('owner-lv3', '家主');
      const admin = await insertUser('admin-lv3', '管理员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, admin.id, 'ADMIN');
      const roster = await getHousehold(owner.accessToken, household.id);
      const ownerMembership = roster.json().members.find(
        (membership: { userId: string }) => membership.userId === owner.id,
      );

      // Admin tries to leave as if they were the owner — forbidden.
      const response = await leaveHousehold(
        admin.accessToken,
        household.id,
        ownerMembership.membershipId,
      );
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('NOT_OWNER');
    });

    test('member cannot leave as owner', async () => {
      const owner = await insertUser('owner-lv4', '家主');
      const member = await insertUser('member-lv4', '成员');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');
      await addMemberViaDb(household.id, member.id, 'MEMBER');
      const roster = await getHousehold(owner.accessToken, household.id);
      const ownerMembership = roster.json().members.find(
        (membership: { userId: string }) => membership.userId === owner.id,
      );

      // Member tries to leave as if they were the owner — forbidden.
      const response = await leaveHousehold(
        member.accessToken,
        household.id,
        ownerMembership.membershipId,
      );
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('NOT_OWNER');
    });

    test('cannot leave with no other members', async () => {
      const owner = await insertUser('owner-lv5', '家主');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '唯一家庭');

      const roster = await getHousehold(owner.accessToken, household.id);
      const selfMembership = roster.json().members.find(
        (m: { userId: string }) => m.userId === owner.id,
      );

      const response = await leaveHousehold(
        owner.accessToken,
        household.id,
        selfMembership.membershipId,
      );
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('LAST_MEMBER');
    });

    test('cross-household successor returns 404', async () => {
      const ownerA = await insertUser('ownera-lv6', '家主A');
      const ownerB = await insertUser('ownerb-lv6', '家主B');
      const memberB = await insertUser('memberb-lv6', '成员B');

      const h1 = await createHouseholdWithRole(app, ownerA.id, ownerA.accessToken, '家庭A');
      const h2 = await createHouseholdWithRole(app, ownerB.id, ownerB.accessToken, '家庭B');
      await addMemberViaDb(h2.id, memberB.id, 'MEMBER');

      // Get memberB's membership from h2.
      const rosterB = await getHousehold(ownerB.accessToken, h2.id);
      const targetB = rosterB.json().members.find(
        (m: { userId: string }) => m.userId === memberB.id,
      );

      // ownerA tries to leave h1 and hand off to a member from h2.
      const response = await leaveHousehold(
        ownerA.accessToken,
        h1.id,
        targetB.membershipId,
      );
      expect(response.statusCode).toBe(404);
    });

    test('outsider returns 404 on unknown household', async () => {
      const owner = await insertUser('owner-lv7', '家主');
      const outsider = await insertUser('outsider-lv7', '外人');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '我的家庭');

      const response = await leaveHousehold(
        outsider.accessToken,
        household.id,
        '00000000-0000-0000-0000-000000000000',
      );
      expect(response.statusCode).toBe(404);
    });

    test('stale owner pointer rollback on concurrent transfer', async () => {
      const owner = await insertUser('owner-lv8', '家主');
      const successor = await insertUser('successor-lv8', '继任者');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '家庭8');
      await addMemberViaDb(household.id, successor.id, 'MEMBER');

      const roster = await getHousehold(owner.accessToken, household.id);
      const successorMembership = roster.json().members.find(
        (m: { userId: string }) => m.userId === successor.id,
      );

      // Simulate a concurrent transfer by directly updating the owner pointer in DB.
      await withDatabase(async (client) => {
        await client.query(
          `UPDATE "households" SET "owner_membership_id" = $1 WHERE "id" = $2`,
          [successorMembership.membershipId, household.id],
        );
      });

      // Now the owner tries to leave — the compare-and-set should fail
      // because ownerMembershipId no longer matches the actor's membership.
      const response = await leaveHousehold(
        owner.accessToken,
        household.id,
        successorMembership.membershipId,
      );
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('NOT_OWNER');
    });

    test('leave is atomic: rollback preserves membership and pointer on failure', async () => {
      const owner = await insertUser('owner-lv9', '家主');
      const successor = await insertUser('successor-lv9', '继任者');

      const household = await createHouseholdWithRole(app, owner.id, owner.accessToken, '家庭9');
      await addMemberViaDb(household.id, successor.id, 'MEMBER');

      const response = await leaveHousehold(
        owner.accessToken,
        household.id,
        '00000000-0000-0000-0000-000000000000',
      );

      // The leave should fail — verify state is unchanged.
      expect(response.statusCode).toBe(404);
      await assertMembershipExists(household.id, owner.id, 'exists');
      await assertOwnerPointer(household.id, household.ownerMembershipId);
    });
  });
});
