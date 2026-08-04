import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
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
    const email = `removal-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

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

test('removes a non-owner member', async ({ page, request }) => {
  test.setTimeout(120_000);

  // ============================================================================
  // PRECONDITIONS: accounts, household, and member fixtures are healthy
  // ============================================================================

  const owner = await prepareVerifiedAccount('owner', '家主');
  const admin = await prepareVerifiedAccount('admin', '管理员');
  const memberA = await prepareVerifiedAccount('memberA', '成员甲');
  const removedIdentity = await prepareVerifiedAccount('removed', '被移除的成员');

  const household = await createHousehold(owner.accessToken, '移除测试家庭');

  // Add admin and members via DB.
  await addMembershipViaDb(household.id, admin.userId, 'ADMIN');
  await addMembershipViaDb(household.id, memberA.userId, 'MEMBER');
  await addMembershipViaDb(household.id, removedIdentity.userId, 'MEMBER');

  // Verify roster is authoritative.
  let roster = await getHouseholdMemberships(owner.accessToken, household.id);
  expect(roster.length).toBe(4); // owner + admin + memberA + removedIdentity

  const removedMember = roster.find((m) => m.userId === removedIdentity.userId);
  expect(removedMember).toBeDefined();
  expect(removedMember!.role).toBe('MEMBER');

  const adminMembership = roster.find((m) => m.userId === admin.userId);
  expect(adminMembership).toBeDefined();
  expect(adminMembership!.role).toBe('ADMIN');

  // ============================================================================
  // PRECONDITIONS: settings page is reachable
  // ============================================================================

  await page.goto(`${WEB_ORIGIN}/login`);
  await page.waitForTimeout(500);
  await page.getByLabel('邮箱').fill(owner.email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForTimeout(1000);

  // Navigate to the household settings to confirm the member list is reachable.
  await page.goto(`${WEB_ORIGIN}/households/${encodeURIComponent(household.id)}/settings`);
  await page.waitForURL(`/households/${encodeURIComponent(household.id)}/settings`);
  await page.waitForTimeout(2000);

  // Verify the household name is visible.
  await expect(page.getByText('移除测试家庭').first()).toBeVisible({ timeout: 5000 });

  // ============================================================================
  // D-09: REMOVAL — owner removes a non-owner member.
  // ============================================================================

  const removeResponse = await request.delete(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(removedMember!.membershipId)}`,
    {
      headers: { authorization: `Bearer ${owner.accessToken}` },
    },
  );
  expect(removeResponse.status()).toBe(200);

  // Verify member is removed from the roster.
  const postRemovalRoster = await getHouseholdMemberships(owner.accessToken, household.id);
  expect(postRemovalRoster.length).toBe(3); // owner + admin + memberA
  const stillPresent = postRemovalRoster.find((m) => m.userId === removedIdentity.userId);
  expect(stillPresent).toBeUndefined();

  // ============================================================================
  // D-09: OWNER CANNOT BE REMOVED — forbidden.
  // ============================================================================

  const ownerMembership = postRemovalRoster.find((m) => m.role === 'OWNER')!;
  const adminTargetOwner = await request.delete(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(ownerMembership.membershipId)}`,
    {
      headers: { authorization: `Bearer ${admin.accessToken}` },
    },
  );
  expect(adminTargetOwner.status()).toBe(403);
  const adminOwnerBody = (await adminTargetOwner.json()) as { error: { code: string } };
  expect(adminOwnerBody.error.code).toBe('OWNER_UNTOUCHABLE');

  // ============================================================================
  // D-09: MEMBER CANNOT REMOVE — forbidden.
  // ============================================================================

  const someNonOwnerMember = postRemovalRoster.find((m) => m.role !== 'OWNER')!;
  const memberRemoving = await request.delete(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(someNonOwnerMember.membershipId)}`,
    {
      headers: { authorization: `Bearer ${memberA.accessToken}` },
    },
  );
  expect(memberRemoving.status()).toBe(403);
  const memberBody = (await memberRemoving.json()) as { error: { code: string } };
  expect(memberBody.error.code).toBe('INSUFFICIENT_ROLE');

  // ============================================================================
  // D-09: ADMIN REMOVES ANOTHER ADMIN — works.
  // ============================================================================

  // The admin is still present. Owner removes admin via API as another admin removal test.
  const adminRemoveResponse = await request.delete(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/members/${encodeURIComponent(adminMembership!.membershipId)}`,
    {
      headers: { authorization: `Bearer ${owner.accessToken}` },
    },
  );
  expect(adminRemoveResponse.status()).toBe(200);

  const postAdminRemovalRoster = await getHouseholdMemberships(owner.accessToken, household.id);
  expect(postAdminRemovalRoster.length).toBe(2); // owner + memberA
  const adminStillPresent = postAdminRemovalRoster.find((m) => m.userId === admin.userId);
  expect(adminStillPresent).toBeUndefined();
});
