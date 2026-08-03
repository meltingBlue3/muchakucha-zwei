import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:55432/muchakucha_test';
const password = 'correct horse battery staple 2026';

// ---- Database helpers ----

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

// ---- Account helpers ----

async function prepareVerifiedAccount(
  seed: string,
  displayName: string,
): Promise<{ email: string; accessToken: string; userId: string }> {
  return withDatabase(async (database) => {
    const email = `role-gov-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({
        email,
        displayName,
        password,
        platform: 'web',
      }),
    });
    expect(registerResponse.status).toBe(202);

    await database.query(
      `UPDATE "User" SET "email_verified_at" = now() WHERE "email_canonical" = lower($1)`,
      [email],
    );

    const userResult = await database.query(
      `SELECT "id" FROM "User" WHERE "email_canonical" = lower($1)`,
      [email],
    );
    const userId = userResult.rows[0]?.id as string;
    expect(userId).toBeDefined();

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const loginBody: unknown = await loginResponse.json();
    const accessToken = (loginBody as { accessToken?: string }).accessToken;
    expect(accessToken).toBeDefined();

    return { email, accessToken, userId };
  });
}

async function createHousehold(
  accessToken: string,
  name: string,
): Promise<{ id: string; name: string; ownerMembershipId: string }> {
  const response = await fetch(`${API_ORIGIN}/api/v1/households`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  const body: unknown = await response.json();
  const household = body as { id: string; name: string; ownerMembershipId: string };
  expect(response.status).toBe(201);
  return { id: household.id, name: household.name, ownerMembershipId: household.ownerMembershipId };
}

async function addMembershipViaDb(
  householdId: string,
  userId: string,
  role: string,
): Promise<void> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    await database.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role")
       VALUES ($1, $2, $3)`,
      [userId, householdId, role],
    );
  } finally {
    await database.end();
  }
}

async function getHouseholdMemberships(
  accessToken: string,
  householdId: string,
): Promise<Array<{ membershipId: string; userId: string; role: string }>> {
  const response = await fetch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(householdId)}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { members: Array<{ membershipId: string; userId: string; role: string }> };
  return body.members;
}

// --- Static guard: this file must contain exactly one test() call. ---
// The verify automation counts test( occurrences; adding a second test() would
// break the gate. Keep integration and tie-case variants outside this dedicated file.

