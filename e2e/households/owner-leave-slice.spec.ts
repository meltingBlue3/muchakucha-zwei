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
    const email = `leave-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

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

test('owner hands off and leaves', async ({ page, request }) => {
  test.setTimeout(120_000);

  // ============================================================================
  // PRECONDITIONS: accounts, household, and member fixtures are healthy
  // ============================================================================

  const owner = await prepareVerifiedAccount('owner', '家主');
  const successor = await prepareVerifiedAccount('successor', '继任者');
  const bystander = await prepareVerifiedAccount('bystander', '旁观者');

  const household = await createHousehold(owner.accessToken, '所有权交接测试家庭');

  // Add successor and bystander members via DB.
  await addMembershipViaDb(household.id, successor.userId, 'MEMBER');
  await addMembershipViaDb(household.id, bystander.userId, 'MEMBER');

  // Verify roster is authoritative.
  let roster = await getHouseholdMemberships(owner.accessToken, household.id);
  expect(roster.length).toBe(3); // owner + successor + bystander

  const ownerMembership = roster.find((m) => m.userId === owner.userId);
  expect(ownerMembership).toBeDefined();
  expect(ownerMembership!.role).toBe('OWNER');

  const successorMembership = roster.find((m) => m.userId === successor.userId);
  expect(successorMembership).toBeDefined();
  expect(successorMembership!.role).toBe('MEMBER');

  // ============================================================================
  // PRECONDITION: owner pointer is verified via the household DTO
  // ============================================================================

  const householdResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}`,
    { headers: { authorization: `Bearer ${owner.accessToken}` } },
  );
  expect(householdResponse.status()).toBe(200);
  const householdBody = (await householdResponse.json()) as {
    id: string;
    name: string;
    ownerMembershipId: string;
  };
  expect(householdBody.ownerMembershipId).toBe(ownerMembership!.membershipId);

  // ============================================================================
  // PRECONDITION: settings page is reachable
  // ============================================================================

  await page.goto(`${WEB_ORIGIN}/login`);
  await page.waitForTimeout(500);
  await page.getByLabel('邮箱').fill(owner.email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForTimeout(1000);

  await page.goto(`${WEB_ORIGIN}/households/${encodeURIComponent(household.id)}/settings`);
  await page.waitForURL(`/households/${encodeURIComponent(household.id)}/settings`);
  await page.waitForTimeout(2000);

  await expect(page.getByText('所有权交接测试家庭').first()).toBeVisible({ timeout: 5000 });

  // ============================================================================
  // GREEN: D-11 owner leaves and hands off to successor.
  // ============================================================================

  const leaveResponse = await request.post(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/ownership/leave`,
    {
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        'content-type': 'application/json',
      },
      data: { successorMembershipId: successorMembership!.membershipId },
    },
  );
  expect(leaveResponse.status()).toBe(204);

  // ============================================================================
  // D-11: Verify successor is now the owner.
  // ============================================================================

  const verifyResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}`,
    { headers: { authorization: `Bearer ${successor.accessToken}` } },
  );
  expect(verifyResponse.status()).toBe(200);
  const verifyBody = (await verifyResponse.json()) as {
    ownerMembershipId: string;
    members: Array<{ membershipId: string; userId: string; role: string }>;
  };
  // Owner pointer now points to successor.
  expect(verifyBody.ownerMembershipId).toBe(successorMembership!.membershipId);
  // Exactly one OWNER exists (the successor).
  const owners = verifyBody.members.filter((m) => m.role === 'OWNER');
  expect(owners.length).toBe(1);
  expect(owners[0].userId).toBe(successor.userId);

  // ============================================================================
  // D-11/D-12: Former owner (now non-member) cannot access the household.
  // ============================================================================

  const formerOwnerResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}`,
    { headers: { authorization: `Bearer ${owner.accessToken}` } },
  );
  expect(formerOwnerResponse.status()).toBe(404);

  // ============================================================================
  // D-11: Non-owner cannot leave as owner.
  // ============================================================================

  // Bystander (MEMBER) cannot leave as owner.
  const bystanderLeaveResponse = await request.post(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/ownership/leave`,
    {
      headers: {
        authorization: `Bearer ${bystander.accessToken}`,
        'content-type': 'application/json',
      },
      data: { successorMembershipId: successorMembership!.membershipId },
    },
  );
  expect(bystanderLeaveResponse.status()).toBe(403);
  const bystanderBody = (await bystanderLeaveResponse.json()) as { error: { code: string } };
  expect(bystanderBody.error.code).toBe('NOT_OWNER');

  // ============================================================================
  // D-11: Owner pointer unchanged after failed leave attempt by non-owner.
  // ============================================================================

  // Verify the household state is unchanged after bystander's failed attempt.
  const finalVerifyResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}`,
    { headers: { authorization: `Bearer ${successor.accessToken}` } },
  );
  expect(finalVerifyResponse.status()).toBe(200);
  const finalBody = (await finalVerifyResponse.json()) as {
    ownerMembershipId: string;
    members: Array<{ membershipId: string; userId: string; role: string }>;
  };
  // Owner pointer still points to successor.
  expect(finalBody.ownerMembershipId).toBe(successorMembership!.membershipId);
  // Exactly one OWNER exists.
  const finalOwners = finalBody.members.filter((m) => m.role === 'OWNER');
  expect(finalOwners.length).toBe(1);
});