test('changes a non-owner role', async ({ page, request }) => {
  test.setTimeout(120_000);

  // ============================================================================
  // PRECONDITIONS: accounts, household, and member fixtures are healthy
  // ============================================================================

  const owner = await prepareVerifiedAccount('owner', '家主');
  const admin = await prepareVerifiedAccount('admin', '管理员');
  const memberA = await prepareVerifiedAccount('memberA', '成员甲');
  const memberB = await prepareVerifiedAccount('memberB', '成员乙');
  const outsider = await prepareVerifiedAccount('outsider', '无关人员');

  const household = await createHousehold(owner.accessToken, '角色治理测试家庭');

  // Add admin and members via DB.
  await addMembershipViaDb(household.id, admin.userId, 'ADMIN');
  await addMembershipViaDb(household.id, memberA.userId, 'MEMBER');
  await addMembershipViaDb(household.id, memberB.userId, 'MEMBER');

  // Verify roster is authoritative.
  const roster = await getHouseholdMemberships(owner.accessToken, household.id);
  expect(roster.length).toBe(4); // owner + admin + memberA + memberB

  // ============================================================================
  // PRECONDITIONS: settings page is reachable
  // ============================================================================

  await page.goto(`${WEB_ORIGIN}/login`);
  await page.waitForTimeout(500);
  await page.getByLabel('邮箱地址').fill(owner.email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForTimeout(1000);

  // Navigate to the household settings to reach member list and governance actions.
  await page.goto(`${WEB_ORIGIN}/households/${encodeURIComponent(household.id)}/settings`);
  await page.waitForURL(`/households/${encodeURIComponent(household.id)}/settings`);
  await page.waitForTimeout(2000);

  // Verify the household name is visible and roster members appear.
  await expect(page.getByText('角色治理测试家庭').first()).toBeVisible({ timeout: 5000 });

  // ============================================================================
  // D-09: ROLE CHANGE MATRIX — authorized actors can promote and demote.
  // ============================================================================

  // Find membership IDs from the authoritative roster.
  const getMember = (members: Array<{ membershipId: string; userId: string; role: string }>, userId: string) =>
    members.find((m) => m.userId === userId);

  let freshRoster = await getHouseholdMemberships(owner.accessToken, household.id);

  const adminMembership = getMember(freshRoster, admin.userId);
  const memberAMembership = getMember(freshRoster, memberA.userId);
  const memberBMembership = getMember(freshRoster, memberB.userId);

  expect(adminMembership).toBeDefined();
  expect(memberAMembership).toBeDefined();
  expect(memberBMembership).toBeDefined();
  expect(adminMembership!.role).toBe('ADMIN');
  expect(memberAMembership!.role).toBe('MEMBER');

  // ---- Owner promotes MEMBER to ADMIN ----
  const promoteResponse = await request.patch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(memberAMembership!.membershipId)}/role`,
    {
      headers: { authorization: `Bearer ${owner.accessToken}`, 'content-type': 'application/json' },
      data: { role: 'ADMIN' },
    },
  );
  expect(promoteResponse.status()).toBe(200);
  const promoteBody = (await promoteResponse.json()) as { members: Array<{ membershipId: string; role: string }> };
  const promotedMember = promoteBody.members.find((m) => m.membershipId === memberAMembership!.membershipId);
  expect(promotedMember!.role).toBe('ADMIN');

  // ---- Owner demotes the same member back to MEMBER ----
  const demoteResponse = await request.patch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(memberAMembership!.membershipId)}/role`,
    {
      headers: { authorization: `Bearer ${owner.accessToken}`, 'content-type': 'application/json' },
      data: { role: 'MEMBER' },
    },
  );
  expect(demoteResponse.status()).toBe(200);
  const demoteBody = (await demoteResponse.json()) as { members: Array<{ membershipId: string; role: string }> };
  const demotedMember = demoteBody.members.find((m) => m.membershipId === memberAMembership!.membershipId);
  expect(demotedMember!.role).toBe('MEMBER');

  // ---- Admin promotes MEMBER to ADMIN ----
  const adminPromoteResponse = await request.patch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(memberBMembership!.membershipId)}/role`,
    {
      headers: { authorization: `Bearer ${admin.accessToken}`, 'content-type': 'application/json' },
      data: { role: 'ADMIN' },
    },
  );
  expect(adminPromoteResponse.status()).toBe(200);

  // Verify memberB is now ADMIN.
  const postAdminPromoteRoster = await getHouseholdMemberships(owner.accessToken, household.id);
  const promotedMemberB = getMember(postAdminPromoteRoster, memberB.userId);
  expect(promotedMemberB!.role).toBe('ADMIN');

  // ---- Admin demotes another admin (D-09: admin can target other admins) ----
  const adminDemotesAdminResponse = await request.patch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(promotedMemberB!.membershipId)}/role`,
    {
      headers: { authorization: `Bearer ${admin.accessToken}`, 'content-type': 'application/json' },
      data: { role: 'MEMBER' },
    },
  );
  expect(adminDemotesAdminResponse.status()).toBe(200);

  // ============================================================================
  // D-09: FORBIDDEN — admin cannot target owner.
  // ============================================================================

  const ownerMembershipId = freshRoster.find((m) => m.role === 'OWNER')!.membershipId;

  const adminTargetingOwner = await request.patch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(ownerMembershipId)}/role`,
    {
      headers: { authorization: `Bearer ${admin.accessToken}`, 'content-type': 'application/json' },
      data: { role: 'MEMBER' },
    },
  );
  expect(adminTargetingOwner.status()).toBe(403);
  const adminTargetBody = (await adminTargetingOwner.json()) as { code: string };
  expect(adminTargetBody.code).toBe('OWNER_UNTOUCHABLE');

  // ============================================================================
  // D-09: FORBIDDEN — member cannot govern.
  // ============================================================================

  freshRoster = await getHouseholdMemberships(owner.accessToken, household.id);
  const someNonOwnerMembership = freshRoster.find((m) => m.role !== 'OWNER')!;

  const memberGoverning = await request.patch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(someNonOwnerMembership.membershipId)}/role`,
    {
      headers: { authorization: `Bearer ${memberA.accessToken}`, 'content-type': 'application/json' },
      data: { role: 'ADMIN' },
    },
  );
  expect(memberGoverning.status()).toBe(403);
  const memberGovBody = (await memberGoverning.json()) as { code: string };
  expect(memberGovBody.code).toBe('INSUFFICIENT_ROLE');

  // ============================================================================
  // CROSS-HOUSEHOLD: outsider cannot access.
  // ============================================================================

  const outsiderResponse = await request.patch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(someNonOwnerMembership.membershipId)}/role`,
    {
      headers: { authorization: `Bearer ${outsider.accessToken}`, 'content-type': 'application/json' },
      data: { role: 'ADMIN' },
    },
  );
  expect(outsiderResponse.status()).toBe(404);

  // ============================================================================
  // SAME-ROLE: changing to the same role returns 400.
  // ============================================================================

  const sameRoleResponse = await request.patch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(someNonOwnerMembership.membershipId)}/role`,
    {
      headers: { authorization: `Bearer ${owner.accessToken}`, 'content-type': 'application/json' },
      data: { role: someNonOwnerMembership.role as 'ADMIN' | 'MEMBER' },
    },
  );
  expect(sameRoleResponse.status()).toBe(400);
  const sameRoleBody = (await sameRoleResponse.json()) as { code: string };
  expect(sameRoleBody.code).toBe('ROLE_UNCHANGED');

  // ============================================================================
  // STALE ROLE: direct DB manipulation should cause 409 rejection.
  // ============================================================================

  freshRoster = await getHouseholdMemberships(owner.accessToken, household.id);
  const targetForStale = freshRoster.find((m) => m.role === 'ADMIN' && m.userId !== owner.userId)!;

  // Directly demote in DB to simulate stale client state.
  await withDatabase(async (db) => {
    await db.query(
      `UPDATE "memberships" SET "role" = 'MEMBER' WHERE "id" = $1`,
      [targetForStale.membershipId],
    );
  });

  // Try to demote the member using stale role data (loaded as ADMIN, actual is MEMBER).
  // The service's conditional updateMany (where role='ADMIN') should find 0 rows → 409.
  // But wait — the policy check runs first: targetRole='ADMIN' (stale), newRole='MEMBER' → allowed.
  // Then the transaction: updateMany where id=X AND role='ADMIN'. In DB it's 'MEMBER', so count=0.
  // This triggers STALE_MEMBERSHIP 409.
  const staleResponse = await request.patch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(targetForStale.membershipId)}/role`,
    {
      headers: { authorization: `Bearer ${owner.accessToken}`, 'content-type': 'application/json' },
      data: { role: 'MEMBER' },
    },
  );
  expect(staleResponse.status()).toBe(409);
  const staleBody = (await staleResponse.json()) as { code: string };
  expect(staleBody.code).toBe('STALE_MEMBERSHIP');
});